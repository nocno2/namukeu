"""Evolution Engine — goal-driven service improvement loop.

Cycles through services in round-robin order.
- Services WITH goals: analyze progress, propose next improvement.
- Services WITHOUT goals: analyze service and propose goals.
"""

import json
import logging
from datetime import datetime

from src.agent.goals import GoalStore
from src.agent.types import PROJECT_DIR_MAP
from src.db.connection import Database

logger = logging.getLogger(__name__)

EVOLUTION_PROJECT_POOL = ["COIN", "BLOG", "DASH", "TRAIN", "TGBOT", "DCBOT"]

EVOLUTION_PRINCIPLES = """
## 서비스 진화 5대 원칙
1. **회복 탄력성(Resilience)**: 어떤 개선도 시스템 가용성을 해치지 않는다. Fallback을 항상 고려.
2. **기술적 순도(Technical Purity)**: 클린 코드, 좋은 아키텍처를 유지. 기술적 부채를 만들지 않는다.
3. **환경 유연성(Portability)**: 현재 macOS와 향후 Docker 환경 모두에서 작동하도록.
4. **수치 기반 개선(Metric-Driven)**: 개선 시 기대 성능 향상/리소스 절감 수치를 논리적으로 제시.
5. **목표 정렬(Goal Alignment)**: 모든 변경은 서비스별 목표에 부합해야 한다.
""".strip()


