# Claude Discord Relay

> Discord-to-Claude Code relay with native session persistence and multi-channel support.

## Architecture

- **Entry:** `src/index.ts` — config validation, lock file, bot startup
- **Bot:** `src/bot.ts` — discord.js handlers (messages/attachments), slash commands, auth
- **Commands:** `src/register-commands.ts` — slash command registration with Discord API
- **Claude:** `src/claude.ts` — CLI process spawn with `--session-id`/`--resume`, stream-json parsing
- **Session:** `src/session.ts` — UUID v5 from channel ID, generation counter for /reset
- **Memory:** `src/memory.ts` — local JSON facts/goals with REMEMBER/GOAL/DONE tags
- **Message:** `src/message.ts` — response chunking (1900 char), Discord Markdown
- **Queue:** `src/queue.ts` — per-channel sequential message processing
- **DB:** `src/db.ts` — SQLite message history with WAL mode
- **Runtime:** Bun
- **Dependency:** discord.js only

## Commands

| Command | Description |
|---------|-------------|
| `bun run start` | Start the relay bot |
| `bun run dev` | Start with watch mode |
| `bun run register` | Register slash commands with Discord |

## Bot Activation

- **@mention**: Mention the bot in any channel message
- **DM**: Send a direct message to the bot

## Bot Commands (Slash)

- `/reset` — Clear session, start fresh conversation
- `/status` — Show session info, memory stats, uptime
- `/memory` — Show stored facts and goals
- `/forget` — Clear all memories
- `/history [count]` — Show recent conversation history
- `/search <query>` — Search past messages
- `/coin` — coin-auto-trade 서버 요약 정보 조회 (상태, 포트폴리오, 포지션, 거래, 전략)

## coin-auto-trade Integration

- `COIN_API_URL` (기본: `http://127.0.0.1:8001`) + `COIN_API_TOKEN` 설정 필요
- `/coin` 커맨드: `/status`, `/trading/positions`, `/trading/orders`, `/strategies/configs`, `/portfolio/summary` API를 병렬 호출하여 Discord 메시지로 포맷팅

## Session Management

- Channel ID → deterministic UUID v5 → `--session-id` (new) or `--resume` (existing)
- Each channel/thread gets an independent session (multi-channel = multi-session)
- Stream-JSON output for reliable session ID extraction
- Auto-fallback: if `--resume` fails, retry with `--session-id`
- `/reset` increments generation counter → new UUID → new session

## Progress Reporting

You are communicating with the user via Discord. The user cannot see your tool calls or intermediate work.
For ANY task that takes more than 2 minutes, you MUST include periodic progress updates using the `[PROGRESS: ...]` tag.

Rules:
- Include a `[PROGRESS: brief status]` tag at least every 2-3 minutes during long tasks
- Describe WHAT you are currently doing, not just "working on it"
- Examples:
  - `[PROGRESS: 프로젝트 구조 분석 중]`
  - `[PROGRESS: API 엔드포인트 3/5개 구현 완료]`
  - `[PROGRESS: 테스트 실행 중 — 2개 실패, 수정 중]`
  - `[PROGRESS: Git push 완료, PR 생성 중]`
- These tags are automatically stripped from the final response and sent as intermediate updates to the user

## train-go Integration

When the user requests train reservations, call the train-go API.
- **Base URL:** `http://127.0.0.1:8000`
- **Auth:** `Authorization: Bearer {TRAIN_GO_API_TOKEN}` (token from `../train-go/.env` API_TOKEN value)
- Parse natural language requests and convert to appropriate API calls
- See `../train-go/CLAUDE.md` for detailed API spec
