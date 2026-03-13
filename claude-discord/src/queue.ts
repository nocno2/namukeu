import type { Message } from "discord.js";

export interface QueuedMessage {
  prompt: string;
  message: Message;
  enqueuedAt: number;
}

/**
 * Per-channel message queue ensuring only one Claude CLI process
 * runs at a time per channel.
 *
 * 대기 중인 메시지가 여러 개면 하나로 합쳐서 Claude에 전달.
 */
export class MessageQueue {
  private queues: Map<string, QueuedMessage[]> = new Map();
  private processing: Map<string, boolean> = new Map();
  private handler: ((channelId: string, items: QueuedMessage[]) => Promise<void>) | null = null;

  /** 메시지 처리 핸들러 등록 */
  onProcess(handler: (channelId: string, items: QueuedMessage[]) => Promise<void>): void {
    this.handler = handler;
  }

  async enqueue(channelId: string, prompt: string, message: Message): Promise<void> {
    if (!this.queues.has(channelId)) {
      this.queues.set(channelId, []);
    }
    this.queues.get(channelId)!.push({ prompt, message, enqueuedAt: Date.now() });

    if (!this.processing.get(channelId)) {
      await this.processQueue(channelId);
    }
  }

  private async processQueue(channelId: string): Promise<void> {
    if (!this.handler) return;

    this.processing.set(channelId, true);
    const queue = this.queues.get(channelId)!;

    while (queue.length > 0) {
      // 대기 중인 메시지를 전부 꺼내서 한 번에 처리
      const items = queue.splice(0, queue.length);

      try {
        await this.handler(channelId, items);
      } catch (err) {
        console.error(`Queue task error for channel ${channelId}:`, err);
      }
    }

    this.processing.set(channelId, false);
  }

  isProcessing(channelId: string): boolean {
    return this.processing.get(channelId) || false;
  }

  pendingCount(channelId: string): number {
    return this.queues.get(channelId)?.length || 0;
  }
}
