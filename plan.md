# Phase 2: 블로그 콘텐츠 자동화 파이프라인

## 개요
3단계 에이전트 파이프라인으로 글감 수집 → 글 생산 → 검토/첨삭을 자동화하고,
최종 포스팅 전 관리자 승인 플로우를 거치는 시스템.

## 아키텍처

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────┐
│ 1. Research │ →  │ 2. Writer   │ →  │ 3. Reviewer │ →  │ Admin    │
│    Agent    │    │    Agent    │    │    Agent    │    │ 승인/반려 │
│ (글감 수집) │    │ (글 생산)   │    │ (첨삭/검토) │    │          │
└─────────────┘    └─────────────┘    └─────────────┘    └──────────┘
                                                              │
                                                    ┌────────┴────────┐
                                                    │ TG/DC 알림 전송  │
                                                    └─────────────────┘
```

## 기술 스택
- **런타임**: Python 3.12 (기존 Python 프로젝트들과 통일)
- **프레임워크**: 독립 스크립트 (cron으로 실행)
- **AI**: Claude API (anthropic SDK)
- **트렌드 수집**: Google Trends (pytrends)
- **알림**: Telegram Bot API / Discord Webhook (직접 HTTP 호출)
- **DB**: 기존 ai-blog의 SQLite DB 공유 (blog.db)
- **블로그 연동**: 기존 `/api/posts` API 호출

## 디렉토리 구조

```
ai-blog/
├── pipeline/                    # 콘텐츠 자동화 파이프라인
│   ├── config.py               # 설정 (API 키, 블로그 URL, 알림 설정)
│   ├── run.py                  # 메인 실행 스크립트 (cron 진입점)
│   ├── agents/
│   │   ├── researcher.py       # 1단계: 글감 수집 에이전트
│   │   ├── writer.py           # 2단계: 글 생산 에이전트
│   │   └── reviewer.py         # 3단계: 첨삭/검토 에이전트
│   ├── services/
│   │   ├── trends.py           # Google Trends 수집
│   │   ├── blog_api.py         # 블로그 API 클라이언트
│   │   └── notifier.py         # TG/DC 알림 전송
│   ├── prompts/
│   │   ├── researcher.md       # Research 에이전트 프롬프트
│   │   ├── writer.md           # Writer 에이전트 프롬프트
│   │   └── reviewer.md         # Reviewer 에이전트 프롬프트
│   ├── db.py                   # 파이프라인 DB (drafts 테이블)
│   └── requirements.txt        # Python 의존성
```

## DB 스키마 추가

기존 blog.db에 `drafts` 테이블 추가:

```sql
CREATE TABLE drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 글감 단계
  keyword TEXT NOT NULL,
  topic TEXT NOT NULL,
  outline TEXT,                    -- JSON: 목차 구조
  source TEXT DEFAULT 'trends',    -- 'trends' | 'manual'
  -- 글 생산 단계
  title TEXT,
  slug TEXT,
  content TEXT,                    -- 마크다운 본문
  excerpt TEXT,
  category_id INTEGER,
  tags TEXT,                       -- JSON: ["tag1", "tag2"]
  -- 검토 단계
  review_feedback TEXT,            -- 검토 에이전트 피드백
  review_score INTEGER,            -- 1-10 품질 점수
  revised_content TEXT,            -- 수정된 본문
  -- 승인
  reject_reason TEXT,              -- 반려 사유
  -- 상태
  status TEXT DEFAULT 'researched',
  -- researched → written → reviewed → approved → published | rejected
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

## 각 에이전트 상세

### 1. Research Agent (글감 수집)
- **입력**: 없음 (자동 실행)
- **동작**:
  1. Google Trends에서 AI/기술 관련 상승 키워드 수집
  2. 기존에 작성한 글의 키워드와 중복 체크 (drafts + posts 테이블)
  3. SEO 가치가 높은 키워드 선별 (Claude API로 판단)
  4. 선별된 키워드로 글 목차(outline) 생성
- **출력**: `drafts` 테이블에 keyword, topic, outline 저장 (status: 'researched')

### 2. Writer Agent (글 생산)
- **입력**: status='researched'인 draft
- **동작**:
  1. outline을 기반으로 2000~3000자 분량의 한국어 글 작성
  2. SEO 최적화 (메타 타이틀, 디스크립션, excerpt)
  3. 적절한 카테고리/태그 자동 분류
  4. 마크다운 포맷으로 작성
- **출력**: title, slug, content, excerpt, tags 저장 (status: 'written')

### 3. Reviewer Agent (첨삭/검토)
- **입력**: status='written'인 draft
- **동작**:
  1. 품질 점수 (1-10) 매기기
  2. 사실 관계 검증, 문법/맞춤법 교정
  3. SEO 최적화 개선점 반영
  4. 점수 7점 이상이면 수정 반영 후 관리자에게 전달
  5. 7점 미만이면 Writer에게 재작성 요청 (최대 1회)
- **출력**: review_feedback, review_score, revised_content 저장 (status: 'reviewed')
- **알림**: 텔레그램/디스코드로 "새 초안이 검토 완료되었습니다" 알림

## 승인 플로우

### 관리자 페이지
기존 admin에 `/admin/drafts` 페이지 추가:
- 초안 목록 (status: 'reviewed')
- 초안 미리보기 (마크다운 렌더링)
- **승인** → draft를 블로그 API로 게시 (published)
- **반려** → status='rejected' + 사유 입력
- **수정 후 승인** → 내용 편집 후 게시

### 알림
- 검토 완료 시 텔레그램/디스코드로 알림
- 내용: 글 제목, 품질 점수, 관리자 페이지 링크
- Telegram: Bot API `sendMessage` 직접 HTTP 호출
- Discord: Webhook URL로 POST

## 실행 방식

```bash
# 매일 오전 9시에 파이프라인 실행
0 9 * * * cd /Users/namwook/Documents/namukeu/ai-blog && .venv/bin/python -m pipeline.run
```

### 실행 흐름 (run.py)
```python
async def main():
    # 1. 글감 수집 (최대 3개)
    await researcher.find_topics(max_count=3)

    # 2. researched → written
    await writer.write_drafts()

    # 3. written → reviewed
    await reviewer.review_drafts()

    # 4. reviewed 상태인 것들 알림
    await notifier.notify_new_drafts()
```

## API 추가 (Next.js)

```
GET  /api/drafts              - 초안 목록 (관리자 전용)
GET  /api/drafts/:id          - 초안 상세 (관리자 전용)
PUT  /api/drafts/:id          - 초안 수정 (관리자 전용)
POST /api/drafts/:id/approve  - 승인 → 게시
POST /api/drafts/:id/reject   - 반려
```

## 필요한 환경변수

### pipeline/.env
```
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
DISCORD_WEBHOOK_URL=...
BLOG_API_URL=http://127.0.0.1:3100
BLOG_DB_PATH=/Users/namwook/Documents/namukeu/ai-blog/data/blog.db
```

## 구현 순서
1. DB 스키마 (drafts 테이블) + 마이그레이션
2. pipeline/ 디렉토리 + config + DB 연결
3. Research Agent (트렌드 수집 + 키워드 선별 + 목차)
4. Writer Agent (글 생산)
5. Reviewer Agent (첨삭/검토)
6. 알림 서비스 (Telegram/Discord)
7. Drafts API 라우트 (Next.js)
8. 관리자 페이지 (/admin/drafts)
9. run.py (메인 실행 스크립트)
10. 빌드 + 배포 + cron 설정
11. 테스트 실행 (1회 수동 실행으로 검증)