class EvolutionEngine:
    def __init__(self, db: Database, goal_store: GoalStore):
        self.db = db
        self.goal_store = goal_store
        self._ensure_table()

    def _ensure_table(self):
        """Ensure evolution_state table exists and agent_goals supports 'proposed' status."""
        with self.db._lock:
            self.db.conn.execute("""
                CREATE TABLE IF NOT EXISTS evolution_state (
                    project TEXT PRIMARY KEY,
                    last_cycle_at TEXT,
                    last_cycle_result TEXT,
                    cycle_count INTEGER DEFAULT 0,
                    rejected_proposals TEXT DEFAULT '[]',
                    updated_at TEXT NOT NULL
                )
            """)
            # Add source column to agent_goals if missing
            try:
                self.db.conn.execute("SELECT source FROM agent_goals LIMIT 1")
            except Exception:
                self.db.conn.execute("ALTER TABLE agent_goals ADD COLUMN source TEXT DEFAULT 'user'")

            # Migrate agent_goals CHECK constraint to include 'proposed'
            # SQLite can't ALTER CHECK constraints, so recreate table if needed
            try:
                # Test if 'proposed' status is allowed
                self.db.conn.execute(
                    "INSERT INTO agent_goals (id, title, description, projects, status, created_at, updated_at) "
                    "VALUES ('__test__', 'test', 'test', '[]', 'proposed', '', '')"
                )
                self.db.conn.execute("DELETE FROM agent_goals WHERE id = '__test__'")
            except Exception:
                # CHECK constraint blocks 'proposed' — recreate the table
                logger.info("Migrating agent_goals table to support 'proposed' status")
                self.db.conn.executescript("""
                    ALTER TABLE agent_goals RENAME TO agent_goals_old;
                    CREATE TABLE agent_goals (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        description TEXT NOT NULL,
                        projects TEXT NOT NULL,
                        status TEXT DEFAULT 'active' CHECK(status IN ('active','completed','paused','proposed')),
                        priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
                        deadline TEXT,
                        progress TEXT,
                        source TEXT DEFAULT 'user',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    INSERT INTO agent_goals SELECT
                        id, title, description, projects, status, priority, deadline, progress,
                        COALESCE(source, 'user'), created_at, updated_at
                    FROM agent_goals_old;
                    DROP TABLE agent_goals_old;
                """)
            self.db.conn.commit()

    def get_next_project(self) -> str:
        """Round-robin: return the project least recently cycled."""
        states = {s["project"]: s for s in self.get_all_states()}

        candidates = []
        for p in EVOLUTION_PROJECT_POOL:
            state = states.get(p)
            last = state["last_cycle_at"] if state else None
            candidates.append((p, last or "1970-01-01T00:00:00"))

        candidates.sort(key=lambda x: x[1])
        return candidates[0][0]

    def get_state(self, project: str) -> dict | None:
        with self.db._lock:
            row = self.db.conn.execute(
                "SELECT * FROM evolution_state WHERE project = ?", (project,)
            ).fetchone()
        return dict(row) if row else None

    def get_all_states(self) -> list[dict]:
        with self.db._lock:
            rows = self.db.conn.execute(
                "SELECT * FROM evolution_state ORDER BY last_cycle_at ASC"
            ).fetchall()
        return [dict(r) for r in rows]

    def record_cycle(self, project: str, result_summary: str):
        now = datetime.now().isoformat()
        with self.db._lock:
            existing = self.db.conn.execute(
                "SELECT project FROM evolution_state WHERE project = ?", (project,)
            ).fetchone()
            if existing:
                self.db.conn.execute(
                    "UPDATE evolution_state SET last_cycle_at=?, last_cycle_result=?, "
                    "cycle_count=cycle_count+1, updated_at=? WHERE project=?",
                    (now, result_summary[:500], now, project),
                )
            else:
                self.db.conn.execute(
                    "INSERT INTO evolution_state (project, last_cycle_at, last_cycle_result, "
                    "cycle_count, rejected_proposals, updated_at) VALUES (?,?,?,1,'[]',?)",
                    (project, now, result_summary[:500], now),
                )
            self.db.conn.commit()

    def record_rejected(self, project: str, proposal: str):
        state = self.get_state(project)
        rejected = json.loads(state["rejected_proposals"]) if state else []
        rejected.append(proposal)
        # Keep last 20
        rejected = rejected[-20:]
        now = datetime.now().isoformat()
        with self.db._lock:
            if state:
                self.db.conn.execute(
                    "UPDATE evolution_state SET rejected_proposals=?, updated_at=? WHERE project=?",
                    (json.dumps(rejected, ensure_ascii=False), now, project),
                )
            else:
                self.db.conn.execute(
                    "INSERT INTO evolution_state (project, rejected_proposals, updated_at) VALUES (?,?,?)",
                    (project, json.dumps(rejected, ensure_ascii=False), now),
                )
            self.db.conn.commit()

    def build_evolution_prompt(self, project: str) -> str:
        """Build prompt based on whether the project has goals."""
        active_goals = self.goal_store.get_by_project(project)
        proposed_goals = [g for g in self.goal_store.get_proposed() if project in g["projects"]]
        state = self.get_state(project)
        rejected = json.loads(state["rejected_proposals"]) if state and state.get("rejected_proposals") else []
        project_dir = PROJECT_DIR_MAP.get(project, ".")

        if active_goals:
            return self._build_improvement_prompt(project, project_dir, active_goals, rejected)
        elif proposed_goals:
            # Already proposed but not yet approved — skip proposal, do improvement work
            return self._build_improvement_prompt(project, project_dir, proposed_goals, rejected)
        else:
            return self._build_goal_proposal_prompt(project, project_dir, rejected)

    def _build_goal_proposal_prompt(self, project: str, project_dir: str, rejected: list[str]) -> str:
        rejected_section = ""
        if rejected:
            rejected_section = (
                "\n\n## 이전에 거절된 제안\n"
                "아래 항목은 사용자가 이미 거절했으므로 절대 다시 제안하지 마:\n"
                + "\n".join(f"- {r}" for r in rejected[-10:])
            )

        return (
            f"# {project} 서비스 진화 분석 + 즉시 개선\n\n"
            f"{EVOLUTION_PRINCIPLES}\n\n"
            f"## 분석 대상\n"
            f"{project} 프로젝트({project_dir}/)의 코드를 실제로 읽고 분석해.\n\n"
            f"## 요청 (2단계)\n"
            f"이 프로젝트에는 아직 목표가 설정되어 있지 않다.\n\n"
            f"### 1단계: 목표 제안\n"
            f"서비스의 현재 상태를 진단하고, 2-3개의 구체적인 진화 목표를 제안해.\n\n"
            f"### 2단계: 즉시 실행 가능한 개선 1건 직접 수행\n"
            f"분석 중 발견한 개선점 중 **위험도가 낮고 효과가 확실한 작업 1건**을 골라서 직접 코드를 수정해.\n"
            f"예: 버그 수정, 에러 핸들링 추가, 설정값 최적화, 누락된 로깅 추가 등.\n"
            f"**분석만 하고 끝내지 마. 반드시 코드 변경 1건을 실행해.**\n\n"
            f"### 분석 워크플로우\n"
            f"1. 프로젝트 구조와 핵심 기능 파악\n"
            f"2. 사용자 가치 관점에서 병목/개선점 식별\n"
            f"3. 기대 효과를 수치로 제시 가능한 목표 수립\n"
            f"4. 즉시 수행할 소규모 개선 선정 및 실행\n\n"
            f"### 목표 기준\n"
            f"- 사용자 가치 중심 (코드 품질보다 서비스 성장)\n"
            f"- 현실적으로 달성 가능한 범위\n"
            f"- 명확한 완료 기준과 기대 효과\n\n"
            f"### 출력 형식\n"
            f"각 목표에 대해:\n"
            f"1. 현재 상태 → 개선 목표 → 기대 효과 순으로 설명\n"
            f"2. 반드시 아래 태그 사용:\n"
            f"[GOAL_PROPOSE: 목표 제목 | DESC: 상세 설명 (현재 상태와 기대 효과 포함) | PRIORITY: high/medium/low]\n\n"
            f"즉시 실행한 개선에 대해서는 변경 파일과 내용을 보고해.\n"
            f"태그 없이 설명만 하지 마. 반드시 태그를 출력해."
            f"{rejected_section}"
        )

    def _build_improvement_prompt(self, project: str, project_dir: str, goals: list[dict], rejected: list[str]) -> str:
        goals_text = "\n".join(
            f"- [{g['priority'].upper()}] **{g['title']}**: {g['description']}"
            + (f"\n  현재 진행: {g['progress']}" if g.get("progress") else "")
            for g in goals
        )

        rejected_section = ""
        if rejected:
            rejected_section = (
                "\n\n## 이전에 거절된 제안\n"
                "아래 항목은 절대 다시 제안하지 마:\n"
                + "\n".join(f"- {r}" for r in rejected[-10:])
            )

        return (
            f"# {project} 서비스 진화 사이클\n\n"
            f"{EVOLUTION_PRINCIPLES}\n\n"
            f"## 현재 목표\n{goals_text}\n\n"
            f"## 워크플로우 (분석 + 실행)\n"
            f"1. {project} 프로젝트({project_dir}/)의 코드를 실제로 읽어라\n"
            f"2. 각 목표의 현재 달성 상태를 코드 기반으로 평가\n"
            f"3. 가장 진전이 필요한 목표 1개를 선택\n"
            f"4. **그 목표를 진전시키는 구체적인 코드 변경을 직접 수행해.**\n"
            f"   - 위험도가 낮은 작업: 직접 코드 수정 후 커밋\n"
            f"   - 위험도가 높은 작업: [CHAIN] 태그로 승인 요청\n\n"
            f"**중요: 분석만 하고 끝내지 마. 매 사이클마다 최소 1건의 코드 변경을 수행해야 한다.**\n\n"
            f"## 진행 상황 업데이트\n"
            f"각 목표의 진행 상황을 업데이트하려면 (여러 개 가능):\n"
            f"[GOAL_PROGRESS: 목표 제목의 일부 | PROGRESS: 구체적인 진행 상황 설명]\n\n"
            f"## 위험도 높은 작업 등록\n"
            f"기존 동작을 변경하거나 외부 API와 관련된 작업은 아래 태그로 승인 요청:\n"
            f"[CHAIN: 작업 제목 | PROMPT: 구체적인 구현 지시 (파일 경로, 변경 내용, 기대 효과 포함) | APPROVAL: true]\n\n"
            f"### 보고 형식\n"
            f"- 직접 수행한 변경: 파일 경로, 변경 내용, 기대 효과\n"
            f"- 승인 필요 작업: [CHAIN] 태그로 등록 (APPROVAL: true 필수)\n"
            f"- 코드를 실제로 읽고 분석한 결과만 보고. 추측하지 마."
            f"{rejected_section}"
        )
