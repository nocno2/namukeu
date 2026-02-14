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
