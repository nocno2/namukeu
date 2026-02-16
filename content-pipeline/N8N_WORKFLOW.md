# n8n 블로그 자동화 워크플로우

## 전체 흐름도

```
┌─────────────────────────────────────────────────────────────────────┐
│                    n8n Workflow: 블로그 자동 생성                      │
└─────────────────────────────────────────────────────────────────────┘

[1] Manual Trigger / Webhook
    │
    ├─ Input: idea (아이디어 텍스트)
    │
    v
┌─────────────────────┐
│ [2] Extract Keywords│  POST /api/n8n/extract-keywords
│                     │  ├─ Input: {"context": "...", "count": 3}
│                     │  └─ Output: {"keywords": [...], "reasoning": "..."}
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ [3] Set Keyword     │  Code Node
│                     │  ├─ keyword = keywords[0]
│                     │  └─ Pass to next node
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ [4] Generate Draft  │  POST /api/n8n/generate
│                     │  ├─ Input: {"keyword": "...", "direction": "..."}
│                     │  └─ Output: {title, slug, content, excerpt, tags, outline}
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ [5] Generate Images │  POST /api/n8n/generate-images
│                     │  ├─ Input: {"title": "...", "content": "...", "count": 3}
│                     │  └─ Output: {content_with_images, image_prompts, image_count}
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ [6] Loop Images     │  Split in Batches (loop over image_prompts)
│                     │  ├─ For each prompt:
│                     │  │   ├─ Call DALL-E/Stable Diffusion API
│                     │  │   └─ Get image URL
│                     │  └─ Aggregate all URLs
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ [7] Replace URLs    │  Code Node
│                     │  ├─ content = content_with_images
│                     │  ├─ Replace image_1.png → actual_url_1
│                     │  ├─ Replace image_2.png → actual_url_2
│                     │  └─ Output: final_content
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ [8] Review          │  POST /api/n8n/review
│                     │  ├─ Input: {title, content: final_content, keyword}
│                     │  └─ Output: {seo: {score}, readability: {score}, ai_review: {overall}}
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ [9] IF Score >= 7?  │  IF Node
│                     │  ├─ Condition: seo.score >= 7 && ai_review.overall >= 7
│                     │  ├─ True  → [10] Save Draft
│                     │  └─ False → [11] Revise
└────┬──────────┬─────┘
     │ True     │ False
     v          v
  [10]       [11]
 Save       Revise
 Draft        │
              v
         [8] Review (다시 검토)


[10] Save Draft         POST /api/n8n/save-draft
     └─ Input: {title, slug, content: final_content, excerpt, keyword, tags, outline}
     └─ Output: {draft_id, status: "written", message}
     └─ 완료! 관리자 페이지에서 승인 대기


[11] Revise             POST /api/n8n/revise
     ├─ Input: {title, content, keyword, feedback: ai_review.technical_suggestions}
     ├─ Output: {revised_content, changes_summary}
     └─ Loop back to [8] Review
```

---

## 노드별 상세 설정

### [1] Manual Trigger / Webhook

**노드 타입**: Manual Trigger 또는 Webhook

**설정**:
```json
{
  "idea": "요즘 두쫀쿠 유행인데 이걸로 로컬 LLM 설명하면..."
}
```

---

### [2] Extract Keywords

**노드 타입**: HTTP Request

**설정**:
- Method: `POST`
- URL: `http://localhost:8003/api/n8n/extract-keywords`
- Authentication: None
- Body:
  ```json
  {
    "context": "{{ $json.idea }}",
    "count": 3
  }
  ```
- Timeout: 30000ms

**출력 예시**:
```json
{
  "keywords": [
    "두바이 쫀득 쿠키 맥미니 로컬 LLM",
    "로컬 LLM vs API 비교",
    "맥미니 AI 모델 실행"
  ],
  "reasoning": "트렌드와 기술을 결합한 키워드"
}
```

---

### [3] Set Keyword

**노드 타입**: Code (JavaScript)

**코드**:
```javascript
const keywords = $input.first().json.keywords;
return {
  keyword: keywords[0],
  all_keywords: keywords
};
```

---

### [4] Generate Draft

**노드 타입**: HTTP Request

