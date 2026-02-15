# Claude Telegram Relay v2

> Telegram-to-Claude Code relay with native session persistence.

## Architecture

- **Entry:** `src/index.ts` — config validation, lock file, bot startup
- **Bot:** `src/bot.ts` — grammY handlers (text/photo/document), commands, auth
- **Claude:** `src/claude.ts` — CLI process spawn with `--session-id`/`--resume`, JSON output parsing
- **Session:** `src/session.ts` — UUID v5 from chat ID, generation counter for `/reset`
- **Memory:** `src/memory.ts` — local JSON facts/goals with REMEMBER/GOAL/DONE tags
- **Message:** `src/message.ts` — response chunking (4000 char), Markdown fallback
- **Queue:** `src/queue.ts` — per-chat sequential message processing
- **Runtime:** Bun
- **Dependency:** grammy only (no Supabase, no OpenAI)

## Commands

| Command | Description |
|---------|-------------|
| `bun run start` | Start the relay bot |
| `bun run dev` | Start with watch mode |

## Bot Commands

- `/reset` — Clear session, start fresh conversation
- `/status` — Show session info, memory stats, uptime
- `/memory` — Show stored facts and goals
- `/forget` — Clear all memories

## Session Management

- Chat ID → deterministic UUID v5 → `--session-id` (new) or `--resume` (existing)
- JSON output (`--output-format json`) for reliable session ID extraction
- Auto-fallback: if `--resume` fails, retry with `--session-id`
- `/reset` increments generation counter → new UUID → new session

## Progress Reporting

You are communicating with the user via Telegram. The user cannot see your tool calls or intermediate work.
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

## train-go 연동

사용자가 기차 예약을 요청하면 train-go API를 호출한다.
- **Base URL:** `http://127.0.0.1:8000`
- **인증:** `Authorization: Bearer {TRAIN_GO_API_TOKEN}` (토큰은 `../train-go/.env`의 API_TOKEN 값)
- 자연어 요청을 파싱하여 적절한 API 호출로 변환
- 예약 상태 조회 시 `GET /reservations` 호출
- 상세 API 명세는 `../train-go/CLAUDE.md` 참조

## Planned Features

- **대화 내역 저장:** 텔레그램 대화를 로컬 DB에 저장하여 조회 가능하도록 구현 예정
