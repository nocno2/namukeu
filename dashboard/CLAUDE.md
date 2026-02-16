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

## 예약 작업 카드 (crontab 연동)

대시보드의 "예약 작업" 카드는 `crontab -l` 결과를 실시간 파싱하여 표시한다.

### 새 크론탭 추가 시 주의사항
- **`CRON_META` 매핑 필수**: `backend/src/api/routes.py`의 `CRON_META` dict에 명령어 키워드 → 표시 이름/설명을 추가해야 한글 이름이 표시됨. 미등록 시 명령어 앞 30자가 그대로 노출됨.
- **같은 스크립트 다중 스케줄**: 같은 명령어(로그 리다이렉트 제외)로 여러 줄 등록하면 자동으로 스케줄이 병합됨 (예: 9시 + 15시 → "매일 9:00, 15:00")
- **로그 리다이렉트**: `>> /path/to/log 2>&1` 형식으로 로그 경로를 지정하면 해당 파일의 mtime으로 "마지막 실행" 시각이 표시됨
- **주석 줄은 무시됨**: `#`으로 시작하는 줄은 파싱에서 제외

## 배포
```bash
cp daemon/com.namukeu.dashboard.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.namukeu.dashboard.plist
```
