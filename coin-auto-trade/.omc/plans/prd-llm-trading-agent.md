# PRD: LLM 기반 자율 트레이딩 에이전트

> **코드네임:** COIN-AGENT
> **작성일:** 2026-03-14
> **상태:** Draft v2
> **시드머니:** 50~100만원 (업비트 KRW)
> **LLM 인터페이스:** Claude CLI (구독제) — subprocess 호출

---

## 1. 문제 정의

현재 coin-auto-trade는 기술적 지표(RSI, MACD, 볼린저밴드 등)를 알고리즘화한 규칙 기반 자동매매 시스템이다. 이 접근의 한계:

- **고정된 규칙**: 시장 상황 변화에 적응 불가. 상승장/하락장/횡보장에 같은 로직 적용
- **단일 차원 분석**: 차트 지표만 보고 거시경제, 뉴스, 규제, 심리 등 무시
- **종목 선택 불가**: 미리 지정한 종목만 거래. 새로운 기회 포착 불가
- **컨텍스트 부재**: 왜 매수/매도하는지 설명 불가. 단순 수치 임계값 비교

**해결 방향:** Claude Sonnet CLI를 거래 판단의 두뇌로 사용. 역할별로 전문화된 에이전트 팀을 구성하여 체계적인 의사결정 파이프라인으로 운영.

---

## 2. 목표 (Goals)

### 핵심 목표
1. **멀티 에이전트 의사결정**: 역할 분리된 4개 에이전트가 단계별로 협업
2. **전 종목 스캐닝**: 업비트 KRW 마켓 전체 종목을 분석 대상으로 확장
3. **멀티소스 분석**: 차트 + 뉴스 + 시장심리 + 거시경제 종합 판단
4. **체계적 보고 시스템**: 텔레그램으로 구조화된 보고서 및 실시간 알림
5. **자율 운영**: 하루 N회 정기 분석 사이클 + 이벤트 기반 긴급 판단
6. **Claude CLI 구독제 활용**: API가 아닌 CLI subprocess 호출 (기존 모노레포 패턴 재사용)

### 보고 체계 목표
7. **정기 보고서**: 일일/주간 포트폴리오 리포트 (수익률, 보유 현황, 시장 전망)
8. **거래 알림**: 매수/매도 시 즉시 알림 (근거 포함)
9. **시장 브리핑**: 주요 시장 변동 시 긴급 브리핑
10. **리스크 경고**: 손실 한도 접근, 급격한 변동성 등 위험 상황 경고

---

## 3. 비목표 (Non-Goals)

- 선물/레버리지 거래 (현물만)
- Binance 등 타 거래소 지원 (업비트 KRW 마켓만)
- 고빈도 트레이딩 (HFT) — 분 단위 매매가 아닌 시간~일 단위 판단
- 자체 LLM 학습/파인튜닝
- Anthropic API 직접 호출 (Claude CLI 구독제만 사용)
- 기존 알고리즘 전략 시스템 유지 (완전 교체)
- 웹 대시보드 대규모 개편 (기존 대시보드는 최소한의 수정만)

---

## 4. 멀티 에이전트 아키텍처

### 4.1 핵심 원칙

각 에이전트는 **별도의 Claude CLI subprocess 호출**이다. 에이전트마다 고유한 시스템 프롬프트가 있고, 자기 역할에만 집중한다. Python 오케스트레이터가 에이전트 간 데이터 흐름을 조율한다.

```
에이전트 = Claude CLI 호출 (--append-system-prompt + -p prompt)
세션 = 에이전트별 독립 세션 (--session-id UUID)
모델 = claude-sonnet-4-6 (기본)
```

### 4.2 에이전트 역할 구조

```
┌──────────────────────────────────────────────────────────────────┐
│                     분석 사이클 오케스트레이터                      │
│                     (Python CycleOrchestrator)                   │
│                                                                  │
│  Phase 1: 정보 수집 (병렬)                                        │
│  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │  🔍 리서처 에이전트   │  │  📊 테크니컬 에이전트 │               │
│  │  (Researcher)       │  │  (Technician)       │               │
│  │                     │  │                     │               │
│  │  - 뉴스 웹 검색     │  │  - OHLCV 차트 분석   │               │
│  │  - 거시경제 동향     │  │  - 기술지표 해석     │               │
│  │  - 규제/이벤트 조사  │  │  - 패턴 인식        │               │
│  │  - 시장 심리 파악    │  │  - 지지/저항선 분석  │               │
│  └────────┬────────────┘  └────────┬────────────┘               │
│           │                        │                             │
│           ▼                        ▼                             │
│  Phase 2: 종합 판단                                               │
│  ┌──────────────────────────────────────────────┐               │
│  │  🧠 전략가 에이전트 (Strategist)               │               │
│  │                                              │               │
│  │  입력:                                        │               │
│  │  - 리서처의 시장 리서치 보고서                   │               │
│  │  - 테크니컬의 기술적 분석 보고서                 │               │
│  │  - 현재 포트폴리오 상태                         │               │
│  │  - 이전 거래 이력 + 성과                        │               │
│  │                                              │               │
│  │  출력:                                        │               │
│  │  - 종목별 매수/매도/홀드 판단                    │               │
│  │  - 포지션 사이징                               │               │
│  │  - 목표가/손절가                               │               │
│  │  - 종합 판단 근거                              │               │
│  └────────────────────┬─────────────────────────┘               │
│                       ▼                                          │
│  Phase 3: 리스크 검증                                             │
│  ┌──────────────────────────────────────────────┐               │
│  │  🛡️ 리스크 에이전트 (RiskManager)              │               │
│  │                                              │               │
│  │  입력:                                        │               │
│  │  - 전략가의 거래 제안                           │               │
│  │  - 현재 포트폴리오 (리스크 노출도)               │               │
│  │  - 시장 변동성 데이터                           │               │
│  │                                              │               │
│  │  검증:                                        │               │
│  │  - 포지션 한도 초과 여부                        │               │
│  │  - 일일/총 손실 한도                           │               │
│  │  - 집중도 리스크 (특정 종목 과다 보유)            │               │
│  │  - 상관관계 리스크 (유사 종목 동시 보유)          │               │
│  │  - 현금 비율 유지                              │               │
│  │                                              │               │
│  │  출력:                                        │               │
│  │  - 승인/수정/거부 + 사유                        │               │
│  │  - 수정 시: 조정된 포지션 크기, 제외 종목 등      │               │
│  └────────────────────┬─────────────────────────┘               │
│                       ▼                                          │
│  Phase 4: 실행 + 보고                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │  ⚡ 주문 실행기       │  │  📝 리포터 에이전트   │               │
│  │  (Python 코드)      │  │  (Reporter)         │               │
│  │                     │  │                     │               │
│  │  - 승인된 거래 실행   │  │  - 사이클 보고서 생성 │               │
│  │  - Upbit API 호출   │  │  - 거래 알림 생성    │               │
│  │  - 체결 확인         │  │  - 일일/주간 리포트   │               │
│  │  - DB 기록          │  │  - 텔레그램 발송     │               │
│  └─────────────────────┘  └─────────────────────┘               │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 에이전트 상세 정의

#### 🔍 Agent 1: 리서처 (Researcher)

| 항목 | 내용 |
|------|------|
| **역할** | 시장 뉴스, 거시경제 동향, 규제 변화 조사 |
| **모델** | claude-sonnet-4-6 |
| **특징** | Claude CLI의 웹 검색 기능(WebSearch/WebFetch) 활용 |
| **세션** | 사이클마다 새 세션 |

**시스템 프롬프트 핵심:**
```
너는 암호화폐 시장 리서치 전문가다.
주어진 시장 상황에 대해 웹 검색을 수행하고 핵심 정보를 정리한다.

