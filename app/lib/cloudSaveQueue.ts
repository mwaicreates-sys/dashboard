import { businessChanges, pushBusinessState, ConflictError, type CloudState } from "./cloudSync";

/** One writer per mounted tenant. A failed batch remains pending for retry —
 *  UNLESS the rejection was a stale-row conflict (ConflictError), in which
 *  case retrying the identical snapshot against the identical (now stale)
 *  `acknowledged` baseline can never succeed: the server already told us
 *  this exact write is invalid. Phase 3 fix: such a conflict is terminal
 *  for this queue instance — `flush()` rejects immediately from then on,
 *  rather than looping forever on a write that will always be refused.
 *  Recovery requires a fresh hydration (reload), matching the RPC's own
 *  guidance ("Reload before editing it."). This is a deliberate choice not
 *  to auto-reconcile: merging concurrent edits automatically cannot be
 *  proven safe in general, so we fail visibly instead of risking silent
 *  financial-data corruption. */
export class CloudSaveQueue {
  private acknowledged: CloudState;
  private desired: CloudState;
  private running: Promise<void> | null = null;
  private stopped = false;
  private retryTarget: CloudState | null = null;
  private conflicted = false;

  constructor(
    readonly businessId: string,
    initial: CloudState,
    private readonly status: (state: "syncing" | "synced" | "error" | "conflict") => void,
    private readonly push = pushBusinessState,
  ) {
    if (!initial.cloudRows) throw new Error("Cloud hydration is required.");
    this.acknowledged = initial;
    this.desired = initial;
  }

  observe(state: CloudState) { this.desired = state; }

  get pending() {
    return this.retryTarget !== null || businessChanges(this.businessId, this.acknowledged, this.desired).length > 0;
  }

  /** True once a stale-row conflict has made this queue instance terminal. */
  get isConflicted() { return this.conflicted; }

  stop() { this.stopped = true; }

  flush(): Promise<void> {
    if (this.stopped) return Promise.reject(new Error("Workspace session ended."));
    if (this.conflicted) {
      return Promise.reject(new ConflictError("This workspace changed elsewhere. Reload to continue."));
    }
    if (this.running) return this.running;
    if (!this.pending) return Promise.resolve();
    this.running = this.drain().finally(() => { this.running = null; });
    return this.running;
  }

  private async drain() {
    try {
      while (this.retryTarget || this.pending) {
        if (this.stopped) throw new Error("Workspace session ended.");
        this.status("syncing");
        const target = this.retryTarget ?? this.desired;
        this.retryTarget = target;
        try {
          // Advance only after confirmation. Ambiguous network failures
          // retry the same stable IDs against the same originals; the RPC
          // is idempotent.
          this.acknowledged = await this.push(this.businessId, target, this.acknowledged);
        } catch (error) {
          if (error instanceof ConflictError) {
            // Stop looping on this exact rejected write — see class comment.
            this.conflicted = true;
            this.retryTarget = null;
            this.status("conflict");
            throw error;
          }
          throw error;
        }
        this.retryTarget = null;
      }
      if (!this.stopped) this.status("synced");
    } catch (error) {
      if (!this.stopped && !this.conflicted) this.status("error");
      throw error;
    }
  }
}
