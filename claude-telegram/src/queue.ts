type QueuedTask = () => Promise<void>;

/**
 * Per-chat message queue ensuring only one Claude CLI process
 * runs at a time per chat. Prevents session file conflicts.
 */
export class MessageQueue {
  private queues: Map<number, QueuedTask[]> = new Map();
  private processing: Map<number, boolean> = new Map();

  async enqueue(chatId: number, task: QueuedTask): Promise<void> {
    if (!this.queues.has(chatId)) {
      this.queues.set(chatId, []);
    }
    this.queues.get(chatId)!.push(task);

    if (!this.processing.get(chatId)) {
      await this.processQueue(chatId);
    }
  }

  private async processQueue(chatId: number): Promise<void> {
    this.processing.set(chatId, true);
    const queue = this.queues.get(chatId)!;

    while (queue.length > 0) {
      const task = queue.shift()!;
      try {
        await task();
      } catch (err) {
        console.error(`Queue task error for chat ${chatId}:`, err);
      }
    }

    this.processing.set(chatId, false);
  }

  isProcessing(chatId: number): boolean {
    return this.processing.get(chatId) || false;
  }
}