반드시 조사할 항목:
1. 최근 24시간 주요 크립토 뉴스 (국내외)
2. BTC/ETH 주요 가격 이벤트 및 원인
3. 거시경제 일정 (금리, CPI, 고용 등)
4. 규제 동향 (SEC, 한국 금융위)
5. 업비트 공지사항 (상장/폐지, 입출금)
6. 시장 심리 지표 (공포탐욕지수 등)

출력 형식: 아래 JSON 스키마를 반드시 준수하라.
{
  "research_date": "YYYY-MM-DD HH:mm",
  "market_sentiment": "FEAR" | "NEUTRAL" | "GREED",
  "fear_greed_index": 0~100,
  "btc_dominance": float,
  "key_news": [
    {
      "headline": "제목",
      "source": "출처",
      "impact": "BULLISH" | "BEARISH" | "NEUTRAL",
      "affected_tickers": ["KRW-BTC"],
      "summary": "요약"
    }
  ],
  "macro_events": [
    {
      "event": "이벤트명",
      "date": "YYYY-MM-DD",
      "expected_impact": "설명"
    }
  ],
  "upbit_notices": ["관련 공지 요약"],
  "market_overview": "종합 시장 분석 (3~5문장)"
}
```

#### 📊 Agent 2: 테크니컬 (Technician)

| 항목 | 내용 |
|------|------|
| **역할** | 차트 데이터 + 기술지표 기반 분석 |
| **모델** | claude-sonnet-4-6 |
| **특징** | 웹 검색 없음. 순수 데이터 분석에 집중 |
| **세션** | 사이클마다 새 세션 |

**입력 데이터 (Python이 사전 계산하여 프롬프트에 삽입):**
```
종목별:
- OHLCV (1시간봉 72개, 일봉 30개)
- RSI (14), MACD (12,26,9), 볼린저밴드 (20,2)
- EMA (9,21,50,200), 거래량 이동평균 대비 비율
- 최근 24h 고가/저가/변동률
- 호가 스프레드
```

**시스템 프롬프트 핵심:**
```
너는 암호화폐 기술적 분석(TA) 전문가다.
주어진 차트 데이터와 기술지표를 분석하여 각 종목의 기술적 상태를 평가한다.

분석 기준:
1. 추세 (상승/하락/횡보, 강도)
2. 모멘텀 (RSI 과매수/과매도, MACD 크로스)
3. 변동성 (볼린저밴드 폭, ATR)
4. 거래량 (평균 대비 이상치, 거래량 추세)
5. 지지/저항 (주요 가격대, EMA 지지)
6. 패턴 (더블탑/바텀, 채널, 삼각수렴 등)

출력 형식: 아래 JSON 스키마를 반드시 준수하라.
{
  "analysis_timestamp": "YYYY-MM-DD HH:mm",
  "tickers": [
    {
      "ticker": "KRW-BTC",
      "trend": "BULLISH" | "BEARISH" | "SIDEWAYS",
      "trend_strength": 0.0~1.0,
      "momentum": "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL",
      "volatility": "LOW" | "MEDIUM" | "HIGH",
      "volume_signal": "INCREASING" | "DECREASING" | "SPIKE" | "NORMAL",
      "support_levels": [95000000, 93500000],
      "resistance_levels": [98000000, 100000000],
      "key_indicators": {
        "rsi_14": 42.5,
        "macd_signal": "BULLISH_CROSS" | "BEARISH_CROSS" | "NEUTRAL",
        "bb_position": "UPPER" | "MIDDLE" | "LOWER" | "SQUEEZE",
        "ema_alignment": "BULLISH" | "BEARISH" | "MIXED"
      },
      "technical_score": -100~100,
      "analysis": "기술적 분석 요약 (2~3문장)"
    }
  ]
}
```

#### 🧠 Agent 3: 전략가 (Strategist) — 핵심 의사결정자

| 항목 | 내용 |
|------|------|
| **역할** | 리서처+테크니컬 보고서를 종합하여 최종 거래 판단 |
| **모델** | claude-sonnet-4-6 |
| **특징** | 가장 중요한 에이전트. 모든 정보를 종합하여 판단 |
| **세션** | **연속 세션** (--resume) — 이전 판단 맥락 유지 |

**시스템 프롬프트 핵심:**
```
너는 암호화폐 포트폴리오 전략가이자 최종 의사결정자다.
리서치 보고서와 기술적 분석 보고서를 종합하여 거래 판단을 내린다.

핵심 원칙:
1. 원금 보존이 최우선. 확신 없으면 HOLD.
2. 한 번에 큰 포지션을 잡지 않는다. 분할 매수/매도 선호.
3. 뉴스와 차트가 일치할 때만 강한 확신을 가진다.
4. 이전 거래의 성과를 반성하고 같은 실수를 반복하지 않는다.
5. 시장 전체 흐름(BTC 방향)을 항상 고려한다.

포트폴리오 제약:
- 최대 동시 포지션: {max_positions}개
- 종목당 최대 배분: 전체 자산의 {max_position_pct}%
- 최소 현금 보유: 전체 자산의 {min_cash_ratio}%
- 최소 주문 금액: 5,000 KRW
- 일일 최대 거래: {max_trades_per_day}회

출력 형식: 아래 JSON 스키마를 반드시 준수하라.
{
  "cycle_id": "YYYYMMDD-HHmm",
  "market_assessment": "현재 시장 상황 종합 평가 (3~5문장)",
  "decisions": [
    {
      "ticker": "KRW-BTC",
      "action": "BUY" | "SELL" | "HOLD",
      "urgency": "IMMEDIATE" | "WITHIN_CYCLE" | "MONITOR",
      "confidence": 0.0~1.0,
      "amount_krw": 150000,
      "reasoning": {
        "fundamental": "뉴스/거시경제 기반 근거",
        "technical": "차트/지표 기반 근거",
        "catalyst": "판단을 촉발한 핵심 요인"
      },
      "risk_level": "LOW" | "MEDIUM" | "HIGH",
      "target_price": 98500000,
      "stop_loss_price": 92000000,
      "time_horizon": "단기(1-3일)" | "중기(1-2주)"
    }
  ],
  "hold_positions": [
    {
      "ticker": "KRW-ETH",
      "action": "HOLD",
      "reasoning": "유지 근거",
      "review_next_cycle": true
    }
  ],
  "portfolio_advice": "전체 포트폴리오 방향성 조언",
  "self_reflection": "이전 판단에 대한 반성/평가 (있을 경우)"
}
```

#### 🛡️ Agent 4: 리스크 매니저 (RiskManager)

| 항목 | 내용 |
|------|------|
| **역할** | 전략가의 거래 제안을 리스크 관점에서 검증/조정 |
| **모델** | claude-sonnet-4-6 |
| **특징** | 보수적 관점. 거부권(VETO) 보유 |
| **세션** | 사이클마다 새 세션 |

**시스템 프롬프트 핵심:**
```
너는 보수적인 리스크 매니저다. 전략가의 거래 제안을 검증한다.
너의 최우선 목표는 원금 보전이다. 의심스러우면 거부한다.

