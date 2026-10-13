export class SaveQueue<T> {
  private pending: { value: T } | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly write: (value: T) => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {}

  schedule(value: T): void {
    this.pending = { value };
    if (!this.running) this.running = this.drain();
  }

  async flush(): Promise<void> {
    while (this.running) await this.running;
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending) {
        const { value } = this.pending;
        this.pending = null;
        try {
          await this.write(value);
        } catch (error) {
          this.onError(error);
        }
      }
    } finally {
      this.running = null;
    }
  }
}
