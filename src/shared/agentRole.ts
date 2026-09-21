import { DEFAULT_GOD_NAME } from './godIdentity';
/**
 * Durable agent role vs live status.
 *
 * Hive `registry.json` stores `role` (job / hire one-liner). The floor roster
 * stores the same string as `description`. Live run-state belongs on
 * `status` / `action` — never on role. Pause, idle, and Cursor "standby"
 * captions are status, not a job.
 */

const TRANSIENT_ROLE_RE = /^(on\s+)?standby$|^(idle|awaiting|paused|resumed|working|thinking|archived|starting up|reconnecting…?|running the floor|a fresh harness)$/i;

/**
 * Captions this app used to write and no longer should.
 *
 * "orchestrator (god)" leaked an internal id into the one line agents read off
 * the roster, and one of them started calling the orchestrator God to the
 * human. Removing it from the code was not enough: it is stored in every
 * existing registry and on every existing floor card, and the spawn copies the
 * card's description into the registry — so it wrote itself back on the next
 * restart. Treated as empty here, it is replaced by the current default the
 * first time an agent respawns, with nobody editing a JSON file.
 */
const RETIRED_ROLES = new Set(['orchestrator (god)']);

/** A stored role, or undefined when it is one we have retired. */
export function liveRole(text: string | undefined | null): string | undefined {
  const value = (text ?? '').trim();
  return value && !RETIRED_ROLES.has(value.toLowerCase()) ? value : undefined;
}

export function isDurableRole(text: string | undefined | null): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  return !TRANSIENT_ROLE_RE.test(value);
}

/**
 * Pick the job string that should survive a respawn or roster/registry sync.
 * A real hire role always beats a status-like caption. When both are durable,
 * `candidate` wins (the value the operator just set).
 */
export function preferredAgentRole(
  candidate: string | undefined | null,
  fallback: string | undefined | null,
  isGod = false
): string {
  const incoming = liveRole(candidate) ?? '';
  const existing = liveRole(fallback) ?? '';
  if (isDurableRole(incoming)) return incoming;
  if (isDurableRole(existing)) return existing;
  if (incoming) return incoming;
  if (existing) return existing;
  // "god" is the routing id, never a word the human or another agent reads.
  return isGod ? 'runs the floor' : 'agent';
}

/** Role to send on spawn/restart. Omit a transient roster caption so the hive
 *  registry can keep the last real hire role. */
export function roleForHiveSpawn(agent: {
  description?: string;
  isGod?: boolean;
  isAssistant?: boolean;
}): string | undefined {
  if (agent.isGod) return preferredAgentRole(agent.description, 'runs the floor', true);
  if (agent.isAssistant) {
    return preferredAgentRole(agent.description, `${DEFAULT_GOD_NAME}'s prep assistant`);
  }
  const role = agent.description?.trim();
  return role && isDurableRole(role) ? role : undefined;
}