검증 항목:
1. 포지션 크기 적정성 (과도한 집중투자 방지)
2. 상관관계 리스크 (유사 코인 동시 매수 방지)
3. 변동성 대비 포지션 크기 (고변동성 = 소규모 포지션)
4. 연속 손실 시 포지션 축소 필요성
5. 시장 전반적 리스크 수준 (공포 구간에서 신규 매수 신중)
6. 일일/누적 손실 한도 여부
7. 현금 비율 유지 여부

판단 옵션:
- APPROVE: 그대로 승인
- ADJUST: 포지션 크기/종목 수정하여 승인
- REJECT: 거부 (사유 필수)

출력 형식: 아래 JSON 스키마를 반드시 준수하라.
{
  "review_timestamp": "YYYY-MM-DD HH:mm",
  "portfolio_risk_score": 0~100,
  "decisions": [
    {
      "ticker": "KRW-BTC",
      "original_action": "BUY",
      "verdict": "APPROVE" | "ADJUST" | "REJECT",
      "adjusted_amount_krw": 100000,
      "rejection_reason": null,
      "risk_notes": "리스크 관련 코멘트"
    }
  ],
  "overall_assessment": "전체 리스크 평가",
  "warnings": ["경고 사항 목록"],
  "forced_actions": [
    {
      "ticker": "KRW-DOGE",
      "action": "SELL",
      "reason": "손절 한도 도달. 즉시 매도 필요."
    }
  ]
}
```

#### 📝 Agent 5: 리포터 (Reporter)

| 항목 | 내용 |
|------|------|
| **역할** | 분석 결과 및 거래 내역을 보고서로 작성 |
| **모델** | claude-sonnet-4-6 (또는 haiku — 비용 절감) |
| **특징** | 사람이 읽기 좋은 형식으로 가공 |
| **세션** | 사이클마다 새 세션 |

**시스템 프롬프트 핵심:**
```
너는 트레이딩 리포터다. 거래 결과와 시장 분석을 텔레그램으로 발송할
보고서로 작성한다. 간결하고 핵심적으로, 이모지를 활용하여 가독성을 높여라.

보고서 종류:
1. 거래 알림 — 매수/매도 즉시 알림
2. 사이클 보고 — 분석 사이클 완료 후 요약
3. 일일 리포트 — 당일 성과 + 시장 전망
4. 주간 리포트 — 주간 성과 분석 + 회고
5. 리스크 경고 — 긴급 상황 알림

출력 형식: 텔레그램 Markdown 형식의 텍스트.
4096자 이내로 작성. 핵심 수치와 판단 근거를 명확히 포함.
```

### 4.4 에이전트 간 데이터 흐름

```
[Python 오케스트레이터]
       │
       ├─ 1. 시장 데이터 수집 (Python: pyupbit + pandas-ta)
       │     - 전 종목 시세 조회
       │     - Top N 필터링 (거래량/변동성)
       │     - OHLCV + 기술지표 사전 계산
       │
       ├─ 2. 병렬 에이전트 호출
       │     ┌─ 리서처 (Claude CLI) ─→ research_report.json
       │     └─ 테크니컬 (Claude CLI) ─→ technical_report.json
       │
       ├─ 3. 전략가 호출 (Claude CLI)
       │     입력: research_report + technical_report + portfolio_state
       │     출력: trade_decisions.json
       │
       ├─ 4. 리스크 매니저 호출 (Claude CLI)
       │     입력: trade_decisions + portfolio_risk_data
       │     출력: risk_review.json (승인/조정/거부)
       │
       ├─ 5. 주문 실행 (Python: exchange.py)
       │     승인된 거래만 실행
       │     DB 기록
       │
       └─ 6. 리포터 호출 (Claude CLI)
             입력: 전체 사이클 결과
             출력: telegram_message.txt → 텔레그램 발송
```

### 4.5 세션 전략

| 에이전트 | 세션 방식 | 이유 |
|---------|----------|------|
| 리서처 | 매번 새 세션 (`--session-id UUID`) | 최신 정보만 필요, 컨텍스트 오염 방지 |
| 테크니컬 | 매번 새 세션 | 데이터 기반 분석, 이전 맥락 불필요 |
| 전략가 | **연속 세션** (`--resume SESSION_ID`) | 이전 판단 맥락 유지, 학습 효과 |
| 리스크 | 매번 새 세션 | 편향 없는 독립적 검증 필요 |
| 리포터 | 매번 새 세션 | 단순 보고서 생성, 맥락 불필요 |

**전략가 세션 관리:**
- 세션 ID를 DB에 저장 (`agent_sessions` 테이블)
- 세션이 너무 길어지면 (예: 7일) 새 세션 시작 + 이전 성과 요약을 컨텍스트로 전달
- 세션 에러 시 자동으로 새 세션 생성 (기존 패턴: `isSessionNotFound` 핸들링)

---

## 5. Claude CLI 통합 설계

### 5.1 CLI 래퍼 (`src/agent/claude_cli.py`)

content-pipeline의 `claude_cli.py` 패턴을 Python으로 재사용:

```python
async def call_claude(
    prompt: str,
    session_id: str,
    is_new_session: bool = True,
    system_prompt: str | None = None,
    model: str | None = None,
    claude_path: str = "claude",
    cwd: str | None = None,
    on_progress: Callable[[str], Awaitable[None]] | None = None,
    timeout: int = 120,  # 초
) -> ClaudeResult:
    """
    Claude CLI를 subprocess로 호출하고 stream-json 응답을 파싱한다.

    Args:
        prompt: 분석 프롬프트 (데이터 포함)
        session_id: UUID 세션 식별자
        is_new_session: True면 --session-id, False면 --resume
        system_prompt: --append-system-prompt로 전달
        model: --model (기본: claude-sonnet-4-6)
        timeout: 응답 타임아웃 (초)

    Returns:
        ClaudeResult(success, result, session_id, cost_usd, duration_ms, error)
    """
```

**CLI 인자 구성:**
```python
args = [
    claude_path,
    "-p", prompt,
    "--verbose",
    "--output-format", "stream-json",
    "--dangerously-skip-permissions",
]

if is_new_session:
    args.extend(["--session-id", session_id])
else:
    args.extend(["--resume", session_id])

if system_prompt:
    args.extend(["--append-system-prompt", system_prompt])

if model:
    args.extend(["--model", model])
