import type { TaskStore } from "@namukeu/agent-core";

/**
 * Seed initial autonomous tasks if none exist.
 * Called once on bot startup.
 */
export function seedInitialTasks(taskStore: TaskStore): void {
  const existing = taskStore.getAll();
  if (existing.length > 0) return; // Already has tasks

  console.log("[agent] Seeding initial autonomous tasks...");

  // Daily morning briefing — 매일 오전 9시 (CEO 총괄)
  taskStore.createTask({
    title: "일일 시스템 브리핑",
    prompt:
      "각 프로젝트 상태를 점검하고 간단한 일일 브리핑을 작성해.\n\n" +
      "점검 항목:\n" +
      "1. 서버 상태: coin-auto-trade(:8001), train-go(:8000), dashboard(:8002), ai-blog(:3100) 각각 health check\n" +
      "2. 최근 에러 로그 확인 (각 서버의 로그 파일)\n" +
      "3. coin-auto-trade: 현재 포지션과 수익률\n" +
      "4. ai-blog: 최근 게시글 현황\n\n" +
      "결과를 간결하게 요약해서 보고해.",
    type: "recurring",
    project: "GENERAL",
    scheduleCron: "0 9 * * *",
    notifyUser: true,
  });

  // BLOG 팀장 — 매주 월요일 10시에 블로그 개선점 분석
  taskStore.createTask({
    title: "BLOG 주간 개선 분석",
    prompt:
      "ai-blog 프로젝트를 분석하고 개선할 점을 찾아서 보고해.\n\n" +
      "분석 항목:\n" +
      "1. 코드 품질: 에러 처리, 타입 안전성, 중복 코드\n" +
      "2. SEO: sitemap, meta tags, structured data 상태\n" +
      "3. 성능: 번들 크기, 이미지 최적화, 캐싱\n" +
      "4. 콘텐츠: 기존 글 업데이트 필요 여부\n" +
      "5. 신규 기능 제안: 구현하면 좋을 기능 1-2개\n\n" +
      "각 항목에 대해 현 상태와 개선 제안을 간결하게 정리해.\n" +
      "실제 코드를 읽고 분석해. 추측하지 마.",
    type: "recurring",
    project: "BLOG",
    scheduleCron: "0 10 * * 1",
    notifyUser: true,
  });

  // COIN 팀장 — 매일 오후 6시 코인 전략 리뷰
  taskStore.createTask({
    title: "COIN 일일 전략 리뷰",
    prompt:
      "coin-auto-trade 프로젝트의 전략 성과를 분석해.\n\n" +
      "1. http://127.0.0.1:8001/status 로 현재 상태 확인\n" +
      "2. http://127.0.0.1:8001/positions 로 포지션 확인\n" +
      "3. http://127.0.0.1:8001/portfolio 로 포트폴리오 확인\n" +
      "4. 오늘의 거래 내역과 수익률 요약\n" +
      "5. 전략 개선 제안이 있으면 포함\n\n" +
      "Authorization: Bearer test-token-for-dev 헤더 사용.\n" +
      "결과를 간결하게 요약해서 보고해.",
    type: "recurring",
    project: "COIN",
    scheduleCron: "0 18 * * *",
    notifyUser: true,
  });

  // 10분 주기 서비스 모니터링 — 헬스체크 + 자체 개선점 파악
  taskStore.createTask({
    title: "서비스 모니터링 및 자체 개선",
    prompt:
      "10분 주기 자동 모니터링 태스크입니다.\n\n" +
      "1. 서비스 헬스체크:\n" +
      "   - coin-auto-trade: curl -s http://127.0.0.1:8001/status (Authorization: Bearer test-token-for-dev)\n" +
      "   - train-go: curl -s http://127.0.0.1:8000/health\n" +
      "   - dashboard: curl -s http://127.0.0.1:8002/health\n" +
      "   - ai-blog: curl -s http://127.0.0.1:3100\n" +
      "   - content-pipeline: curl -s http://127.0.0.1:8003/health\n\n" +
      "2. 장애 감지 시:\n" +
      "   - 해당 서비스의 프로세스 상태 확인\n" +
      "   - 최근 에러 로그 확인\n" +
      "   - 가능하면 재시작 시도 (1번만)\n\n" +
      "3. 자체 개선점 파악:\n" +
      "   - 최근 에러 로그에서 반복되는 패턴 탐지\n" +
      "   - 개선할 수 있는 간단한 항목이 있으면 메모\n\n" +
      "결과 요약: 모든 서비스 정상이면 '✅ 전체 정상'만 보고.\n" +
      "장애나 개선점이 있을 때만 상세 보고해.",
    type: "recurring",
    project: "GENERAL",
    scheduleCron: "*/10 * * * *",
    notifyUser: false,
  });

  // Server down auto-response
  taskStore.createTask({
    title: "서버 장애 대응",
    prompt:
      "서버 장애가 감지되었습니다. 아래 이벤트 컨텍스트를 확인하고:\n\n" +
      "1. 해당 서비스의 프로세스 상태 확인 (ps aux | grep)\n" +
      "2. 최근 로그에서 에러 원인 파악\n" +
      "3. 가능하면 서비스 재시작 시도 (launchctl stop/start)\n" +
      "4. 결과를 보고\n\n" +
      "주의: 무한 재시작하지 마. 1번만 시도해.",
    type: "event",
    eventTrigger: "server_down",
    project: "GENERAL",
    notifyUser: true,
  });

  console.log("[agent] 6 initial tasks seeded.");

  // TGBOT 팀장 — 매일 아침 8시 30분 재정 리포트
  taskStore.createTask({
    title: "TGBOT 일일 재정 리포트",
    prompt:
      "claude-telegram/data/revenue.json 파일을 읽어서 재정 상태를 보고해.\n\n" +
      "1. 현재 월 수익, 비용, 순수입 계산\n" +
      "2. 월간 목표 대비 진행률 (설정되어 있다면)\n" +
      "3. 최근 수익/비용 내역 확인\n" +
      "4. 손익 분석 및 개선 제안 (如果有)\n\n" +
      "결과를 간결하게 요약해서 보고해.\n" +
      "월간 목표가 0으로 설정되어 있으면 목표 설정 제안도 포함해.",
    type: "recurring",
    project: "GENERAL",
    scheduleCron: "30 8 * * *",
    notifyUser: true,
  });
}
