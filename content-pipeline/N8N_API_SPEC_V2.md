# n8n 연동 API 명세서 v2.0

## 개요

**Base URL**: `http://localhost:8003`

로컬 Claude CLI를 활용한 블로그 콘텐츠 자동화 API. **웹검색 + 트렌드 분석** 기능 추가.

---

## 주요 변경사항 (v2.0)

### ✅ 신규 API
- **POST /api/n8n/enrich-keyword** - 키워드 → 웹검색 + 트렌드 + 컨텍스트 확장
- **POST /api/n8n/enrich-context** - 아이디어 → 키워드 추출 + 웹검색 + 트렌드

### ❌ 폐기 API
- **POST /api/n8n/extract-keywords** - 단순 키워드 추출만 (너무 약함)

### 📝 변경사항
- 모든 n8n API 타임아웃: **300초 (5분)**
- 키워드든 아이디어든 → 항상 웹검색 + 트렌드 분석 수행
- Generate API에 전달되는 `direction`이 훨씬 풍부해짐

---

## 인증

현재 **인증 없음** (로컬 전용). 프로덕션에서는 API 키 인증 추가 권장.

---

## 엔드포인트

### 1. 키워드 확장 (신규) ⭐

**POST** `/api/n8n/enrich-keyword`

키워드만 있을 때 사용. 웹검색 + 트렌드 분석으로 풍부한 컨텍스트 생성.

#### Request Body

```json
{
  "keyword": "두바이 쫀득 쿠키 맥미니 로컬 LLM"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `keyword` | string | ✅ | 블로그 키워드 (1-200자) |

#### Response (200 OK)

```json
{
  "keyword": "두바이 쫀득 쿠키 맥미니 로컬 LLM",
  "context": "두바이 쫀득 쿠키(두쫀쿠)는 2024년부터 SNS에서 폭발적으로 유행하고 있는 디저트입니다. 피스타치오와 카다이프의 조합이 특징이며, 현재 검색량이 급증 중입니다. 맥미니 M2/M3는 로컬 LLM을 돌리기에 적합한 성능을 제공하며, Ollama 같은 도구로 쉽게 실행할 수 있습니다. 이 두 가지를 연결하면, '직접 만들어 먹는 두쫀쿠'와 '로컬에서 직접 돌리는 LLM'의 공통점을 재미있게 설명할 수 있습니다. 배달시켜 먹는 것(API 호출)과 직접 만드는 것(로컬 실행)의 차이를 비유하면 독자들이 쉽게 이해할 수 있을 거예요.",
  "trend_data": {
    "search_volume": "급상승",
    "related_keywords": ["두쫀쿠 만들기", "맥미니 M3 AI", "로컬 LLM Ollama"],
    "trending": true
  },
  "search_insights": [
    "두바이 초콜릿은 2024년 TikTok에서 바이럴",
    "맥미니 M3는 16GB RAM으로 7B 모델 실행 가능",
    "로컬 LLM vs API 비용 비교 콘텐츠가 인기"
  ],
  "reasoning": "웹검색과 트렌드 분석 결과를 종합하여 SEO 친화적이고 시의성 있는 창작 방향 제시"
}
```

#### n8n 설정 예시

**HTTP Request Node**:
- Method: `POST`
- URL: `http://localhost:8003/api/n8n/enrich-keyword`
- Body:
  ```json
  {
    "keyword": "{{ $json.keyword }}"
  }
  ```
- Timeout: **300000ms (5분)**

---

### 2. 컨텍스트 확장 (신규) ⭐

**POST** `/api/n8n/enrich-context`

아이디어/컨텍스트가 있을 때 사용. 키워드 추출 + 웹검색 + 트렌드 분석.

#### Request Body

