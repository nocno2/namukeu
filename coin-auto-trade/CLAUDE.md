# coin-auto-trade

> Upbit 암호화폐 자동 매매 서버. 개인용.

## Architecture

- **Runtime:** Python 3.12
- **Framework:** FastAPI + uvicorn
- **DB:** SQLite (로컬, `data/coin-auto-trade.db`)
- **암호화:** cryptography (Fernet)
- **거래소:** pyupbit (Upbit REST + WebSocket)
- **기술지표:** pandas-ta-classic
- **대시보드:** Jinja2 + HTMX + TradingView lightweight-charts
- **알림:** Telegram Bot API (httpx)

## Directory Structure

```
coin-auto-trade/
├── src/
│   ├── main.py              # FastAPI entry point
│   ├── api/
│   │   ├── auth.py          # Bearer token 인증
│   │   ├── routes_trading.py    # 매매 제어 + 자격증명
│   │   ├── routes_strategy.py   # 전략 CRUD
│   │   ├── routes_backtest.py   # 백테스팅
│   │   ├── routes_dashboard.py  # 대시보드 데이터 + HTML
│   │   └── routes_system.py     # /health, /status
│   ├── core/
│   │   ├── config.py        # 환경변수 설정
│   │   ├── crypto.py        # Fernet 암호화/복호화
│   │   ├── database.py      # SQLite 스키마 + CRUD
│   │   └── constants.py     # Enum, 수수료율
│   ├── services/
│   │   ├── exchange.py      # Upbit API 래퍼
│   │   ├── collector.py     # OHLCV 데이터 수집
│   │   ├── trader.py        # 실거래 엔진
│   │   ├── backtester.py    # 백테스팅 엔진
│   │   ├── risk_manager.py  # 리스크 관리
│   │   ├── portfolio.py     # 포트폴리오 추적
│   │   ├── notifier.py      # 텔레그램 알림
│   │   └── scheduler.py     # 매매 루프 스케줄러
│   ├── strategies/
│   │   ├── base.py          # Strategy Protocol + Signal
│   │   ├── registry.py      # 전략 등록/조회
│   │   ├── rsi_strategy.py  # RSI 전략
│   │   ├── macd_strategy.py # MACD 전략
│   │   ├── bollinger_strategy.py  # 볼린저밴드 전략
│   │   └── combined_strategy.py   # 복합 전략
│   ├── models/
│   │   ├── credential.py    # API 키 Pydantic 모델
│   │   ├── trading.py       # 주문/거래 모델
│   │   ├── strategy.py      # 전략 설정 모델
│   │   ├── backtest.py      # 백테스트 모델
│   │   └── dashboard.py     # 대시보드 모델
│   └── dashboard/
│       ├── templates/       # Jinja2 + HTMX
│       └── static/          # CSS, JS
├── pyproject.toml
├── .env.example
└── .gitignore
```

## Commands

| Command | Description |
|---------|-------------|
| `python -m src.main` | 서버 시작 |
| `pip install -e .` | 개발 설치 |

## API Endpoints

### 인증
모든 API 요청에 `Authorization: Bearer {API_TOKEN}` 헤더 필요. `/health`와 대시보드 페이지 제외.

### 자격증명

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/credentials` | Upbit API 키 등록 (암호화 저장) |
| DELETE | `/credentials` | API 키 삭제 |

### 전략

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/strategies` | 사용 가능한 전략 목록 |
| GET | `/strategies/configs` | 설정된 전략 목록 |
| POST | `/strategies/configs` | 전략 설정 생성 |
| PUT | `/strategies/configs/{id}` | 전략 파라미터 수정 |
| DELETE | `/strategies/configs/{id}` | 전략 삭제 |
| POST | `/strategies/configs/{id}/enable` | 전략 활성화 (매매 시작) |
| POST | `/strategies/configs/{id}/disable` | 전략 비활성화 (매매 중단) |

### 매매

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/trading/mode` | 현재 모드 (dry-run/live) |
| POST | `/trading/mode` | 모드 전환 |
| POST | `/trading/start` | 활성 전략 매매 시작 |
| POST | `/trading/stop` | 전체 매매 중단 |
| GET | `/trading/positions` | 현재 포지션 |
| GET | `/trading/orders` | 주문 내역 |

### 포트폴리오

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/portfolio/summary` | 포트폴리오 요약 |
| GET | `/portfolio/history` | 성과 히스토리 |

### 백테스트

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/backtest/run` | 백테스트 실행 |
| GET | `/backtest/results` | 결과 목록 |
| GET | `/backtest/results/{id}` | 상세 결과 |
| POST | `/backtest/data/backfill` | 과거 데이터 수집 |

### 대시보드

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | 메인 대시보드 |
| GET | `/dashboard/trades` | 거래 내역 페이지 |
| GET | `/dashboard/strategies` | 전략 관리 페이지 |
| GET | `/dashboard/backtest` | 백테스팅 페이지 |

## 안전 장치

1. `DRY_RUN=true` 기본 — 실거래 전환 시 명시적 API 호출 필요
2. 일일 손실 3%, 총 손실 5% 초과 시 자동 거래 중단
3. Upbit API 호출 제한 준수 (호가 9/s, 주문 8/s)
4. 최대 동시 포지션 5개, 포지션당 최대 20% 배분
5. 포지션별 5% 손절 (stop-loss)
6. API 키 Fernet 암호화 저장

## DB Tables

- `credentials` — 암호화된 API 키
- `ohlcv` — 캔들 데이터
- `strategies` — 전략 설정
- `orders` — 주문 내역
- `positions` — 보유 포지션
- `performance_snapshots` — 포트폴리오 스냅샷
- `signal_logs` — 시그널 기록
- `backtest_results` — 백테스트 결과

## 보안

- API 키: Fernet 암호화 → SQLite 저장
- `.env`에 API_TOKEN, ENCRYPTION_KEY 보관
- `.env`, `*.db`, `data/` 모두 `.gitignore` 포함