```

**응답 파싱 (stream-json):**
```python
# line-by-line JSON 이벤트 파싱
# type == "system" && subtype == "init" → session_id 캡처
# type == "assistant" → text blocks 수집 + tool_use 진행상황
# type == "result" → final_result, cost_usd, duration_ms
```

**에러 핸들링:**
```python
# "session not found" → 새 세션으로 재시도
# "is already in use" → 고아 프로세스 킬 + 새 세션
# timeout → 프로세스 kill + 에러 반환
# exit code != 0 → 에러 메시지 반환
```

### 5.2 에이전트 호출기 (`src/agent/agents.py`)

```python
class AgentRunner:
    """에이전트별 Claude CLI 호출을 관리하는 클래스"""

    def __init__(self, config: Config, db: Database):
        self.config = config
        self.db = db
        self.claude_path = config.claude_path  # "claude"
        self.model = config.agent_model        # "claude-sonnet-4-6"

    async def run_researcher(self, market_context: str) -> ResearchReport:
        """리서처 에이전트 실행 — 웹 검색으로 시장 조사"""

    async def run_technician(self, ticker_data: str) -> TechnicalReport:
        """테크니컬 에이전트 실행 — 차트 데이터 분석"""

    async def run_strategist(
        self,
        research: ResearchReport,
        technical: TechnicalReport,
        portfolio: PortfolioState,
        history: TradeHistory,
    ) -> StrategyDecisions:
        """전략가 에이전트 실행 — 종합 판단 (연속 세션)"""

    async def run_risk_manager(
        self,
        decisions: StrategyDecisions,
        portfolio: PortfolioState,
    ) -> RiskReview:
        """리스크 매니저 에이전트 실행 — 거래 검증"""

    async def run_reporter(
        self,
        report_type: str,
        context: dict,
    ) -> str:
        """리포터 에이전트 실행 — 보고서 생성"""
```

### 5.3 웹 검색 활용

Claude CLI는 `WebSearch`/`WebFetch` 도구를 내장하고 있으므로 별도 검색 API가 불필요하다. 리서처 에이전트의 시스템 프롬프트에서 웹 검색을 지시하면 Claude가 자체적으로 검색을 수행한다.

```
--dangerously-skip-permissions 플래그로 자동 승인
→ WebSearch 도구가 자동으로 실행됨
→ 검색 결과를 기반으로 리서치 보고서 작성
```

---

## 6. 보고 시스템 상세 설계

### 6.1 보고 유형 및 템플릿

#### 거래 알림 (실시간)
```
🟢 매수 실행 | KRW-BTC
━━━━━━━━━━━━━━━━━━
💰 금액: 150,000 KRW
📊 가격: 95,230,000 KRW
📈 신뢰도: 78%

📋 판단 근거:
[펀더멘탈] 미 SEC 비트코인 ETF 추가 승인 뉴스
[차트] RSI 30 근접 과매도, 골든크로스 임박
[촉발] 거래량 급증 + 지지선 반등 확인

⚠️ 리스크: MEDIUM
🎯 목표가: 98,500,000 KRW (+3.4%)
🛑 손절가: 92,000,000 KRW (-3.4%)
⏰ 전망: 단기 (1-3일)
```

#### 사이클 보고 (사이클마다)
```
🔄 분석 사이클 완료 | #42 (14:00)
━━━━━━━━━━━━━━━━━━━━━━━━━━

📡 스캐닝: 180종목 → 20종목 정밀 분석
🧠 판단: 매수 2건, 매도 1건, 홀드 3건

실행된 거래:
├ 🟢 매수 KRW-SOL 200,000원 (신뢰도 82%)
├ 🟢 매수 KRW-AVAX 100,000원 (신뢰도 71%)
└ 🔴 매도 KRW-XRP 전량 (+3.2% 익절)

🛡️ 리스크 검증:
├ 승인 2건, 금액 조정 1건, 거부 0건
└ 포트폴리오 리스크 스코어: 35/100

💰 현재 잔고: 523,000 KRW (52.3%)
```

#### 일일 리포트 (매일 21:00)
```
📊 일일 트레이딩 리포트 | 2026-03-14
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 포트폴리오 현황
├ 총 자산: 1,052,300 KRW
├ 현금: 502,300 KRW (47.7%)
├ 포지션: 550,000 KRW
├ 일일 수익: +12,300 KRW (+1.18%)
└ 총 수익: +52,300 KRW (+5.23%)

📈 보유 종목
├ KRW-BTC: +2.1% (150,000 KRW)
├ KRW-ETH: -0.3% (200,000 KRW)
└ KRW-SOL: +1.5% (200,000 KRW)

🔄 오늘의 거래 (3건)
├ 10:00 🟢 KRW-SOL 200,000원 (현재 +1.5%)
├ 14:00 🔴 KRW-XRP 전량 익절 (+3.2%)
└ 18:00 🟢 KRW-ETH 200,000원 (현재 -0.3%)

🧠 AI 시장 분석
비트코인 9,500만원 지지선 확인. 미국 CPI
발표 앞두고 관망세 우세. 알트코인은 SOL,
AVAX 중심으로 자금 유입 관찰.

📅 내일 전략
BTC 횡보 지속 예상. ETH 업그레이드 이벤트
주목. SOL 추가 매수 검토 중.

🛡️ 리스크 상태: 안전 (스코어 35/100)
⚡ 분석 사이클: 5회 완료
```

#### 주간 리포트 (매주 월요일)
```
📊 주간 트레이딩 리포트 | W11 (03/08~03/14)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 주간 성과
├ 시작 자산: 1,000,000 KRW
├ 종료 자산: 1,052,300 KRW
├ 주간 수익: +52,300 KRW (+5.23%)
├ 최대 낙폭: -1.8%
└ 샤프 비율: 1.42

🏆 베스트/워스트
├ 🥇 KRW-SOL: +8.2% (2거래)
├ 🥈 KRW-BTC: +3.1% (3거래)
└ 🥉 KRW-DOGE: -2.1% (1거래, 손절)

📊 거래 통계
├ 총 거래: 15건
├ 승률: 73% (11승 4패)
├ 평균 수익: +2.1%
├ 평균 손실: -1.5%
└ 수익비: 1.87

🧠 AI 주간 회고
이번 주는 BTC의 안정적 상승세에 힘입어
양호한 성과. SOL 생태계 확장 뉴스 적극 대응.
DOGE 매수는 과도한 FOMO 진입 — 향후 밈코인
진입 기준 강화 필요.

📅 다음 주 전망
미 FOMC 회의(수요일) 앞두고 변동성 확대 예상.
현금 비중 확대 고려. ETH 덴쿤 업그레이드
후속 효과 모니터링.

🛡️ 평균 리스크 스코어: 38/100 (안전)
⚡ 분석 사이클: 35회 | 총 거래: 15건
```

#### 리스크 경고 (즉시)
```
🚨 리스크 경고 | HIGH
━━━━━━━━━━━━━━━━━━

