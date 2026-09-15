import { businessChanges, pushBusinessState, type CloudState } from "./cloudSync";

/** One writer per mounted tenant. A failed batch remains pending for retry. */
export class CloudSaveQueue {
  private acknowledged: CloudState;
  private desired: CloudState;
  private running: Promise<void> | null = null;
  private stopped = false;
  private retryTarget: CloudState | null = null;

  constructor(
    readonly businessId: string,
    initial: CloudState,
    private readonly status: (state: "syncing" | "synced" | "error") => void,
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

  stop() { this.stopped = true; }

  flush(): Promise<void> {
    if (this.stopped) return Promise.reject(new Error("Workspace session ended."));
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
        // Advance only after confirmation. Ambiguous network failures retry
        // the same stable IDs against the same originals; the RPC is idempotent.
        this.acknowledged = await this.push(this.businessId, target, this.acknowledged);
        this.retryTarget = null;
      }
      if (!this.stopped) this.status("synced");
    } catch (error) {
      if (!this.stopped) this.status("error");
      throw error;
    }
  }
}
