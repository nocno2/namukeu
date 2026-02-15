/**
 * Register bot commands with Telegram API.
 * Replaces all existing commands (including old OpenClaw ones).
 *
 * Usage: bun run scripts/register-commands.ts
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN not set");
  process.exit(1);
}

const commands = [
  { command: "reset", description: "세션 초기화 — 새 대화 시작" },
  { command: "status", description: "봇 상태 확인" },
  { command: "memory", description: "저장된 기억 보기" },
  { command: "forget", description: "모든 기억 삭제" },
  { command: "history", description: "최근 대화 내역" },
  { command: "search", description: "메시지 검색" },
  { command: "tasks", description: "자율 태스크 목록" },
  { command: "cancel", description: "태스크 취소" },
  { command: "pending", description: "승인 대기 태스크 보기" },
  { command: "approve", description: "태스크 승인" },
  { command: "approve_all", description: "대기 태스크 전체 승인" },
  { command: "goals", description: "프로젝트 목표 보기" },
  { command: "monitors", description: "서비스 모니터 상태" },
  { command: "idle_on", description: "자율 탐색 활성화" },
  { command: "idle_off", description: "자율 탐색 비활성화" },
  { command: "chain_on", description: "작업 연쇄 활성화" },
  { command: "chain_off", description: "작업 연쇄 비활성화" },
  { command: "stop", description: "에이전트 긴급 중지" },
  { command: "resume_agent", description: "에이전트 재개" },
  { command: "forbidden", description: "금지 동작 목록" },
];

async function register() {
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands }),
    });
    const data = await res.json();

    if (data.ok) {
      console.log(`Commands registered successfully (${commands.length} commands)`);
      return;
    }

    if (data.parameters?.retry_after) {
      const wait = data.parameters.retry_after;
      console.log(`Rate limited. Waiting ${wait}s...`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }

    console.error("Failed:", data);
    process.exit(1);
  }
  console.error("Max retries exceeded");
  process.exit(1);
}

register();