```json
{
  "context": "요즘 두쫀쿠 유행인데 이걸로 로컬 LLM 설명하면 재밌을 것 같아..."
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `context` | string | ✅ | 아이디어/컨텍스트 (10-5000자) |

#### Response (200 OK)

```json
{
  "keywords": [
    "두바이 쫀득 쿠키 맥미니 로컬 LLM",
    "로컬 LLM vs API 비교",
    "맥미니 AI 모델 실행"
  ],
  "selected_keyword": "두바이 쫀득 쿠키 맥미니 로컬 LLM",
  "context": "두바이 쫀득 쿠키는 2024년부터... [원본 아이디어] + [웹검색 결과] + [트렌드 분석]을 결합한 풍부한 컨텍스트",
  "trend_data": {
    "search_volume": "급상승",
    "related_keywords": ["두쫀쿠 만들기", "맥미니 M3 AI", "로컬 LLM Ollama"],
    "trending": true
  },
  "search_insights": [
    "두바이 초콜릿은 2024년 TikTok에서 바이럴",
    "맥미니 M3는 16GB RAM으로 7B 모델 실행 가능",
    "로컬 LLM vs API 비용 비교 콘텐츠가 인기"
  ],
  "reasoning": "원본 아이디어를 유지하면서 최신 트렌드와 검색 데이터로 보강"
}
```

#### n8n 설정 예시

**HTTP Request Node**:
- Method: `POST`
- URL: `http://localhost:8003/api/n8n/enrich-context`
- Body:
  ```json
  {
    "context": "{{ $json.idea }}"
  }
  ```
- Timeout: **300000ms (5분)**

---

### 3. 블로그 글 초안 생성

**POST** `/api/n8n/generate`

키워드를 기반으로 블로그 글 초안을 생성합니다.

#### Request Body

```json
{
  "keyword": "두바이 쫀득 쿠키 맥미니 로컬 LLM",
  "direction": "두바이 쫀득 쿠키는 2024년부터... (enrich-keyword 또는 enrich-context의 context)"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `keyword` | string | ✅ | 블로그 키워드 (1-200자) |
| `direction` | string | ❌ | 창작 방향 설명 (최대 2000자) |

#### Response (200 OK)

```json
{
  "keyword": "두바이 쫀득 쿠키 맥미니 로컬 LLM",
  "title": "두바이 쫀득 쿠키로 이해하는 로컬 LLM",
  "slug": "dubai-cookie-local-llm",
  "content": "## 서론\n최근 유행하는...",
  "excerpt": "두바이 쫀득 쿠키에 비유해 로컬 LLM의 작동 방식을 쉽게 설명합니다.",
  "outline": "# 아웃라인\n...",
  "tags": ["AI", "로컬LLM", "맥미니"]
}
```

#### n8n 설정 예시

**HTTP Request Node**:
- Method: `POST`
- URL: `http://localhost:8003/api/n8n/generate`
- Body:
  ```json
  {
    "keyword": "{{ $json.keyword }}",
    "direction": "{{ $json.direction }}"
  }
  ```
- Timeout: **300000ms (5분)**

---

### 4. 블로그 글 검토

**POST** `/api/n8n/review`

작성된 글의 SEO, 가독성, AI 기반 콘텐츠 품질을 검토합니다.

#### Request Body

```json
{
  "title": "두바이 쫀득 쿠키로 이해하는 로컬 LLM",
  "content": "## 서론\n최근 유행하는...",
  "keyword": "두바이 쫀득 쿠키 맥미니 로컬 LLM"
}
```

#### Response (200 OK)

```json
{
  "seo": {
    "score": 8.5,
    "checks": {...},
    "word_count": 1850,
    "heading_count": 5,
    "keyword_density": 2.1
  },
  "readability": {
    "score": 7.5,
    "sentence_count": 42,
    "avg_sentence_length": 18.3
  },
  "ai_review": {
    "overall": 8,
    "scores": {...},
    "sharp_criticisms": [...],
    "technical_suggestions": [...]
  }
}
```

---

### 5. 블로그 글 첨삭

**POST** `/api/n8n/revise`

검토 결과를 바탕으로 글을 개선합니다.

#### Request Body

```json
{
  "title": "두바이 쫀득 쿠키로 이해하는 로컬 LLM",
  "content": "## 서론\n...",
  "keyword": "두바이 쫀득 쿠키 맥미니 로컬 LLM",
  "feedback": "비유를 30% 이하로 줄이고, Ollama 벤치마크 추가"
}
```

#### Response (200 OK)

```json
{
  "revised_content": "## 서론\n개선된...",
  "changes_summary": "- 비유 비중 축소\n- 벤치마크 추가"
}
```

---

### 6. 이미지 생성 및 삽입

**POST** `/api/n8n/generate-images`

블로그 본문에 이미지를 삽입할 위치를 선정하고 프롬프트를 생성합니다.

#### Request Body

```json
{
  "title": "두바이 쫀득 쿠키로 이해하는 로컬 LLM",
  "content": "## 서론\n...",
  "count": 3
}
```

