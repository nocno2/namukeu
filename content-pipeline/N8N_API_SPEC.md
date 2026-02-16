# n8n 연동 API 명세서

## 개요

**Base URL**: `http://localhost:8003`

로컬 Claude CLI를 활용한 블로그 콘텐츠 자동화 API. 외부 LLM API 키 없이 사용 가능.

---

## 인증

현재 **인증 없음** (로컬 전용). 프로덕션에서는 API 키 인증 추가 권장.

---

## 엔드포인트

### 1. 키워드 추출 (신규)

**POST** `/api/n8n/extract-keywords`

아이디어/컨텍스트에서 블로그 키워드를 추출합니다.

#### Request Body

```json
{
  "context": "요즘 두바이 쫀득 쿠키가 유행인데, 이게 마치 로컬 LLM이랑 비슷한 것 같아. 직접 만들어 먹는 것과 배달시켜 먹는 것의 차이랄까? 맥미니로 로컬 LLM 돌리는 것과 API 호출하는 거의 차이를 쿠키로 비유해서 재밌게 설명하면 좋을 것 같은데...",
  "count": 3
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `context` | string | ✅ | 아이디어/컨텍스트 (10-5000자) |
| `count` | integer | ❌ | 추출할 키워드 개수 (기본값 3, 1-10) |

#### Response (200 OK)

```json
{
  "keywords": [
    "두바이 쫀득 쿠키 맥미니 로컬 LLM",
    "로컬 LLM vs API 비교",
    "맥미니 AI 모델 실행"
  ],
  "reasoning": "트렌드(두쫀쿠)와 기술(로컬LLM)을 결합한 키워드가 SEO 친화적이고 검색 의도가 명확합니다."
}
```

#### n8n 설정 예시

**HTTP Request Node**:
- Method: `POST`
- URL: `http://localhost:8003/api/n8n/extract-keywords`
- Body:
  ```json
  {
    "context": "{{ $json.idea }}",
    "count": 3
  }
  ```

---

### 2. 블로그 글 초안 생성

**POST** `/api/n8n/generate`

키워드를 기반으로 블로그 글 초안을 생성합니다.

#### Request Body

```json
{
  "keyword": "두바이 쫀득 쿠키 맥미니 로컬 LLM",
  "direction": "두쫀쿠에 비유해서 로컬 LLM과 API 제공 방식의 차이를 설명 (선택 필드)"
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

---

### 3. 블로그 글 검토

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

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `title` | string | ✅ | 글 제목 (1-200자) |
| `content` | string | ✅ | 본문 마크다운 (최소 100자) |
| `keyword` | string | ✅ | 타겟 키워드 (1-200자) |

#### Response (200 OK)

```json
{
  "seo": {
    "score": 8.5,
    "checks": {
      "title_length": true,
      "keyword_in_title": true,
      "min_word_count": true,
      "has_headings": true,
      "sufficient_headings": true,
      "keyword_density_ok": true,
      "short_paragraphs": true,
      "has_structure": true
    },
    "word_count": 1850,
    "heading_count": 5,
    "keyword_density": 2.1
  },
  "readability": {
    "score": 7.5,
    "sentence_count": 42,
    "avg_sentence_length": 18.3,
    "paragraph_count": 12,
    "avg_paragraph_length": 65.2
  },
  "ai_review": {
    "scores": {
      "analogy_appropriateness": 8,
      "technical_depth": 7,
      "target_consistency": 9,
      "conclusion_effectiveness": 6
    },
    "overall": 8,
    "sharp_criticisms": [
      "비유가 과도해서 실제 기술 설명이 30% 미만",
      "벤치마크 수치가 전혀 없음"
    ],
    "technical_suggestions": [
      "Ollama 벤치마크 추가",
      "GPU 메모리 사용량 비교표",
      "API 비용 vs 로컬 비용 계산"
    ],
    "one_liner": "재밌지만 깊이가 아쉬운 입문 콘텐츠"
  }
}
```

#### 점수 해석

- **SEO/Readability Score**: 0-10 (7 이상 권장)
- **AI Review Overall**: 1-10 (8 이상 우수)

#### n8n 설정 예시

**HTTP Request Node**:
- Method: `POST`
- URL: `http://localhost:8003/api/n8n/review`
- Body:
  ```json
  {
    "title": "{{ $json.title }}",
    "content": "{{ $json.content }}",
    "keyword": "{{ $json.keyword }}"
  }
  ```

