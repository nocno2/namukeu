# namukeu 모노레포

## 프로젝트 구조

| 코드네임 | 디렉토리 | 설명 | 스택 |
|----------|----------|------|------|
| `COIN` | `coin-auto-trade/` | Upbit 자동매매 서버 | Python FastAPI :8001 |
| `TRAIN` | `train-go/` | SRT/Korail 자동예매 서버 | Python FastAPI :8000 |
| `TGBOT` | `claude-telegram/` | Telegram 릴레이 봇 | Bun + grammY |
| `DCBOT` | `claude-discord/` | Discord 릴레이 봇 | Bun + discord.js |
| `BLOG` | `ai-blog/` | 수익형 블로그 | Next.js + Bun :3100 |
| `DASH` | `dashboard/` | 개인 대시보드 | React + FastAPI :8002 |

## 커밋 컨벤션

### 형식
```
[코드네임-이슈번호] 커밋 메시지
```

### 규칙
- **대괄호 필수**: 모든 커밋은 `[코드네임]` 또는 `[코드네임-123]` 으로 시작
- **코드네임**: 위 표의 코드네임 사용 (COIN, TRAIN, TGBOT, DCBOT, BLOG, DASH)
- **이슈번호**: 관련 이슈가 있으면 `-` 뒤에 번호 추가 (없으면 생략)
- **여러 프로젝트**: 여러 프로젝트에 걸친 변경은 `[MONO]` 사용
- **메시지**: 한글 또는 영어, 명령형으로 작성

### 예시
```
[COIN-12] RSI 전략 백테스트 결과 저장 기능 추가
[TRAIN] 예약 실패 시 재시도 로직 개선
[DASH-3] 서비스 카드 클릭 시 커밋 목록 표시
[TGBOT] 세션 타임아웃 30분으로 변경
[MONO] 루트 CLAUDE.md에 커밋 컨벤션 추가
```

## 공통 규칙
- 각 프로젝트의 세부 가이드는 해당 디렉토리의 `CLAUDE.md` 참고
- `.env` 파일, DB 파일, `node_modules/`, `.venv/` 등은 절대 커밋하지 않음
- Python 프로젝트는 Python 3.12 사용 (`/Users/namwook/.local/bin/python3.12`)

## 작업 완료 보고
작업이 끝나면 반드시 사용자에게 다음 형식으로 마무리 보고를 한다:

1. **변경 요약** — 무엇을 했는지 한 줄 요약
2. **수정/생성 파일 목록** — 테이블로 파일 경로와 변경 내용 정리
3. **검증 결과** — 서버 시작, 테스트 통과, API 응답 등 확인한 항목
4. **주의사항** (있으면) — 알려야 할 사이드이펙트, 후속 작업, 알려진 제한 등
