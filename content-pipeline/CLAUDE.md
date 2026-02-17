# Content Pipeline

자동화 스케줄러 + AI 콘텐츠 파이프라인. 블로그 콘텐츠 자동 생성 및 범용 태스크 스케줄링.

## 목표
- 웹 UI에서 자동화 태스크를 등록/관리 (crontab 대체)
- AI 기반 블로그 콘텐츠 파이프라인 (키워드 수집 → 초안 생성 → 검수 → 발행)
- ai-blog API와 연동하여 자동 발행
- 실행 이력, 로그, 알림 관리

## Tech Stack
- **Backend**: Python 3.12 + FastAPI (포트 8003)
- **Frontend**: React + Vite + TailwindCSS v4
- **스케줄러**: APScheduler (비동기)
- **DB**: SQLite (태스크 정의, 실행 이력)
- **AI**: Claude API (콘텐츠 생성)

## 구조
```
content-pipeline/
├── CLAUDE.md
├── backend/
│   ├── src/
│   │   ├── main.py              # FastAPI 앱 엔트리
│   │   ├── config.py            # 환경변수, 설정
│   │   ├── scheduler/
│   │   │   ├── engine.py        # APScheduler 래퍼
│   │   │   ├── tasks.py         # 태스크 정의/실행
│   │   │   └── history.py       # 실행 이력 관리
│   │   ├── pipeline/
│   │   │   ├── keyword.py       # 트렌딩 키워드 수집
│   │   │   ├── generator.py     # AI 초안 생성 (Claude API)
│   │   │   ├── reviewer.py      # 품질 검수/수정
│   │   │   └── publisher.py     # ai-blog API 연동 발행
│   │   ├── api/
│   │   │   ├── tasks.py         # 태스크 CRUD API
│   │   │   ├── pipeline.py      # 파이프라인 제어 API
│   │   │   └── history.py       # 실행 이력 조회 API
│   │   └── db/
│   │       ├── connection.py
│   │       ├── models.py
│   │       └── migrations/
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    # 태스크 현황 대시보드
│   │   │   ├── Tasks.tsx        # 태스크 목록/관리
│   │   │   ├── Pipeline.tsx     # 콘텐츠 파이프라인 현황
│   │   │   └── History.tsx      # 실행 이력
│   │   └── components/
│   ├── package.json
│   └── vite.config.ts
└── daemon/
    └── com.namukeu.content-pipeline.plist
```

## 콘텐츠 파이프라인 플로우
```
1. 키워드 수집 (Google Trends, 네이버 데이터랩 등)
   ↓
2. AI 초안 생성 (Claude API → 마크다운)
   ↓
3. 품질 검수 (SEO 점수, 가독성, 중복 체크)
   ↓
4. 검수 큐 대기 (웹 UI에서 승인/수정/반려)
   ↓
5. ai-blog API로 발행
```

## 실행
### 백엔드
```bash
cd content-pipeline/backend
.venv/bin/python -m src.main
```

### 프론트엔드 (개발)
```bash
cd content-pipeline/frontend
bun dev
```

### 프론트엔드 빌드
```bash
cd content-pipeline/frontend
bun run build
# dist/가 생성되면 FastAPI가 static serve
```

## 환경변수
`backend/.env` 참고. 필수:
- `ANTHROPIC_API_KEY` - Claude API 키
- `BLOG_API_URL` - ai-blog API 주소 (기본: http://localhost:3100)
- `BLOG_API_TOKEN` - ai-blog 인증 토큰

## Phase 1 목표
1. 스케줄러 엔진 (APScheduler + SQLite 이력)
2. 태스크 CRUD API + 웹 UI
3. 기본 콘텐츠 파이프라인 (키워드 → 초안 생성)
4. 검수 큐 UI (승인/수정/반려)

## Phase 2 목표
- ai-blog 자동 발행 연동
- 발행 후 성과 추적 (조회수, AdSense 수익)
- A/B 테스트 (제목, 썸네일 변형)
- dashboard 위젯 연동
- Telegram/Discord 알림

## n8n 블로그 자동화 워크플로우

### 웹훅 URL
```
http://localhost:5678/webhook/blog-automation
```

### 사용 방법
사용자가 키워드나 아이디어를 던지면 아래 명령으로 n8n 워크플로우를 트리거한다.

**키워드로 글 작성 요청:**
```bash
curl -s -X POST http://localhost:5678/webhook/blog-automation \
  -H "Content-Type: application/json" \
  -d '{"keyword": "여기에 키워드"}'
```

**아이디어/컨텍스트로 글 작성 요청:**
```bash
curl -s -X POST http://localhost:5678/webhook/blog-automation \
  -H "Content-Type: application/json" \
  -d '{"idea": "여기에 아이디어나 컨텍스트"}'
```

### 플로우 설명
- `keyword` 있으면 → enrich-keyword → 글 생성
- `idea` 있으면 → enrich-context (키워드 추출 포함) → 글 생성
- 생성 후 AI 리뷰 점수 8점 이상이면 → 자동 save-draft (reviewed 상태)
- 8점 미만이면 → revise 후 재저장
- 저장 완료 시 텔레그램 알림 전송 (blog.namukeu.com 링크)

### 워크플로우 파일
`content-pipeline/n8n-blog-automation-workflow.json`
