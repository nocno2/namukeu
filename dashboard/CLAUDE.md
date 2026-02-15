# Dashboard (namukeu.com)

개인 서비스 모니터링 대시보드.

## 구조
- `backend/` - Python FastAPI (포트 8002)
- `frontend/` - React + Vite + TailwindCSS

## 실행

### 백엔드
```bash
cd backend
.venv/bin/python -m src.main
```

### 프론트엔드 (개발)
```bash
cd frontend
bun dev
```

### 프론트엔드 빌드 (배포)
```bash
cd frontend
bun run build
# dist/가 생성되면 FastAPI가 자동으로 static serve
```

## 환경변수
`backend/.env` 참고. 필수:
- `ADMIN_PASSWORD_HASH` - bcrypt 해시
- `SESSION_SECRET` - 랜덤 문자열

## 인증
- 세션 기반 (HTTPOnly 쿠키)
- 초기 계정: admin / admin (비밀번호 변경 필수)

## 모니터링 대상
- coin-auto-trade (HTTP :8001)
- train-go (HTTP :8000)
- claude-telegram (launchd process)
- claude-discord (launchd process)
- dashboard (self)

## 배포
```bash
cp daemon/com.namukeu.dashboard.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.namukeu.dashboard.plist
```
