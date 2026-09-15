import { useRestoreTeam } from '@/hooks/useRestoreTeam';
import type { HarnessConfig } from '@/store/config';

/**
 * Brings back agents whose terminal did not survive. Draws nothing.
 *
 * When a PTY is gone — the app quit, the laptop slept, the renderer reloaded —
 * `reconcileWithLivePtys` moves those agents into `restorableAgents` rather than
 * deleting them, keeping the full spawn recipe, and `useRestoreTeam` respawns
 * them 2.5 seconds after boot.
 *
 * That automatic restore is an EFFECT INSIDE A HOOK, so it only runs while
 * something has the hook mounted. For a long time the only two mounts were
 * AgentStrip, which stopped being rendered when the left panel was redesigned,
 * and FullscreenTerminal, which exists only in focus mode — so outside focus
 * mode a dead agent stayed dead while its recipe sat in localStorage.
 *
 * This component exists to hold that mount somewhere no view can take away. It
 * has no UI on purpose: the restore happens on its own, and the agents coming
 * back IS the outcome.
 */
export function RestoreTeamOnBoot({ config }: { config: HarnessConfig | null }) {
  useRestoreTeam(config);
  return null;
}