**IF Node** (조건 분기):
- Condition: `{{ $json.seo.score >= 7 && $json.ai_review.overall >= 7 }}`
- True → 승인 처리
- False → 첨삭 단계로

---

### 4. 블로그 글 첨삭

**POST** `/api/n8n/revise`

검토 결과를 바탕으로 글을 개선합니다.

#### Request Body

```json
{
  "title": "두바이 쫀득 쿠키로 이해하는 로컬 LLM",
  "content": "## 서론\n최근 유행하는...",
  "keyword": "두바이 쫀득 쿠키 맥미니 로컬 LLM",
  "feedback": "비유를 30% 이하로 줄이고, Ollama 벤치마크와 GPU 메모리 사용량 비교표를 추가하세요. (선택)"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `title` | string | ✅ | 글 제목 (1-200자) |
| `content` | string | ✅ | 원본 마크다운 (최소 100자) |
| `keyword` | string | ✅ | 타겟 키워드 (1-200자) |
| `feedback` | string | ❌ | 첨삭 방향 (최대 3000자) |

#### Response (200 OK)

```json
{
  "revised_content": "## 서론\n최근 AI 시장에서...",
  "changes_summary": "- 비유 비중을 50% → 25%로 축소\n- Ollama 벤치마크 표 추가\n- GPU 메모리 사용량 비교 섹션 추가\n- 애매한 표현 ('~인 것 같다') 제거"
}
```

#### n8n 설정 예시

**HTTP Request Node**:
- Method: `POST`
- URL: `http://localhost:8003/api/n8n/revise`
- Body:
  ```json
  {
    "title": "{{ $json.title }}",
    "content": "{{ $json.content }}",
    "keyword": "{{ $json.keyword }}",
    "feedback": "{{ $json.ai_review.technical_suggestions.join(', ') }}"
  }
  ```

---

### 5. 이미지 생성 및 삽입 (신규)

**POST** `/api/n8n/generate-images`

블로그 본문에 이미지를 삽입할 위치를 선정하고 프롬프트를 생성합니다.

#### Request Body

```json
{
  "title": "두바이 쫀득 쿠키로 이해하는 로컬 LLM",
  "content": "## 서론\n최근 유행하는...",
  "count": 3
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `title` | string | ✅ | 글 제목 (1-200자) |
| `content` | string | ✅ | 본문 마크다운 (최소 100자) |
| `count` | integer | ❌ | 생성할 이미지 개수 (기본값 3, 1-5) |

#### Response (200 OK)

```json
{
  "content_with_images": "## 서론\n최근 유행하는...\n\n![두바이 쫀득 쿠키 단면](image_1.png)\n\n## 로컬 LLM이란?...",
  "image_prompts": [
    "A high-quality close-up photo of Dubai chocolate cookie with melted pistachio filling, dramatic lighting, food photography style",
    "A clean minimalist diagram showing Mac Mini M2 with AI model icons, technical illustration, blue and white color scheme",
    "Side-by-side comparison infographic: local LLM vs cloud API, with icons and arrows, modern flat design"
  ],
  "image_count": 3
}
```

#### n8n 설정 예시

**HTTP Request Node**:
- Method: `POST`
- URL: `http://localhost:8003/api/n8n/generate-images`
- Body:
  ```json
  {
    "title": "{{ $json.title }}",
    "content": "{{ $json.content }}",
    "count": 3
  }
  ```

**이후 처리**: `image_prompts`를 DALL-E/Midjourney/Stable Diffusion API로 전달하여 실제 이미지 생성 후, `content_with_images`의 플레이스홀더를 실제 이미지 URL로 치환.

---

### 6. 헬스체크

**GET** `/api/n8n/health`

API 서버 상태 확인.

#### Response (200 OK)

