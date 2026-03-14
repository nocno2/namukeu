# Gemini Telegram Relay

> Telegram-to-Gemini CLI relay - Claude Telegram relay의 experimental 대안.

## Architecture (Claude와 동일)

- **Entry:** `src/index.ts` - 설정 검증, lock 파일, bot起動
- **Bot:** `src/bot.ts` - grammY handlers (text/photo/document), commands, auth
- **Gemini:** `src/claude.ts` - Gemini CLI spawn, JSON output 파싱
- **Session:** `src/session.ts` - Gemini는 `--resume latest` 사용, 커스텀 세션 ID 미지원
- **Memory:** `src/memory.ts` - 로컬 JSON facts/goals (REMEMBER/GOAL/DONE 태그)
- **Message:** `src/message.ts` - 응답 청킹 (4000자), Markdown 폴백
- **Queue:** `src/queue.ts` - 채팅별 순차 메시지 처리
- **Runtime:** Bun
- **Dependency:** grammy, gemini CLI

## Claude와의 차이점

| Feature | Claude | Gemini |
|---------|--------|--------|
| Session ID | UUID 기반 (`--session-id`) | UUID 자동 생성 캡처 |
| Resume | `--resume <session_id>` | `--resume <session_id>` |
| 비용 추적 | USD (`total_cost_usd`) | 토큰만 (`tokens`) |
| 모델 선택 | `--model` | `--model` |

## Commands

| Command | Description |
|---------|-------------|
| `bun run start` | Bot 시작 |
| `bun run dev` | Watch 모드로 시작 |

## Bot Commands

- `/reset` - 세션 초기화
- `/status` - 세션 정보, memory 통계, uptime 표시
- `/memory` - 저장된 facts와 goals 표시
- `/forget` - 모든 memory 삭제

## 프로젝트 컨텍스트

텔레그램은 단일 채팅이므로 채널별 프로젝트 구분이 없다. 대신 세션 시작 시 모노레포 전체 프로젝트 목록이 시스템 프롬프트에 주입된다.

- COIN (coin-auto-trade/): Upbit 자동매매 서버
- BLOG (ai-blog/): 수익형 블로그
- DASH (dashboard/): 개인 대시보드
- TRAIN (train-go/): SRT/Korail 자동예매 서버
- TGBOT (claude-telegram/): Claude 텔레그램 봇
- DCBOT (claude-discord/): Discord 봇

대화 내용에서 관련 프로젝트를 추론하여 대응한다. 세션이 초기화되어도 프로젝트 컨텍스트는 항상 유지된다.

## Session Management

- 봇이 CLI에서 자동 생성된 세션 UUID를 캡처하여 추적
- `--resume <session_id>`로 채널/채팅별 독립된 대화 재개
- 채팅이 처음이면 새 세션 시작

## Progress Reporting

장시간 작업에는 `[PROGRESS: ...]` 태그 사용 (Claude와 동일).

## 사용처

Gemini는 직접 대체제가 아님 - 다음에 사용:
- Gemini 기능 테스트
- 비용 민감한 작업 (토큰 vs USD)
- 빠른 실험

Claude/Gemini 전환: 환경변수(`AGENT_ENGINE`) 또는 dashboard에서 가능.

## Known Limitations

1. **토큰 기반 비용** - USD 없이 토큰 수만
2. **모델 가용성** - Google API 접근에 의존; `ModelNotFoundError` 발생 가능
3. **프로젝트 컨텍스트** - Claude와 동일하지만 동작은 다를 수 있음
