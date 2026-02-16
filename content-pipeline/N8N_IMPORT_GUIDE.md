# n8n 워크플로우 Import 가이드

## 📦 파일 정보

**파일명**: `n8n-blog-automation-workflow.json`

**워크플로우 이름**: Blog Automation (Keyword or Idea → Draft)

**노드 개수**: 18개 (sticky notes 제외)

---

## 🚀 Import 방법

### 1. n8n 접속
```
http://localhost:5678
```

### 2. 워크플로우 Import

1. 좌측 상단 메뉴 클릭
2. **"Import from File..."** 선택
3. `n8n-blog-automation-workflow.json` 파일 선택
4. **"Import"** 클릭

### 3. 크리덴셜 설정

워크플로우가 import되면 **OpenAI API 크리덴셜**을 설정해야 합니다.

#### OpenAI API 설정
1. **"Generate Image (DALL-E)"** 노드 클릭
2. **Credential to connect with** 드롭다운 클릭
3. **"Create New Credential"** 선택
4. OpenAI API Key 입력
5. **"Save"** 클릭

---

## 🎯 워크플로우 구조

### 트리거 (2가지)

```
┌──────────────────────┐
│ Webhook Trigger      │  ← 수동 (채팅으로 호출)
│ (Manual)             │     POST /webhook/blog-automation
└──────────┬───────────┘
           │
           ├────────────┐
           │            │
           v            v
┌──────────────────────┐
│ Schedule Trigger     │  ← 자동 (크론: 매일 오전 9시)
│ (Cron)               │
└──────────────────────┘
```

### 입력 분기

```
Merge Triggers
    ↓
Check Input Type
    ├─ keyword 있음? → Set Keyword (direct)
    │                      ↓
    │                   Merge Keyword Paths
    │                      ↓
    └─ idea 있음?    → Extract Keywords
                           ↓
                       Set Keyword (from extraction)
                           ↓
                       Merge Keyword Paths
                           ↓
                       Generate Draft
```

### 전체 플로우

```
[1] Webhook/Schedule Trigger
    ↓
[2] Merge Triggers
    ↓
[3] Check Input Type (IF)
    ├─ True  → [4] Set Keyword (direct)
    └─ False → [5] Extract Keywords → [6] Set Keyword (from extraction)
    ↓
[7] Merge Keyword Paths
    ↓
[8] Generate Draft
    ↓
[9] Generate Images
    ↓
[10] Split Image Prompts (loop)
    ↓
[11] Generate Image (DALL-E)
    ↓ (loop back to [10] until done)
    ↓
[12] Aggregate Image URLs
    ↓
[13] Replace Image URLs in Content
    ↓
[14] Review Draft
    ↓
[15] Check Score (IF: >= 7?)
    ├─ True  → [16] Save Draft to DB ✅
    └─ False → [17] Revise Draft → [18] Update Content → [14] Review Draft (loop)
```

---

## 📝 사용 방법

### 방법 1: Webhook로 수동 트리거 (키워드)

```bash
curl -X POST http://localhost:5678/webhook/blog-automation \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "두바이 쫀득 쿠키 맥미니 로컬 LLM"
  }'
```

### 방법 2: Webhook로 수동 트리거 (아이디어)

```bash
curl -X POST http://localhost:5678/webhook/blog-automation \
  -H "Content-Type: application/json" \
  -d '{
    "idea": "요즘 두쫀쿠 유행인데 이걸로 로컬 LLM 설명하면 재밌을 것 같아..."
  }'
```

### 방법 3: n8n UI에서 수동 실행

1. 워크플로우 열기
2. 좌측 **"Webhook Trigger (Manual)"** 노드 클릭
3. 우측 **"Execute Node"** 클릭
4. **"Using Test Data"** 에서 JSON 입력:
   ```json
   {
     "keyword": "테스트 키워드"
   }
   ```
   또는
   ```json
   {
     "idea": "테스트 아이디어..."
   }
   ```
5. **"Execute Workflow"** 클릭

### 방법 4: 크론탭 자동 실행