#### Response (200 OK)

```json
{
  "content_with_images": "## 서론\n...\n![두바이 쫀득 쿠키](image_1.png)\n...",
  "image_prompts": [...],
  "image_count": 3
}
```

---

### 7. Draft 저장

**POST** `/api/n8n/save-draft`

완성된 블로그 글을 ai-blog DB에 draft로 저장합니다.

#### Request Body

```json
{
  "title": "...",
  "slug": "...",
  "content": "...",
  "excerpt": "...",
  "keyword": "...",
  "tags": ["..."],
  "outline": "..."
}
```

#### Response (200 OK)

```json
{
  "draft_id": 42,
  "status": "written",
  "message": "Draft saved successfully (ID: 42). Awaiting approval in admin panel."
}
```

---

### 8. 헬스체크

**GET** `/api/n8n/health`

API 서버 상태 확인.

---

## n8n 워크플로우 (v2.0)

### 개선된 전체 플로우

```
[Trigger: Webhook/Cron]
    ↓
[Merge Triggers]
    ↓
[Check Input Type]
    ├─ keyword → [Enrich Keyword] ← 웹검색 + 트렌드
    │                 ↓
    │            {keyword, enriched_context, trend_data, search_insights}
    │                 ↓
    └─ idea → [Enrich Context] ← 키워드 추출 + 웹검색 + 트렌드
                     ↓
                {selected_keyword, enriched_context, trend_data, search_insights}
                     ↓
                [Merge Paths]
                     ↓
                [Generate] ← 초강력 컨텍스트로 초안 생성
                     ↓
                [Generate Images]
                     ↓
                [DALL-E Loop]
                     ↓
                [Replace URLs]
                     ↓
                [Review]
                     ↓
                [IF >= 7?]
                ├─ True → [Save Draft] ✅
                └─ False → [Revise] → [Review]
```

---

## 성능 고려사항 (v2.0)

| API | 평균 응답 시간 | Claude CLI 호출 | 웹검색 |
|-----|---------------|----------------|--------|
| `/enrich-keyword` | 30-50초 | 1회 | ✅ |
| `/enrich-context` | 30-50초 | 1회 | ✅ |
| `/generate` | 60-90초 | 3회 | ❌ |
| `/review` | 20-30초 | 1회 | ❌ |
| `/revise` | 40-60초 | 2회 | ❌ |
| `/generate-images` | 15-25초 | 1회 | ❌ |
| `/save-draft` | <1초 | 0회 | ❌ |

**n8n 타임아웃 설정**: 모든 HTTP Request Node의 타임아웃을 **300초 (5분)** 으로 설정.

**전체 파이프라인 소요 시간** (v2.0):
- 키워드 확장/컨텍스트 확장: **40초** (웹검색 포함)
- 초안 생성: 75초
- 이미지 프롬프트: 20초
- 실제 이미지 생성: 30-60초 (외부 API)
- 검토: 25초
- **총 약 3.5-4.5분** (기존 대비 30-60초 증가, but 품질 대폭 상승)

---

## 주요 개선사항

### ✨ 품질 향상
- **웹검색**: 최신 정보 반영 (2024년 트렌드, 최신 기술 스펙 등)
- **트렌드 분석**: 검색량, 관련 검색어 → SEO 최적화
- **풍부한 컨텍스트**: direction이 100-400자로 상세해짐

### 🚀 사용성 개선
- 키워드만 입력 → 자동으로 "어떻게 쓸지" 아이디어 생성
- 아이디어 입력 → 키워드 추출하되 원본 유지
- 어떤 입력이든 Generate에 도착할 때는 초강력 컨텍스트로 무장

### 📊 데이터 추가
- `trend_data`: 검색량, trending 여부, 관련 키워드
- `search_insights`: 웹검색에서 발견한 핵심 인사이트 (최대 3개)

---

## 마이그레이션 가이드

### 기존 워크플로우에서 업데이트

1. **extract-keywords 노드 삭제**
2. **enrich-keyword 노드 추가** (키워드 경로)
3. **enrich-context 노드 추가** (아이디어 경로)
4. **모든 타임아웃을 300000ms (5분)으로 변경**
5. **새로운 n8n-blog-automation-workflow.json import**

---

## 문의

웹검색이 작동하지 않으면 Claude CLI 버전 확인:
```bash
claude --version
# 최신 버전으로 업데이트
```
