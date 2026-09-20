/**
 * Make the floor match reality.
 *
 * Three separate bugs turned out to be one: the renderer's idea of who is on the
 * floor can be lost — a crash, a cleared origin, a roster written before an
 * agent existed — while the hive registry and the running terminals are
 * untouched. Each path that noticed handled it differently and all three failed
 * the same way, silently:
 *
 *   - the orchestrator's boot saw its terminal alive and "kept the restored
 *     entry", of which there was none, so Atlas ran with no card;
 *   - restore saw "already exists", dropped the agent from the restorable list
 *     and returned nothing, so a live agent got no card either;
 *   - a boot-time sweep archived everyone without a terminal, which after a
 *     crash was everyone.
 *
 * So the question is asked once, here, and answered from the two sources that
 * survive: what the HIVE says exists, and what is actually RUNNING. Pure, so the
 * answer is testable without a floor, a registry or a process.
 */

export interface RegistryView {
  id: string;
  archived?: boolean;
  isGod?: boolean;
}

export interface FloorPlan<T extends RegistryView> {
  /** Has a live terminal but no card: adopt it AS RUNNING, wired to that pty. */
  adoptLive: T[];
  /** No card and no terminal: hand to restore, which spawns it with its own id. */
  adoptRestorable: T[];
  /** The renderer remembers it, the hive does not, and nothing is running under
   *  its name: it was deleted. Drop it.
   *
   *  Without this the registry is authoritative for what EXISTS only in one
   *  direction — it can put an agent back, but never take one away — so a
   *  deleted agent was resurrected from the browser's own copy on the next
   *  load, and re-registered itself on respawn. Deleting had to be done in
   *  every place at once or it did not happen at all. */
  drop: string[];
}

/**
 * @param registry  every agent the hive knows about
 * @param livePtyIds  pty ids currently running (`pty-<agentId>`, and the god's)
 * @param known  agent ids the renderer already has a card for
 * @param ptyIdFor  how an agent id becomes a pty id in this app
 */
export function planFloor<T extends RegistryView>(
  registry: readonly T[],
  livePtyIds: readonly string[],
  known: ReadonlySet<string>,
  ptyIdFor: (agentId: string) => string
): FloorPlan<T> {
  const live = new Set(livePtyIds);
  const plan: FloorPlan<T> = { adoptLive: [], adoptRestorable: [], drop: [] };
  const inRegistry = new Set(registry.map((e) => e.id));

  // Gone from the hive, and nothing running under its name. A live terminal is
  // the one thing that stays its own evidence: an agent mid-spawn is not yet in
  // the registry and must not be swept away by this.
  for (const id of known) {
    if (inRegistry.has(id)) continue;
    if (live.has(ptyIdFor(id))) continue;
    plan.drop.push(id);
  }

  for (const entry of registry) {
    // Archived is the human's decision, and the only thing that removes an
    // agent from the floor. Never undo it here.
    if (entry.archived) continue;
    if (known.has(entry.id)) continue;
    if (live.has(ptyIdFor(entry.id))) plan.adoptLive.push(entry);
    else plan.adoptRestorable.push(entry);
  }
  return plan;
}