**설정**:
- Method: `POST`
- URL: `http://localhost:8003/api/n8n/generate`
- Body:
  ```json
  {
    "keyword": "{{ $json.keyword }}",
    "direction": "{{ $json.idea }}"
  }
  ```
- Timeout: 120000ms (2분)

**출력 예시**:
```json
{
  "title": "두바이 쫀득 쿠키로 이해하는 로컬 LLM",
  "slug": "dubai-cookie-local-llm",
  "content": "## 서론\n...",
  "excerpt": "두쫀쿠에 비유해...",
  "tags": ["AI", "로컬LLM"],
  "outline": "# 아웃라인\n...",
  "keyword": "두바이 쫀득 쿠키 맥미니 로컬 LLM"
}
```

---

### [5] Generate Images

**노드 타입**: HTTP Request

**설정**:
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
- Timeout: 60000ms

**출력 예시**:
```json
{
  "content_with_images": "## 서론\n...\n![쿠키 단면](image_1.png)\n...",
  "image_prompts": [
    "A close-up photo of Dubai chocolate cookie...",
    "A minimalist diagram of Mac Mini with AI..."
  ],
  "image_count": 2
}
```

---

### [6] Loop Images (DALL-E API)

**노드 타입**: Split in Batches + HTTP Request (Loop)

#### 6-1. Split in Batches
- Batch Size: 1
- Options: Enable "Reset" after loop

#### 6-2. HTTP Request (OpenAI DALL-E)
**설정**:
- Method: `POST`
- URL: `https://api.openai.com/v1/images/generations`
- Authentication: Bearer Token (OpenAI API Key)
- Headers:
  ```json
  {
    "Content-Type": "application/json"
  }
  ```
- Body:
  ```json
  {
    "model": "dall-e-3",
    "prompt": "{{ $json.image_prompts[$itemIndex] }}",
    "n": 1,
    "size": "1024x1024"
  }
  ```

**출력 예시**:
```json
{
  "data": [
    {
      "url": "https://oaidalleapiprodscus.blob.core.windows.net/..."
    }
  ]
}
```

#### 6-3. Aggregate URLs (Code Node)
```javascript
const urls = [];
for (const item of $input.all()) {
  urls.push(item.json.data[0].url);
}
return { image_urls: urls };
```

---

### [7] Replace URLs

**노드 타입**: Code (JavaScript)

**코드**:
```javascript
// Merge data from [4] Generate Draft and [6] Loop Images
const draft = $('Generate Draft').first().json;
const imageData = $('Generate Images').first().json;
const imageUrls = $input.first().json.image_urls;

let finalContent = imageData.content_with_images;

// Replace placeholders
imageUrls.forEach((url, i) => {
  const placeholder = `image_${i + 1}.png`;
  finalContent = finalContent.replace(placeholder, url);
});

return {
  ...draft,
  content: finalContent,
  outline: draft.outline
};
```

---

### [8] Review

**노드 타입**: HTTP Request

**설정**:
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
- Timeout: 60000ms

**출력 예시**:
```json
{
  "seo": {"score": 8.5, "checks": {...}},
  "readability": {"score": 7.5},
  "ai_review": {
    "overall": 8,
    "scores": {...},
    "sharp_criticisms": [...],
    "technical_suggestions": [...]
  }
}
```

---

### [9] IF Score >= 7?

**노드 타입**: IF Node

**조건**:
- Condition 1: `{{ $json.seo.score }}` >= 7
- Condition 2: `{{ $json.ai_review.overall }}` >= 7
- Logic: AND

**라우팅**:
- **True** → [10] Save Draft
- **False** → [11] Revise

---

### [10] Save Draft

**노드 타입**: HTTP Request

**설정**:
- Method: `POST`
- URL: `http://localhost:8003/api/n8n/save-draft`
- Body:
  ```json
  {
    "title": "{{ $('Replace URLs').first().json.title }}",
    "slug": "{{ $('Replace URLs').first().json.slug }}",
    "content": "{{ $('Replace URLs').first().json.content }}",
    "excerpt": "{{ $('Replace URLs').first().json.excerpt }}",
    "keyword": "{{ $('Replace URLs').first().json.keyword }}",
    "tags": {{ $('Replace URLs').first().json.tags }},
    "outline": "{{ $('Replace URLs').first().json.outline }}"
  }
  ```
- Timeout: 10000ms