```json
{
  "status": "ok",
  "service": "content-pipeline-n8n"
}
```

---

## n8n 워크플로우 예시

### 시나리오 1: 아이디어 → 키워드 → 초안 → 이미지 → 검토 → 첨삭 (전체 자동화)

```
┌─────────────────┐
│  Trigger        │ (Manual / Webhook)
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Set Data       │ idea: "두쫀쿠로 로컬LLM 설명하면..."
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Extract Keywords│ POST /api/n8n/extract-keywords
└────────┬────────┘
         │ keywords[0] 선택
         v
┌─────────────────┐
│  Generate       │ POST /api/n8n/generate
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Generate Images │ POST /api/n8n/generate-images
└────────┬────────┘
         │
         v
┌─────────────────┐
│ DALL-E API      │ image_prompts로 실제 이미지 생성
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Replace URLs    │ content에 이미지 URL 치환
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Review         │ POST /api/n8n/review
└────────┬────────┘
         │
         v
┌─────────────────┐
│  IF Node        │ score >= 7?
└───┬────────┬────┘
    │ True   │ False
    v        v
 [Publish] [Revise] → Review 다시
```

### 시나리오 2: 키워드만 있을 때 (기존 방식)

```
┌─────────────┐
│  Trigger    │ keyword 입력
└──────┬──────┘
       │
       v
┌─────────────┐
│  Generate   │ POST /api/n8n/generate
└──────┬──────┘
       │
       v
┌─────────────┐
│  Review     │ POST /api/n8n/review
└──────┬──────┘
       │
       v
    [Done]
```

### 시나리오 3: 기존 글 첨삭만

```
┌─────────────┐
│  Webhook    │ content 수신
└──────┬──────┘
       │
       v
┌─────────────┐
│  Revise     │ POST /api/n8n/revise
└──────┬──────┘
       │
       v
┌─────────────┐
│  Response   │ revised_content 반환
└─────────────┘
```

---

## 에러 처리

### 5xx Server Error

```json
{
  "detail": "claude CLI failed (code 1): ..."
}
```

**원인**:
- Claude CLI 실행 실패
- 타임아웃
- 프롬프트 오류

**해결**:
1. `claude --version` 실행 확인
2. API 요청 재시도 (Retry 노드 사용)

### 422 Validation Error

```json
{
  "detail": [
    {
      "loc": ["body", "keyword"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

**원인**: 필수 필드 누락 또는 타입 오류

---

## 성능 고려사항

| API | 평균 응답 시간 | Claude CLI 호출 횟수 |
|-----|---------------|---------------------|
| `/extract-keywords` | 10-15초 | 1회 |
| `/generate` | 60-90초 | 3회 (아웃라인 + 본문 + 메타) |
| `/review` | 20-30초 | 1회 (AI 리뷰) |
| `/revise` | 40-60초 | 2회 (첨삭 + 변경 요약) |
| `/generate-images` | 15-25초 | 1회 (이미지 위치 + 프롬프트) |

**n8n 타임아웃 설정**: 각 HTTP Request Node의 타임아웃을 **120초** 이상 설정 권장.

**전체 파이프라인 소요 시간** (아이디어 → 이미지 포함 완성본):
- 키워드 추출: 15초
- 초안 생성: 75초
- 이미지 프롬프트: 20초
- 실제 이미지 생성: 30-60초 (외부 API)
- 검토: 25초
- **총 약 3-4분**

---

## 보안 고려사항

### 현재 (로컬 전용)
- 인증 없음
- localhost:8003만 접근 가능

### 프로덕션 배포 시
1. **API 키 인증** 추가:
   ```python
   @router.post("/generate")
   async def generate_content(
       body: GenerateRequest,
       api_key: str = Header(..., alias="X-API-Key")
   ):
       if api_key != os.getenv("N8N_API_KEY"):
           raise HTTPException(401, "Invalid API key")
       ...
   ```

2. **Rate Limiting**: FastAPI-Limiter 사용
3. **HTTPS**: Nginx 리버스 프록시

---

## 문의

이슈나 기능 요청은 프로젝트 리포지토리에 제보해주세요.
