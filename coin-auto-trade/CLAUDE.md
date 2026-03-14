# coin-auto-trade (Gemini Edition)

> Upbit 암호화폐 LLM 기반 자율 트레이딩 에이전트. 개인용.

## Architecture

- **Runtime:** Python 3.12
- **Framework:** FastAPI + uvicorn
- **DB:** SQLite (로컬, `data/coin-auto-trade.db`)
- **LLM:** Gemini API (Direct SDK 호출)
- **거래소:** pyupbit (Upbit REST + WebSocket)
- **기술지표:** pandas-ta-classic
- **대시보드:** Jinja2 + HTMX + TradingView lightweight-charts
- **알림:** Telegram Bot API (httpx)

## 멀티 에이전트 시스템

5개의 전문 에이전트가 분석 사이클을 수행:

| 에이전트 | 역할 | 세션 |
|----------|------|------|
| Researcher | 웹 검색으로 뉴스/이벤트 수집 | 1회성 |
| Technician | 차트 데이터 기술적 분석 | 1회성 |
| Strategist | 종합 판단 → 매수/매도 결정 | 연속 세션 |
| Risk Manager | 거래 제안 검증 (APPROVE/ADJUST/REJECT) | 1회성 |
| Reporter | 텔레그램 보고서 생성 | 1회성 |

### 분석 사이클 흐름

```
Phase 1: MarketScanner → KRW 전 종목 스캔, Top N 선별
Phase 2: Researcher + Technician (병렬 실행)
Phase 3: Strategist → Risk Manager (순차)
Phase 4: 거래 실행 + Reporter → 텔레그램 보고
```

## Directory Structure

```
coin-auto-trade/
├── src/
│   ├── main.py              # FastAPI entry point + 에이전트 스케줄러
│   ├── agent/               # LLM 에이전트 시스템
│   │   ├── agents.py        # AgentRunner — Gemini API 호출 관리
│   │   ├── gemini_api.py    # Gemini API 직접 호출 래퍼
│   │   ├── models.py        # Pydantic 입출력 모델
│   │   ├── prompts.py       # 에이전트별 시스템 프롬프트
│   │   ├── scanner.py       # MarketScanner — 종목 스캐닝
│   │   ├── context_builder.py # 에이전트 컨텍스트 빌더
│   │   ├── cycle.py         # CycleOrchestrator — 사이클 메인 루프
│   │   ├── telegram.py      # TelegramReporter — 보고 시스템
│   │   ├── reporter.py      # 일일/주간 보고서 생성
│   │   └── knowledge_base.py # 의사결정 지식베이스
│   ├── api/
│   │   ├── auth.py          # Bearer token 인증
│   │   ├── routes_agent.py  # 에이전트 API (사이클 트리거, 상태)
│   │   ├── routes_trading.py    # 매매 제어 + 자격증명
│   │   ├── routes_strategy.py   # 전략 CRUD (레거시)
│   │   ├── routes_backtest.py   # 백테스팅
│   │   ├── routes_dashboard.py  # 대시보드 데이터 + HTML
│   │   └── routes_system.py     # /health, /status
│   ├── core/
│   │   ├── config.py        # 환경변수 설정 (에이전트 포함)
│   │   ├── crypto.py        # Fernet 암호화/복호화
│   │   ├── database.py      # SQLite 스키마 + CRUD
│   │   ├── runtime.py       # 런타임 공유 상태
│   │   ├── types.py         # Signal, TradeSignal
│   │   └── constants.py     # Enum, 수수료율
│   ├── services/
│   │   ├── exchange.py      # Upbit API 래퍼
│   │   ├── collector.py     # OHLCV 데이터 수집
│   │   ├── backtester.py    # 백테스팅 엔진
│   │   ├── risk_manager.py  # 리스크 관리
│   │   ├── portfolio.py     # 포트폴리오 추적
│   │   ├── notifier.py      # 텔레그램 알림 (기본)
│   │   └── scheduler.py     # 매매 루프 스케줄러 (레거시)
│   ├── models/              # Pydantic 모델
│   └── dashboard/           # Jinja2 + HTMX + static
├── data/
│   ├── knowledge/           # 의사결정 지식베이스
│   │   ├── market_lessons.md
│   │   ├── ticker_notes.md
│   │   ├── strategy_rules.md
│   │   ├── mistakes.md
│   │   └── weekly_digest/
│   └── logs/
├── pyproject.toml
├── .env.example
└── .gitignore
```

## Commands

| Command | Description |
|---------|-------------|
| `python -m src.main` | 서버 시작 |
| `pip install -e .` | 개발 설치 |

## 안전 장치

1. `DRY_RUN=true` 기본 — 실거래 전환 시 명시적 API 호출 필요
2. **Python 하드코딩 리스크 한도** (LLM 판단 무관 강제):
   - 일일 최대 손실: 3%
   - 총 최대 손실: 5%
   - 최대 동시 포지션: 5개
   - 종목당 최대 배분: 20%
   - 최소 현금 보유: 30%
   - 포지션별 손절: 5%
   - 일일 최대 거래: 10회
3. Upbit API 호출 제한 준수 (호가 9/s, 주문 8/s)
4. API 키 Fernet 암호화 저장
5. 리스크 매니저 에이전트가 REJECT한 거래는 실행 불가

## 에이전트 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `GEMINI_API_KEY` | | Gemini API 키 |
| `AGENT_MODEL` | `gemini-2.0-flash` | 에이전트 모델 (flash 권장) |
| `AGENT_CYCLE_HOURS` | `6,10,14,18,22` | 사이클 실행 시간 |
| `AGENT_SCAN_TOP_N` | `20` | 스캔 종목 수 |
| `AGENT_CYCLE_TIMEOUT` | `300` | CLI 타임아웃 (초) |
| `REPORT_DAILY_HOUR` | `21` | 일일 리포트 시간 |
| `REPORT_WEEKLY_DAY` | `1` | 주간 리포트 요일 (1=월) |

## 보안

- API 키: Fernet 암호화 → SQLite 저장
- `.env`에 API_TOKEN, ENCRYPTION_KEY 보관
- `.env`, `*.db`, `data/` 모두 `.gitignore` 포함
