# TRADE - Stock Trading Platform

## 프로젝트 개요

한국/미국 주식 자동매매 및 투자 관리 플랫폼

## 기술 스택

- **Frontend**: React + Vite + TypeScript + TailwindCSS
- **Backend**: Python FastAPI + SQLite
- **차트**: TradingView Lightweight Charts

## 디렉토리 구조

```
trade/
├── backend/          # FastAPI 백엔드 (:8004)
│   ├── src/
│   │   ├── api/     # API 라우트
│   │   ├── db/      # 데이터베이스
│   │   ├── models/  # SQLAlchemy 모델
│   │   ├── services/ # 비즈니스 로직
│   │   └── utils/   # 유틸리티
│   └── data/        # SQLite DB
└── frontend/        # React 프론트엔드 (:3004)
    └── src/
        ├── api/     # API 클라이언트
        ├── components/ # 컴포넌트
        ├── pages/   # 페이지
        └── store/   # Zustand 스토어
```

## 실행

### 백엔드
```bash
cd trade/backend
bun install  # 또는 pip install
cd src
python main.py
```

### 프론트엔드
```bash
cd trade/frontend
bun install
bun dev
```

## API 엔드포인트

|_prefix | 설명 |
|---------|------|
| `/api/auth` | 인증 (로그인, 회원가입) |
| `/api/stocks` | 종목 검색, 시세, 차트 |
| `/api/trading` | 포트폴리오, 주문 |
| `/api/strategies` | 자동매매 전략 |
| `/api/news` | 뉴스 |
| `/api/alerts` | 가격 알림 |
| `/api/watchlist` | 관심종목 |

## 주요 기능

1. **실시간 시세** - US stock prices via yfinance
2. **포트폴리오** - 보유종목, 손익 관리
3. **차트** - TradingView 라이브러리
4. **자동매매** - RSI, MACD, MA 전략
5. **뉴스** - Yahoo Finance, Naver财经
6. **가격 알림** - 조건부 알림
7. **관심종목** - 그룹별 관리