⚠️ 일일 손실 한도 접근
├ 현재 일일 손실: -2.5% (한도: -3%)
├ 원인: KRW-BTC 급락 (-4.2%)
└ 잔여 여유: 0.5%

🛡️ 자동 조치:
├ 신규 매수 일시 중단
├ 기존 손절가 강화 (3% → 2%)
└ 다음 사이클에서 포지션 축소 검토

💡 권장:
수동 개입이 필요하면 /trading/stop으로
전체 거래를 중단할 수 있습니다.
```

### 6.2 보고 스케줄

| 보고 유형 | 트리거 | 발송 채널 |
|-----------|--------|----------|
| 거래 알림 | 주문 체결 즉시 | 텔레그램 |
| 사이클 보고 | 분석 사이클 완료 시 | 텔레그램 |
| 일일 리포트 | 매일 21:00 | 텔레그램 |
| 주간 리포트 | 매주 월요일 09:00 | 텔레그램 |
| 리스크 경고 | 임계값 초과 즉시 | 텔레그램 |
| 시장 긴급 브리핑 | 급등락 감지 시 | 텔레그램 |

---

## 7. 데이터 레이어 설계

### 7.1 신규 테이블

| 테이블 | 용도 |
|--------|------|
| `agent_sessions` | 에이전트 세션 관리 (특히 전략가 연속 세션) |
| `agent_cycles` | 분석 사이클 메타데이터 (시작/종료, 비용, 결과 요약) |
| `agent_decisions` | 에이전트별 판단 기록 (입력 요약, 출력 JSON, 비용) |
| `risk_reviews` | 리스크 매니저 검증 기록 (승인/조정/거부) |
| `reports` | 생성된 보고서 아카이브 |
| `market_snapshots` | 사이클별 시장 전체 스냅샷 (전 종목 시세) |

### 7.2 `agent_sessions` 스키마
```sql
CREATE TABLE agent_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_type TEXT NOT NULL,          -- researcher/technician/strategist/risk/reporter
    session_id TEXT NOT NULL UNIQUE,   -- Claude CLI 세션 UUID
    is_active BOOLEAN DEFAULT 1,
    created_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL,
    total_calls INTEGER DEFAULT 0,
    total_cost_usd REAL DEFAULT 0
);
```

### 7.3 `agent_decisions` 스키마
```sql
CREATE TABLE agent_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id TEXT NOT NULL,            -- YYYYMMDD-HHmm
    agent_type TEXT NOT NULL,
    session_id TEXT,
    input_summary TEXT,                -- 입력 데이터 요약
    output_json TEXT NOT NULL,         -- 전체 응답 JSON
    cost_usd REAL,
    duration_ms INTEGER,
    created_at TEXT NOT NULL
);
```

---

## 8. 의사결정 지식베이스 (Trading Knowledge Base)

### 8.1 개요

에이전트가 거래 결과를 기록하고 회고하면서 **축적되는 지식 시스템**. 마크다운 파일 기반으로 관리하며, 전략가 에이전트가 매 사이클마다 참조하여 같은 실수를 반복하지 않도록 한다.

```
data/knowledge/
├── market_lessons.md        # 시장 상황별 교훈 (최대 200줄)
├── ticker_notes.md          # 종목별 관찰 기록 (최대 300줄)
├── strategy_rules.md        # 스스로 도출한 매매 원칙 (최대 100줄)
├── mistakes.md              # 실패 사례 + 원인 분석 (최대 150줄)
└── weekly_digest/
    ├── 2026-W11.md          # 주간 요약 (압축본)
    ├── 2026-W12.md
    └── ...
```

### 9.2 지식 유형별 구조

#### market_lessons.md — 시장 교훈
```markdown
## 2026-03-14 | FOMC 발표 전후 패턴
- **상황**: 미 FOMC 금리 동결 발표
- **관찰**: 발표 24시간 전 BTC 변동성 축소 → 발표 직후 3% 급등
- **교훈**: FOMC 당일은 신규 매수 자제. 발표 후 방향 확인 뒤 진입.
- **적용**: 거시경제 이벤트 전 현금 비중 확대

## 2026-03-10 | 업비트 긴급 공지 패턴
- **상황**: KRW-LUNA 입출금 일시정지 공지
- **관찰**: 공지 후 30분 내 -15% 급락
- **교훈**: 업비트 입출금 정지 공지 = 즉시 매도 신호
- **적용**: 리서처가 업비트 공지 감지 시 긴급 플래그
```

#### ticker_notes.md — 종목별 관찰
```markdown
## KRW-BTC
- [03-14] 9,500만원 강한 지지선. 3번 테스트 후 반등.
- [03-12] ETF 뉴스에 민감. 미국 장 오픈 시간(23:30 KST) 전후 변동 큼.
- [03-08] 주말 거래량 평일 대비 40% 감소. 주말 판단 신뢰도 하향 조정 필요.

## KRW-SOL
- [03-14] 생태계 뉴스(에어드롭, 신규 프로토콜)에 즉각 반응. 뉴스 선행 매수 유효.
- [03-11] BTC 하락 시 동반 하락폭이 1.5~2배. 레버리지 효과 주의.

## KRW-DOGE
- [03-09] FOMO 진입 실패. 밈코인은 거래량 피크 후 진입하면 늦음.
- **원칙 추가**: 밈코인은 24h 거래량 300% 이상 급증 시에만 검토.
```

#### strategy_rules.md — 자체 도출 매매 원칙
```markdown
# 매매 원칙 (에이전트 자체 도출)

## 진입 원칙
1. BTC가 하락세일 때 알트코인 신규 매수 금지 (03-08 교훈)
2. 신뢰도 70% 미만인 판단은 포지션 크기 50% 축소 (03-10 교훈)
3. 연속 2회 손절 후에는 다음 사이클 매수 스킵 (감정적 복구 매매 방지)
4. 거시경제 이벤트 당일은 현금 비중 50% 이상 유지

## 청산 원칙
5. 목표가 도달 시 50% 부분 익절, 나머지는 트레일링 (03-12 교훈)
6. 3일 이상 횡보하는 포지션은 비중 축소 검토
7. 업비트 입출금 정지 공지 = 무조건 즉시 매도

## 종목 선택 원칙
8. 일일 거래대금 10억 미만 종목 제외 (유동성 리스크)
9. 신규 상장 코인은 최소 1주 관찰 후 진입
10. 같은 섹터 코인 동시 보유 2개 이하 (상관관계 리스크)
```

#### mistakes.md — 실패 사례집
```markdown
## 2026-03-09 | DOGE FOMO 진입
- **판단**: KRW-DOGE 매수 100,000원 (신뢰도 62%)
- **근거**: 일론 머스크 트윗, 거래량 급증
- **결과**: -2.1% 손절 (이미 피크 후 진입)
- **원인**: 뉴스 이미 가격에 반영됨. 거래량 피크 시점이 진입 시점이 아님.
- **교훈**: → strategy_rules.md #원칙 추가됨
- **방지책**: 밈코인 24h 거래량 변화율 체크 추가, 피크 후 진입 경고