**출력 예시**:
```json
{
  "draft_id": 42,
  "status": "written",
  "message": "Draft saved successfully (ID: 42). Awaiting approval in admin panel."
}
```

---

### [11] Revise (점수 낮을 때)

**노드 타입**: HTTP Request

**설정**:
- Method: `POST`
- URL: `http://localhost:8003/api/n8n/revise`
- Body:
  ```json
  {
    "title": "{{ $('Replace URLs').first().json.title }}",
    "content": "{{ $('Replace URLs').first().json.content }}",
    "keyword": "{{ $('Replace URLs').first().json.keyword }}",
    "feedback": "{{ $('Review').first().json.ai_review.technical_suggestions.join(', ') }}"
  }
  ```
- Timeout: 90000ms

**출력**:
```json
{
  "revised_content": "## 개선된 서론\n...",
  "changes_summary": "- 비유 비중 축소\n- 벤치마크 추가"
}
```

**다음 단계**: Loop back to [8] Review (revised_content를 content로 사용)

---

## 워크플로우 완성 체크리스트

- [ ] [1] Manual Trigger 노드 추가
- [ ] [2] Extract Keywords HTTP Request 노드 (타임아웃 30초)
- [ ] [3] Set Keyword Code 노드
- [ ] [4] Generate Draft HTTP Request 노드 (타임아웃 2분)
- [ ] [5] Generate Images HTTP Request 노드 (타임아웃 1분)
- [ ] [6-1] Split in Batches 노드
- [ ] [6-2] DALL-E API HTTP Request 노드 (OpenAI API Key 설정)
- [ ] [6-3] Aggregate URLs Code 노드
- [ ] [7] Replace URLs Code 노드
- [ ] [8] Review HTTP Request 노드 (타임아웃 1분)
- [ ] [9] IF Node (조건: seo.score >= 7 && ai_review.overall >= 7)
- [ ] [10] Save Draft HTTP Request 노드
- [ ] [11] Revise HTTP Request 노드 (타임아웃 90초)
- [ ] [11] → [8] 연결 (Loop back)

---

## 테스트 시나리오

### 1. 간단 테스트 (키워드만)
```json
{
  "idea": "맥미니로 로컬 LLM 돌리기"
}
```

**예상 결과**: draft_id 반환, 관리자 페이지에서 확인 가능

### 2. 복잡한 아이디어
```json
{
  "idea": "요즘 두바이 쫀득 쿠키가 유행인데, 이게 마치 로컬 LLM이랑 비슷한 것 같아. 직접 만들어 먹는 것과 배달시켜 먹는 것의 차이를 비유해서 설명하면 재밌을 것 같은데..."
}
```

**예상 결과**:
- 키워드: "두바이 쫀득 쿠키 맥미니 로컬 LLM"
- 이미지 3개 삽입
- SEO 점수 8 이상

### 3. 점수 낮은 경우
```json
{
  "idea": "AI"
}
```

**예상 결과**:
- 너무 광범위한 키워드
- Review 단계에서 낮은 점수
- Revise → Review 루프 진입

---

## 문제 해결

### Q1: "claude CLI failed" 에러
- **원인**: Claude CLI가 설치되지 않았거나 PATH에 없음
- **해결**: `which claude` 실행 후, content-pipeline 서버 재시작

### Q2: "BLOG_DB_PATH not configured" 에러
- **원인**: `.env`에 `BLOG_DB_PATH` 설정 누락
- **해결**: `.env`에 `BLOG_DB_PATH=/path/to/ai-blog/data/blog.db` 추가

### Q3: DALL-E API 실패
- **원인**: OpenAI API Key 오류 또는 할당량 초과
- **해결**:
  1. API Key 확인
  2. 대안: Stable Diffusion API 또는 이미지 생성 스킵

### Q4: 타임아웃 에러
- **원인**: Claude CLI 응답 시간 초과
- **해결**: n8n HTTP Request 노드의 타임아웃을 120초 이상으로 설정

---

## 최종 출력

```
✅ Draft saved successfully!
   Draft ID: 42
   Title: 두바이 쫀득 쿠키로 이해하는 로컬 LLM
   Status: written

👉 관리자 페이지에서 확인: http://localhost:3100/admin/drafts
```

승인 후 자동 발행! 🎉
