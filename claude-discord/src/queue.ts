interface QueuedItem {
  task: () => Promise<void>;
  enqueuedAt: number;
}

const STALE_THRESHOLD_MS = 5 * 60_000; // 5분 이상 대기한 메시지는 스킵

/**
 * Per-channel message queue ensuring only one Claude CLI process
 * runs at a time per channel. Prevents session file conflicts.
 *
 * 오래 대기한 메시지는 자동 스킵하여 응답 폭발 방지.
 */
export class MessageQueue {
  private queues: Map<string, QueuedItem[]> = new Map();
  private processing: Map<string, boolean> = new Map();

  async enqueue(channelId: string, task: () => Promise<void>): Promise<void> {
    if (!this.queues.has(channelId)) {
      this.queues.set(channelId, []);
    }
    this.queues.get(channelId)!.push({ task, enqueuedAt: Date.now() });

    if (!this.processing.get(channelId)) {
      await this.processQueue(channelId);
    }
  }

  private async processQueue(channelId: string): Promise<void> {
    this.processing.set(channelId, true);
    const queue = this.queues.get(channelId)!;

    while (queue.length > 0) {
      const item = queue.shift()!;
      const waited = Date.now() - item.enqueuedAt;

      if (waited > STALE_THRESHOLD_MS) {
        console.log(`[queue] Skipping stale message in ${channelId} (waited ${Math.floor(waited / 1000)}s)`);
        continue;
      }

      try {
        await item.task();
      } catch (err) {
        console.error(`Queue task error for channel ${channelId}:`, err);
      }
    }

    this.processing.set(channelId, false);
  }

  isProcessing(channelId: string): boolean {
    return this.processing.get(channelId) || false;
  }

  /** 채널의 대기 중인 메시지 수 */
  pendingCount(channelId: string): number {
    return this.queues.get(channelId)?.length || 0;
  }
}