## 2026-03-07 | BTC 하락장 알트코인 매수
- **판단**: BTC -3% 하락 중 KRW-AVAX 매수
- **근거**: AVAX 기술적 지표 과매도
- **결과**: -1.8% 손실 (BTC 동반 하락)
- **원인**: BTC 방향을 무시하고 개별 종목 지표만 봄
- **교훈**: → strategy_rules.md #1 원칙 도출
```

### 9.3 지식베이스 운영 흐름

```
┌─────────────────────────────────────────────────┐
│              지식베이스 라이프사이클                │
│                                                 │
│  [기록] 매 사이클 종료 후                          │
│  ├─ 전략가가 self_reflection 출력                 │
│  ├─ Python이 거래 결과 vs 판단 비교               │
│  └─ 결과를 적절한 .md 파일에 append              │
│                                                 │
│  [참조] 매 사이클 시작 시                          │
│  ├─ strategy_rules.md → 전략가 프롬프트에 포함     │
│  ├─ mistakes.md (최근 10건) → 전략가 프롬프트      │
│  ├─ ticker_notes.md (관련 종목) → 전략가 프롬프트   │
│  └─ market_lessons.md (최근 5건) → 전략가 프롬프트  │
│                                                 │
│  [회고] 일일/주간 리포트 시                        │
│  ├─ 당일/주간 거래 결과 종합 평가                  │
│  ├─ 새로운 교훈 도출 → .md 파일 업데이트           │
│  ├─ 기존 원칙 유효성 검증                         │
│  └─ 무효화된 원칙 제거/수정                       │
│                                                 │
│  [압축] 주간 다이제스트 생성 시                     │
│  ├─ 해당 주의 모든 기록을 요약                    │
│  ├─ weekly_digest/YYYY-WNN.md 생성               │
│  ├─ 원본 파일에서 해당 주 항목 제거 (압축)         │
│  └─ strategy_rules.md는 압축하지 않음 (항상 전체)  │
│                                                 │
│  [가지치기] 월 1회 자동                           │
│  ├─ 3개월 이상 된 weekly_digest → 삭제            │
│  ├─ 참조되지 않는 ticker_notes → 삭제             │
│  └─ 파일별 최대 줄 수 강제 (초과 시 오래된 것 제거) │
└─────────────────────────────────────────────────┘
```

### 9.4 크기 관리 장치 (Python 강제)

| 파일 | 최대 줄 수 | 초과 시 처리 |
|------|-----------|-------------|
| `market_lessons.md` | 200줄 | 오래된 항목부터 삭제 (주간 다이제스트에 보존) |
| `ticker_notes.md` | 300줄 | 30일간 거래 없는 종목 항목 삭제 |
| `strategy_rules.md` | 100줄 | **삭제 안 함** — 초과 시 전략가에게 통합/정리 요청 |
| `mistakes.md` | 150줄 | 60일 이상 된 항목 삭제 (주간 다이제스트에 보존) |
| `weekly_digest/*.md` | 각 100줄 | 3개월 이상 된 파일 삭제 |

**크기 검증 함수:**
```python
class KnowledgeBase:
    MAX_LINES = {
        "market_lessons.md": 200,
        "ticker_notes.md": 300,
        "strategy_rules.md": 100,
        "mistakes.md": 150,
    }

    def enforce_limits(self):
        """파일별 최대 줄 수 초과 시 오래된 항목 제거"""

    def prune_stale_tickers(self, active_tickers: list[str], days: int = 30):
        """최근 N일간 거래 없는 종목의 노트 제거"""

    def prune_old_digests(self, months: int = 3):
        """N개월 이상 된 주간 다이제스트 삭제"""
```

### 9.5 전략가 프롬프트 통합

전략가 에이전트에게 매 사이클마다 지식베이스의 관련 부분을 프롬프트에 주입:

```python
def build_strategist_context(self, candidate_tickers: list[str]) -> str:
    kb = self.knowledge_base

    context_parts = []

    # 1. 매매 원칙 (항상 전체 포함)
    rules = kb.read("strategy_rules.md")
    context_parts.append(f"## 너의 매매 원칙\n{rules}")

    # 2. 최근 실패 사례 (최근 10건)
    mistakes = kb.read_recent("mistakes.md", count=10)
    context_parts.append(f"## 최근 실패 사례 (반복 금지)\n{mistakes}")

    # 3. 관련 종목 노트 (후보 종목만 필터)
    for ticker in candidate_tickers:
        notes = kb.read_ticker_notes(ticker)
        if notes:
            context_parts.append(f"## {ticker} 이전 관찰\n{notes}")

    # 4. 최근 시장 교훈 (최근 5건)
    lessons = kb.read_recent("market_lessons.md", count=5)
    context_parts.append(f"## 최근 시장 교훈\n{lessons}")

    return "\n\n".join(context_parts)
```

### 8.6 지식베이스 업데이트 타이밍

| 이벤트 | 업데이트 내용 | 대상 파일 |
|--------|-------------|----------|
| 사이클 종료 | 전략가의 self_reflection 기록 | `market_lessons.md`, `ticker_notes.md` |
| 거래 체결 | 진입 근거 기록 | `ticker_notes.md` |
| 손절 발생 | 실패 원인 분석 + 기록 | `mistakes.md` |
| 익절 발생 | 성공 패턴 기록 | `ticker_notes.md` |
| 일일 리포트 | 당일 교훈 종합 | `market_lessons.md`, `strategy_rules.md` |
| 주간 리포트 | 주간 다이제스트 생성 + 압축 | `weekly_digest/`, 원본 파일 정리 |
| 새 원칙 도출 | 전략가가 새 규칙 제안 → Python 검증 후 추가 | `strategy_rules.md` |

### 8.7 원칙 업데이트 프로세스

전략가가 새 원칙을 제안하거나 기존 원칙 수정을 요청할 수 있지만, Python 코드가 최종 검증:

```python
async def process_rule_update(self, proposed_rules: list[dict]):
    """전략가가 제안한 원칙 변경을 검증하고 적용"""
    for rule in proposed_rules:
        action = rule["action"]  # "add" | "modify" | "remove"

        if action == "remove":
            # 하드코딩 원칙(손절, 포지션 한도 등)은 제거 불가
            if rule["rule_id"] in IMMUTABLE_RULES:
                log.warning(f"불변 원칙 제거 시도 거부: {rule['rule_id']}")
                continue

        if action == "add":
            # 100줄 한도 체크
            if self.knowledge_base.line_count("strategy_rules.md") >= 100:
                # 전략가에게 기존 원칙 통합/정리 요청 (다음 사이클)
                self._request_rule_consolidation = True
                continue

        self.knowledge_base.update_rules(rule)
```

---

## 9. 기술적 제약 및 결정사항

### 9.1 Claude CLI 구독제 주의사항
- **API가 아닌 CLI**: `claude` 바이너리를 subprocess로 호출. 구독제 요금.
- **동시 호출 제한**: Claude CLI는 동일 세션 동시 사용 불가. 에이전트별 독립 세션 사용.
- **rate limit**: 구독 플랜에 따른 호출 제한 주의. 사이클 간격으로 자연 조절.
- **--dangerously-skip-permissions**: 자동화에 필수. 도구 승인 자동 처리.
- **비용**: 구독제이므로 토큰 비용은 없으나, 사이클당 시간 + 동시성 고려 필요.

### 9.2 병렬 호출 전략
- 리서처 + 테크니컬은 **병렬** 호출 (asyncio.gather)
- 전략가 → 리스크 매니저 → 리포터는 **순차** 호출
- 총 사이클 소요 시간 예상: 3~5분 (5개 CLI 호출)

### 9.3 안전 장치
- **하드코딩된 리스크 한도**: Python 코드에서 강제 (LLM이 override 불가)
  - 일일 손실 3% / 총 손실 5% → 자동 거래 중단
  - 최대 동시 포지션 5개
  - 최소 현금 30% 유지
- **리스크 에이전트 VETO**: 리스크 에이전트가 REJECT하면 절대 실행 안 함
- **CLI 장애 대응**: 타임아웃/에러 시 해당 사이클 스킵, 다음 사이클 대기
- **비상 정지**: `/trading/stop` API로 수동 전체 중단 가능

### 9.4 기존 코드 활용/제거 계획

| 컴포넌트 | 처리 |
|---------|------|
| `strategies/` (9개 전략) | **제거** — LLM 에이전트가 직접 판단 |
| `pipeline/` (Evidence 시스템) | **제거** — 에이전트 구조로 대체 |
| `services/exchange.py` | **유지** — Upbit API 래퍼 그대로 활용 |
| `services/collector.py` | **유지+확장** — 전 종목 수집 + 기술지표 계산 |
| `services/risk_manager.py` | **유지+축소** — 하드코딩 리스크 한도만 (LLM 검증은 에이전트가 수행) |
| `services/portfolio.py` | **유지** — 포트폴리오 추적 그대로 |
| `services/scheduler.py` | **대체** — 사이클 오케스트레이터로 교체 |
| `services/notifier.py` | **대체** — 리포터 에이전트 + 텔레그램 발송기 |
| `services/backtester.py` | **보류** — LLM 백테스팅은 향후 과제 |
| `core/database.py` | **유지+확장** — 에이전트 관련 테이블 추가 |
| `core/config.py` | **유지+확장** — CLI/에이전트 설정 추가 |
| `api/routes_*.py` | **유지+수정** — 에이전트 상태/사이클 엔드포인트 추가 |

### 9.5 환경 변수

```env
# Claude CLI
CLAUDE_PATH=claude                    # CLI 바이너리 경로
AGENT_MODEL=claude-sonnet-4-6         # 에이전트 모델
REPORTER_MODEL=claude-sonnet-4-6      # 리포터 모델 (haiku로 변경 가능)

# 분석 사이클
AGENT_CYCLE_HOURS=06,10,14,18,22      # 정기 사이클 시간 (쉼표 구분)
AGENT_SCAN_TOP_N=20                   # 1차 스크리닝 후 정밀 분석 종목 수
AGENT_CYCLE_TIMEOUT=300               # 사이클 타임아웃 (초)

# 리스크 한도 (하드코딩 우선, 환경변수로 조정 가능)
AGENT_MAX_POSITIONS=5                 # 최대 동시 포지션
AGENT_MAX_POSITION_PCT=20             # 종목당 최대 배분 (%)
AGENT_MIN_CASH_RATIO=30               # 최소 현금 보유 비율 (%)
AGENT_MAX_DAILY_LOSS_PCT=3            # 일일 최대 손실 (%)
AGENT_MAX_TOTAL_LOSS_PCT=5            # 총 최대 손실 (%)
AGENT_MAX_TRADES_PER_DAY=10           # 일일 최대 거래 횟수
AGENT_STOP_LOSS_PCT=5                 # 종목별 손절 (%)

# 보고서
REPORT_DAILY_HOUR=21                  # 일일 리포트 발송 시간
REPORT_WEEKLY_DAY=1                   # 주간 리포트 요일 (1=월)
REPORT_WEEKLY_HOUR=9                  # 주간 리포트 시간

# 텔레그램 (기존)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

---

## 10. 구현 페이즈

### Phase 1: 기반 구축 — CLI 래퍼 + 에이전트 프레임워크
**목표:** Claude CLI 통합 + 에이전트 실행 기반

- [ ] `src/agent/claude_cli.py` — Claude CLI 래퍼 (content-pipeline 패턴 기반)
- [ ] `src/agent/agents.py` — AgentRunner (에이전트별 호출 관리)
- [ ] `src/agent/prompts.py` — 에이전트별 시스템 프롬프트 정의
- [ ] `src/agent/models.py` — 에이전트 입출력 Pydantic 모델 (ResearchReport, TechnicalReport, StrategyDecisions, RiskReview)
- [ ] `core/config.py` 확장 — CLI/에이전트 관련 환경변수
- [ ] `core/database.py` 확장 — `agent_sessions`, `agent_decisions`, `agent_cycles` 테이블
- [ ] 기존 `strategies/` 디렉토리 제거
- [ ] 기존 `pipeline/` 디렉토리 제거

### Phase 2: 데이터 수집 + 종목 스캐닝
**목표:** 전 종목 스캐닝 + 기술지표 사전 계산

- [ ] `src/agent/scanner.py` — 전 종목 거래량/변동성 기반 1차 필터링
- [ ] `src/agent/context_builder.py` — 에이전트별 프롬프트 데이터 조립
- [ ] `services/collector.py` 확장 — 동적 종목 관리, 전 종목 기본 데이터
- [ ] 기술지표 계산 유틸리티 (pandas-ta → 에이전트 컨텍스트용 요약)

### Phase 3: 에이전트 파이프라인 + 사이클 오케스트레이터
**목표:** 5개 에이전트 순차/병렬 실행 + 자동 사이클

- [ ] `src/agent/cycle.py` — CycleOrchestrator (메인 분석 사이클 로직)
- [ ] 리서처 + 테크니컬 병렬 실행
- [ ] 전략가 → 리스크 매니저 → 실행 → 리포터 순차 흐름
- [ ] `services/scheduler.py` 교체 — 사이클 기반 스케줄러
- [ ] 주문 실행 파이프라인 (승인된 거래만 → exchange.py)
- [ ] 전략가 연속 세션 관리 (resume/새 세션 전환 로직)

### Phase 4: 보고 시스템 + 지식베이스
**목표:** 텔레그램 체계적 보고 + 의사결정 지식 축적

- [ ] `src/agent/reporter.py` — 리포터 에이전트 오케스트레이션
- [ ] `src/agent/telegram.py` — 텔레그램 발송기 (기존 notifier.py 대체)
- [ ] 거래 알림, 사이클 보고, 일일/주간 리포트 자동 발송
- [ ] 리스크 경고 즉시 발송
- [ ] `core/database.py` — `reports` 테이블
- [ ] `src/agent/knowledge_base.py` — 지식베이스 관리 (읽기/쓰기/가지치기)
- [ ] `data/knowledge/` 디렉토리 구조 초기화
- [ ] 사이클 종료 시 자동 기록 (교훈, 종목 노트, 실패 사례)
- [ ] 전략가 프롬프트에 지식베이스 컨텍스트 주입
- [ ] 주간 다이제스트 자동 생성 + 원본 파일 압축
- [ ] 파일별 최대 줄 수 강제 + stale 항목 자동 정리

### Phase 5: 실전 배포 + 안정화
**목표:** 페이퍼 트레이딩 검증 → 실거래 전환

- [ ] 페이퍼 트레이딩 모드로 1~2주 운영
- [ ] 에이전트 판단 정확도 추적 (실제 가격 vs 예측)
- [ ] 에이전트 비용/시간 모니터링
- [ ] 세션 관리 안정성 테스트
- [ ] API 엔드포인트 정리 (에이전트 상태, 수동 사이클 트리거)
- [ ] 실거래 전환 (시드머니 50~100만원)

---

## 11. 수용 기준 (Acceptance Criteria)

### 필수 (Must Have)
- [ ] 5개 에이전트(리서처/테크니컬/전략가/리스크/리포터)가 독립적으로 실행된다
- [ ] 리서처가 Claude CLI의 웹 검색으로 뉴스/시장현황을 수집한다
- [ ] 테크니컬이 사전 계산된 기술지표를 분석하여 종목별 점수를 매긴다
- [ ] 전략가가 두 보고서를 종합하여 구조화된 거래 판단(JSON)을 내린다
- [ ] 전략가의 세션이 유지되어 이전 판단 맥락을 기억한다
- [ ] 리스크 매니저가 모든 거래를 검증하고 REJECT 시 실행되지 않는다
- [ ] Python 코드의 하드코딩 리스크 한도를 LLM이 우회할 수 없다
- [ ] 업비트 KRW 전 종목 스캐닝 → Top N 필터링이 동작한다
- [ ] 하루 N회 정기 사이클이 자동 실행된다
- [ ] 매수/매도 시 텔레그램 거래 알림 (근거 포함)
- [ ] 사이클마다 텔레그램 사이클 보고
- [ ] 일일 리포트 자동 발송
- [ ] 주간 리포트 자동 발송
- [ ] 리스크 경고 즉시 텔레그램 발송
- [ ] CLI 장애 시 해당 사이클 안전하게 스킵
- [ ] 지식베이스에 거래 결과/교훈이 자동 기록된다
- [ ] 전략가가 매 사이클마다 지식베이스(원칙, 실패사례, 종목노트)를 참조한다
- [ ] 주간 다이제스트가 자동 생성되고 원본 파일이 압축된다
- [ ] 파일별 최대 줄 수가 Python 코드로 강제된다
- [ ] 페이퍼 트레이딩 모드에서 전체 흐름이 동작한다

### 선택 (Nice to Have)
- [ ] 급등락 감지 시 긴급 분석 사이클 트리거
- [ ] 에이전트 판단 정확도 추적 (실제 가격 변동 vs 예측)
- [ ] 사용자가 텔레그램으로 수동 분석 요청
- [ ] 리포터 모델을 haiku로 전환하여 속도 최적화
- [ ] 전략가가 새 원칙을 자체 도출하고 strategy_rules.md에 추가

---

## 12. 리스크 및 완화 전략

| 리스크 | 영향 | 완화 |
|--------|------|------|
| LLM 할루시네이션 | 잘못된 거래 판단 | 에이전트 역할 분리 + 리스크 에이전트 VETO + 하드코딩 한도 |
| Claude CLI 장애/타임아웃 | 사이클 실패 | 사이클 스킵 + 다음 사이클 대기 + 텔레그램 경고 |
| 동시 세션 충돌 | CLI 에러 | 에이전트별 독립 세션 UUID + 고아 프로세스 킬링 |
| 전략가 세션 오염 | 편향된 판단 | 주기적 세션 리셋 (7일) + 성과 요약 캐리오버 |
| 시장 급변 (Flash Crash) | 큰 손실 | 하드코딩 stop-loss + 일일 손실 한도 자동 중단 |
| 구독 플랜 rate limit | 사이클 지연 | 사이클 간격 + 에이전트 호출 최소화 |

---

## 13. 성공 지표

| 지표 | 목표 |
|------|------|
| 월간 수익률 | > 0% (원금 보존 우선) |
| 최대 낙폭 (MDD) | < 10% |
| 승률 | > 55% |
| 사이클 성공률 | > 95% (CLI 장애 포함) |
| 보고서 정시 발송률 | 100% |
| 시스템 가동률 | > 99% |
| 리스크 에이전트 VETO 비율 | 10~30% (너무 낮으면 검증 부족) |

---

## 14. 디렉토리 구조 (최종)

```
coin-auto-trade/
├── src/
│   ├── main.py                    # FastAPI entry point
│   ├── agent/                     # 🆕 멀티 에이전트 시스템
│   │   ├── __init__.py
│   │   ├── claude_cli.py          # Claude CLI subprocess 래퍼
│   │   ├── agents.py              # AgentRunner (에이전트별 호출 관리)
│   │   ├── prompts.py             # 에이전트별 시스템 프롬프트
│   │   ├── models.py              # 에이전트 입출력 모델 (Pydantic)
│   │   ├── scanner.py             # 종목 스캐닝 (규칙 기반 1차 필터)
│   │   ├── context_builder.py     # 에이전트 프롬프트용 데이터 조립
│   │   ├── cycle.py               # CycleOrchestrator (분석 사이클)
│   │   ├── reporter.py            # 리포터 에이전트 오케스트레이션
│   │   ├── telegram.py            # 텔레그램 발송기
│   │   └── knowledge_base.py      # 🆕 의사결정 지식베이스 관리
│   ├── api/
│   │   ├── auth.py
│   │   ├── routes_trading.py
│   │   ├── routes_agent.py        # 🆕 에이전트 상태/사이클 API
│   │   ├── routes_dashboard.py
│   │   └── routes_system.py
│   ├── core/
│   │   ├── config.py              # 확장: CLI/에이전트 설정
│   │   ├── crypto.py
│   │   ├── database.py            # 확장: 에이전트 테이블
│   │   ├── constants.py
│   │   └── runtime.py
│   ├── services/
│   │   ├── exchange.py            # 유지
│   │   ├── collector.py           # 확장: 전 종목 수집
│   │   ├── portfolio.py           # 유지
│   │   └── risk_manager.py        # 축소: 하드코딩 한도만
│   ├── models/
│   │   ├── credential.py
│   │   ├── trading.py
│   │   └── dashboard.py
│   └── dashboard/
│       ├── templates/
│       └── static/
├── data/
│   └── knowledge/                 # 🆕 의사결정 지식베이스
│       ├── market_lessons.md      # 시장 교훈
│       ├── ticker_notes.md        # 종목별 관찰
│       ├── strategy_rules.md      # 자체 도출 매매 원칙
│       ├── mistakes.md            # 실패 사례집
│       └── weekly_digest/         # 주간 압축 요약
├── pyproject.toml
├── .env.example
└── CLAUDE.md
```