1. **"Schedule Trigger (Cron)"** 노드 클릭
2. **Cron Expression** 수정:
   - 기본값: `0 9 * * *` (매일 오전 9시)
   - 변경 예시: `0 */6 * * *` (6시간마다)
3. 워크플로우 **Active** 토글 ON

**⚠️ 주의**: Cron 트리거는 기본 입력 데이터가 없으므로, **"Schedule Trigger"** 노드 → **"Execute Node"** → **"Add Test Data"**에서 기본값 설정 필요:
```json
{
  "idea": "오늘의 트렌드 기반 블로그 작성"
}
```

---

## 🔧 커스터마이징

### 1. 이미지 개수 변경

**"Generate Images"** 노드 → Body:
```json
{
  "title": "{{ $json.title }}",
  "content": "{{ $json.content }}",
  "count": 5  ← 여기 수정 (기본 3개)
}
```

### 2. 검토 점수 기준 변경

**"Check Score (>= 7?)"** 노드 → Conditions:
- SEO Score: `7` → 원하는 값
- AI Overall: `7` → 원하는 값

### 3. 크론 스케줄 변경

**"Schedule Trigger (Cron)"** 노드 → Cron Expression:
- 매일 오전 9시: `0 9 * * *`
- 매주 월요일 10시: `0 10 * * 1`
- 3시간마다: `0 */3 * * *`

### 4. 타임아웃 조정

각 HTTP Request 노드 → **Options** → **Timeout (ms)**:
- Extract Keywords: 30000 (30초)
- Generate Draft: 120000 (2분)
- Generate Images: 60000 (1분)
- DALL-E: 90000 (90초)
- Review: 60000 (1분)
- Revise: 90000 (90초)

---

## 🐛 문제 해결

### Q1: "Webhook path already exists"

**원인**: Webhook 경로 중복

**해결**:
1. **"Webhook Trigger (Manual)"** 노드 클릭
2. **Path** 변경: `blog-automation` → `blog-automation-2`

### Q2: "Connection refused (localhost:8003)"

**원인**: content-pipeline 서버가 꺼져있음

**해결**:
```bash
cd /Users/namwook/Documents/namukeu/content-pipeline/backend
.venv/bin/python -m src.main
```

### Q3: "OpenAI API error: Invalid API key"

**원인**: DALL-E 크리덴셜 미설정

**해결**:
1. **"Generate Image (DALL-E)"** 노드 클릭
2. Credential 다시 설정

### Q4: "Error in node 'Split Image Prompts'"

**원인**: `image_prompts`가 배열이 아님

**해결**:
- **"Generate Images"** 노드 실행 결과 확인
- `image_prompts` 필드가 배열인지 검증

### Q5: Loop가 무한 반복

**원인**: Revise → Review 루프에서 점수가 계속 낮음

**해결**:
1. 임시로 **"Check Score"** 기준을 `5`로 낮춤
2. 또는 **"Revise Draft"** → **"Save Draft"** 직접 연결

---

## 📊 예상 소요 시간

| 단계 | 소요 시간 |
|------|----------|
| Webhook Trigger | 즉시 |
| Extract Keywords (optional) | 15초 |
| Generate Draft | 75초 |
| Generate Images (prompts) | 20초 |
| DALL-E (3 images loop) | 60초 |
| Replace URLs | 1초 |
| Review | 25초 |
| (Revise - optional) | 60초 |
| Save Draft | 1초 |
| **총합** | **약 3-4분** |

---

## ✅ 검증 체크리스트

워크플로우 import 후 다음을 확인하세요:

- [ ] n8n 접속 가능 (http://localhost:5678)
- [ ] content-pipeline 서버 실행 중 (http://localhost:8003)
- [ ] OpenAI API 크리덴셜 설정 완료
- [ ] Webhook path 확인: `/webhook/blog-automation`
- [ ] 테스트 실행 성공
- [ ] draft가 DB에 저장됨 (http://localhost:3100/admin/drafts)

---

## 🎉 완료!

워크플로우가 정상 작동하면:

1. **수동 실행**: Webhook POST 요청
2. **자동 실행**: 크론탭 스케줄
3. **결과 확인**: http://localhost:3100/admin/drafts에서 draft 승인

**승인 후 자동 발행!** 🚀
