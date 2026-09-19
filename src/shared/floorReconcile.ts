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
  const plan: FloorPlan<T> = { adoptLive: [], adoptRestorable: [] };

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
