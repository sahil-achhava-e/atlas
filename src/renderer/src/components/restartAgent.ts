/**
 * Restart one agent's process in place, optionally resuming its conversation and
 * switching its model. Used by "Restart & Continue" and by Edit agent's
 * "Save & restart".
 *
 * It lives outside any panel on purpose. It used to sit inside the Command
 * Center's Floor tab, and Edit agent asked for it with a window event, so a Save
 * & restart pressed anywhere else (the agent's own panel, focus mode, another
 * tab) saved the new model and restarted nothing. App installs the listener once.
 */
import { acquireTerminal, disposeTerminal, resetTerminal } from './terminalPool';
import { roleForHiveSpawn } from '@shared/agentRole';
import { useStore, type Agent } from '@/store/store';
import {
  buildSpawnCommand,
  inferAgentProvider,
  providerPreset,
  tokenizeCommand,
  type AgentProvider
} from '@/store/config';

export async function restartAgent(
  a: Agent,
  model: string | undefined,
  opts: {
    resume?: boolean;
    provider?: AgentProvider;
    /** Resume if we can, start fresh if we can't, instead of refusing.
     *  "Restart & Continue" wants the hard failure — continuing is the entire
     *  point, so silently starting a blank session would be worse than an
     *  error. A model change wants the soft one: the user asked to change
     *  model, and an agent with no recorded session still has to get one. */
    resumeOptional?: boolean;
  } = {}
): Promise<void> {
  if (!a.ptyId) return;
  const { updateAgent } = useStore.getState();
  useStore.setState((s) => ({ restartingId: a.id, restartErrors: { ...s.restartErrors, [a.id]: '' } }));
  try {
    const cfg = await window.cth.getConfig();
    // Respawn on the same CLI this agent already runs on (inferred from its
    // command if not explicitly tagged) so an Antigravity/Codex worker stays
    // on its own binary. tokenizeCommand keeps quoted model labels one arg.
    // opts.provider overrides the inferred provider — used when changing GOD's engine.
    const previousProvider = inferAgentProvider(a.command, a.provider);
    const provider = opts.provider ?? previousProvider;
    let resume = opts.resume === true && provider === previousProvider;
    if (opts.resume && !resume && !opts.resumeOptional) {
      throw new Error('Cannot resume a session through a different provider.');
    }
    let resumeSessionId: string | undefined;
    if (resume) {
      // A precondition miss is fatal for an explicit "continue", and merely
      // means "start fresh" for an opportunistic one (see resumeOptional).
      const giveUpOnResume = (reason: string) => {
        if (!opts.resumeOptional) throw new Error(reason);
        resume = false;
        resumeSessionId = undefined;
      };
      const registry = await window.cth.hiveRegistry();
      resumeSessionId = registry.agents[a.id]?.sessionId;
      if (!resumeSessionId) {
        giveUpOnResume('No recorded session ID; current process was left running.');
      } else if (provider === 'claude' && !(await window.cth.resolveSessionCwd(resumeSessionId))) {
        giveUpOnResume('Session transcript not found; current process was left running.');
      }
    }
    // Capture the live grid before replacing anything. Restart & Continue
    // recreates only this agent's xterm; model changes retain the old
    // in-place reset behavior.
    const oldEntry = acquireTerminal(a.ptyId);
    let cols = oldEntry.term.cols || 100;
    let rows = oldEntry.term.rows || 30;
    try {
      oldEntry.fit.fit();
      cols = oldEntry.term.cols;
      rows = oldEntry.term.rows;
    } catch { /* host not sized yet */ }

    const killed = await window.cth.killPty(a.ptyId);
    // A pty that is ALREADY gone is the state this kill was trying to reach, so
    // it is not a failure. This is the single most common way to arrive at
    // "Restart & Continue": the session died on its own — a crash, or Ctrl-C
    // twice — main dropped it from the session map, and kill then answers
    // `no pty: <id>`. Treating that as fatal aborted before the respawn and
    // turned the one situation the button exists for into a dead end.
    if (!killed.ok && !/^no pty:/.test(killed.error ?? '')) {
      throw new Error(killed.error ?? 'Could not stop the current process.');
    }
    if (resume) {
      // A blank xterm can retain corrupt renderer/DOM/subscription state even
      // after its PTY is healthy. Throw that one terminal away, acquire its
      // replacement BEFORE spawning (so startup output has a listener), then
      // bump the key so React remounts only this agent's terminal card.
      disposeTerminal(a.ptyId);
      acquireTerminal(a.ptyId);
      updateAgent(a.id, {
        terminalGeneration: (a.terminalGeneration ?? 0) + 1,
        status: 'idle',
        action: 'recreating terminal…'
      });
    } else {
      resetTerminal(a.ptyId);
    }
    const command = buildSpawnCommand(cfg, model, provider);
    const [exe, ...args] = tokenizeCommand(command.trim());
    const hive = {
      id: a.id,
      name: a.name,
      cwd: a.cwd,
      provider,
      isGod: a.isGod,
      isAssistant: a.isAssistant,
      role: roleForHiveSpawn(a)
    };
    const res = await window.cth.spawnPty({
      id: a.ptyId,
      cwd: a.cwd,
      command: exe,
      args,
      provider,
      cols,
      rows,
      hive,
      resume,
      resumeSessionId,
      requireResume: resume
    });
    if (!res.ok) throw new Error(res.error ?? 'Restart failed.');
    if (resume && res.resumed !== true) {
      throw new Error('Resume was refused; no replacement session was accepted.');
    }
    if (res.ok) {
      // Record the model even on a resume. A same-provider model change now
      // RESUMES the session (that is the point — you keep the conversation and
      // just swap the model), so "resume ⇒ the model is unchanged" stopped
      // being true. Skipping the patch left the live process on the new model
      // while the selector and the persisted agent kept the old one, and the
      // next restore relaunched the old command. `command` is rebuilt from the
      // selected model above, so on a genuine no-change restart this is a no-op.
      const patch = resume
        ? {
            command: command.trim(),
            provider,
            model,
            status: 'idle' as const,
            action: 'continuing…'
          }
        : {
            command: command.trim(),
            provider,
            model,
            status: 'idle' as const,
            action: provider === previousProvider ? 'restarting…' : `switching to ${providerPreset(provider).label}…`
          };
      updateAgent(a.id, patch);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[restart] ${a.id}: ${message}`);
    useStore.setState((s) => ({ restartErrors: { ...s.restartErrors, [a.id]: message } }));
  } finally {
    useStore.setState({ restartingId: null });
  }
}

/** Restart whichever agent a `cth:restart-agent` event names, with the model the
 *  store now holds for it. Returns the uninstaller. */
export function installRestartListener(noProcessMessage: string): () => void {
  const onRestart = (e: Event): void => {
    const id = (e as CustomEvent<{ id?: string }>).detail?.id;
    const target = useStore.getState().agents.find((a) => a.id === id);
    if (!target) return;
    // Silence is the wrong answer to a button press: an agent with no live
    // process cannot be restarted, and the row has to say so.
    if (!target.ptyId) {
      useStore.setState((s) => ({ restartErrors: { ...s.restartErrors, [target.id]: noProcessMessage } }));
      return;
    }
    // resumeOptional: the user asked for a model change, so an agent with no
    // recorded session still has to get one rather than refusing.
    void restartAgent(target, target.model, { resume: true, resumeOptional: true });
  };
  window.addEventListener('cth:restart-agent', onRestart);
  return () => window.removeEventListener('cth:restart-agent', onRestart);
}
