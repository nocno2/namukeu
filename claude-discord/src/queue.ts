type QueuedTask = () => Promise<void>;

/**
 * Per-channel message queue ensuring only one Claude CLI process
 * runs at a time per channel. Prevents session file conflicts.
 */
export class MessageQueue {
  private queues: Map<string, QueuedTask[]> = new Map();
  private processing: Map<string, boolean> = new Map();

  async enqueue(channelId: string, task: QueuedTask): Promise<void> {
    if (!this.queues.has(channelId)) {
      this.queues.set(channelId, []);
    }
    this.queues.get(channelId)!.push(task);

    if (!this.processing.get(channelId)) {
      await this.processQueue(channelId);
    }
  }

  private async processQueue(channelId: string): Promise<void> {
    this.processing.set(channelId, true);
    const queue = this.queues.get(channelId)!;

    while (queue.length > 0) {
      const task = queue.shift()!;
      try {
        await task();
      } catch (err) {
        console.error(`Queue task error for channel ${channelId}:`, err);
      }
    }

    this.processing.set(channelId, false);
  }

  isProcessing(channelId: string): boolean {
    return this.processing.get(channelId) || false;
  }
}
