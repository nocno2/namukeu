# Gemini Discord Relay

> Discord-to-Gemini CLI relay - Claude Discord relay의 experimental 대안.

## Architecture (Claude와 동일)

- **Entry:** `src/index.ts` - 설정 검증, lock 파일, bot起動
- **Bot:** `src/bot.ts` - discord.js handlers, slash commands
- **Settings API:** `src/settings-api.ts` - 채널 엔진 설정 HTTP API (port 8090)
- **Claude/Gemini Runner:** `src/claude.ts` - @namukeu/agent-core를 통한 통합 인터페이스
- **Session:** `src/session.ts` - 채널 ID 기반 세션 추적
- **Memory:** `src/memory.ts` - 로컬 JSON facts/goals (REMEMBER/GOAL/DONE 태그)
- **Message:** `src/message.ts` - 응답 청킹 (1900자), Discord Markdown
- **Queue:** `src/queue.ts` - 채널별 순차 메시지 처리
- **DB:** `src/db.ts` - SQLite 메시지 기록 (WAL mode)
- **Scheduler:** `src/scheduler.ts` - cron 스타일 예약 작업 실행
- **Runtime:** Bun

## Claude와의 차이점

| Feature | Claude | Gemini |
|---------|--------|--------|
| Session ID | UUID 기반 (`--session-id`) | 미지원 |
| Resume | `--resume <session_id>` | `--resume latest` |
| 비용 추적 | USD (`total_cost_usd`) | 토큰만 |
| 채널별 엔진 | 지원 | 지원 |

## 채널 엔진 설정

설정 방법:
- **Dashboard:** Agent Engine 패널 - 채널 ID 입력 - 엔진 선택
- **API:** `http://localhost:8090/settings/{channelId}`
- **DB:** messages.db의 channel_settings 테이블

## Commands

| Command | Description |
|---------|-------------|
| `bun run start` | Bot 시작 |
| `bun run dev` | Watch 모드로 시작 |
| `bun run register` | Discord에 slash commands 등록 |

## Bot Activation

- **@mention**: 채널에서 bot 멘션
- **DM**: bot에게 직접 메시지

## Bot Commands (Slash)

- `/reset` - 세션 초기화
- `/status` - 세션 정보, memory 통계, uptime 표시
- `/memory` - 저장된 facts와 goals 표시
- `/forget` - 모든 memory 삭제
- `/history [count]` - 최근 대화 기록
- `/search <query>` - 과거 메시지 검색
- `/coin` - coin-auto-trade 서버 요약 정보 조회
- `/schedule list` - 예약 작업 목록
- `/schedule add <name> <interval> <prompt> [channel]` - 새 예약 작업 추가
- `/schedule remove <id>` - 예약 작업 삭제
- `/schedule toggle <id>` - 예약 작업 활성화/비활성화

## 사용처

Gemini는 직접 대체제가 아님 - 다음에 사용:
- Gemini 기능 테스트
- 비용 민감한 작업 (토큰 vs USD)
- 채널별 빠른 실험

Claude/Gemini 전환:
- **기본:** 모든 채널은 기본 엔진 사용
- **채널별:** 특정 채널만 다른 엔진 사용

## Known Limitations

1. **세션 미보존** - 특정 대화를 ID로 재개 불가
2. **토큰 기반 비용** - USD 없이 토큰 수만
3. **모델 가용성** - Google API 접근에 의존
4. **세션 연속성** - Gemini 세션은 채널별이 아닌 프로젝트별
