# API Gateway

모노레포 서비스들을 통합하는 리버스 프록시 + 인증 게이트웨이.

## 목표
- 각 서비스(COIN :8001, TRAIN :8000, DASH :8002, BLOG :3100)를 단일 엔드포인트로 통합
- 공통 인증/인가 레이어 (JWT 기반)
- Rate limiting, 요청 로깅, CORS 통합 관리
- 헬스체크 엔드포인트 통합

## Tech Stack
- Python 3.12 + FastAPI (포트 8080)
- httpx (비동기 프록시)
- Redis (rate limiting, 세션 캐시) — 선택사항, 초기에는 인메모리

## 구조
```
api-gateway/
├── CLAUDE.md
├── src/
│   ├── main.py          # FastAPI 앱 엔트리
│   ├── config.py        # 라우팅 테이블, 환경변수
│   ├── proxy.py         # 리버스 프록시 핸들러
│   ├── auth/
│   │   ├── jwt.py       # JWT 발급/검증
│   │   └── middleware.py # 인증 미들웨어
│   ├── middleware/
│   │   ├── rate_limit.py
│   │   ├── cors.py
│   │   └── logging.py
│   └── routes/
│       └── health.py    # 통합 헬스체크
├── tests/
├── requirements.txt
├── .env.example
└── daemon/
    └── com.namukeu.api-gateway.plist
```

## 라우팅 매핑 (목표)
```
/api/coin/*   → localhost:8001/*
/api/train/*  → localhost:8000/*
/api/dash/*   → localhost:8002/*
/blog/*       → localhost:3100/*
/health       → 전체 서비스 상태 통합
```

## 실행
```bash
cd api-gateway
.venv/bin/python -m src.main
```

## 환경변수
`.env` 참고. 필수:
- `JWT_SECRET` - JWT 서명 키
- `ALLOWED_ORIGINS` - CORS 허용 도메인

## Phase 1 목표
1. 기본 리버스 프록시 (라우팅 테이블 기반)
2. JWT 인증 미들웨어
3. 요청/응답 로깅
4. 통합 헬스체크
5. Rate limiting (인메모리)

## Phase 2 목표
- Redis 기반 rate limiting
- API 키 관리 (외부 클라이언트용)
- 요청 메트릭 수집 (dashboard 연동)
- SSL termination (Cloudflare Tunnel 대체 가능)
