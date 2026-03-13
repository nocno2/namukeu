"""의사결정 지식베이스 시스템 — KnowledgeBase"""

import logging
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

# 파일별 최대 줄 수
MAX_LINES = {
    "market_lessons.md": 200,
    "ticker_notes.md": 300,
    "strategy_rules.md": 100,
    "mistakes.md": 150,
}

KNOWLEDGE_DIR = Path("data/knowledge")


class KnowledgeBase:
    """MD 파일 기반 의사결정 지식베이스."""

    def __init__(self, base_dir: str | None = None):
        self.base_dir = Path(base_dir) if base_dir else KNOWLEDGE_DIR
        self.digest_dir = self.base_dir / "weekly_digest"
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.digest_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_files()

    def _ensure_files(self):
        for filename in MAX_LINES:
            filepath = self.base_dir / filename
            if not filepath.exists():
                filepath.write_text(f"# {filename.replace('.md', '').replace('_', ' ').title()}\n\n")

    def record_lesson(self, lesson: str, source: str = "cycle") -> None:
        """시장 교훈을 market_lessons.md에 추가한다."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        entry = f"\n## [{now}] {source}\n{lesson}\n"
        self._append("market_lessons.md", entry)
        self.enforce_limits("market_lessons.md")

    def record_ticker_note(self, ticker: str, note: str) -> None:
        """종목별 관찰을 ticker_notes.md에 추가한다."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        entry = f"\n## [{now}] {ticker}\n{note}\n"
        self._append("ticker_notes.md", entry)
        self.enforce_limits("ticker_notes.md")

    def record_mistake(self, ticker: str, mistake: str, lesson_learned: str) -> None:
        """실패 사례를 mistakes.md에 추가한다."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        entry = (
            f"\n## [{now}] {ticker}\n"
            f"실수: {mistake}\n"
            f"교훈: {lesson_learned}\n"
        )
        self._append("mistakes.md", entry)
        self.enforce_limits("mistakes.md")

    def update_rules(self, rule: str) -> None:
        """매매 원칙을 strategy_rules.md에 추가한다."""
        now = datetime.now().strftime("%Y-%m-%d")
        entry = f"\n- [{now}] {rule}\n"
        self._append("strategy_rules.md", entry)
        self.enforce_limits("strategy_rules.md")

    def get_strategist_context(self, relevant_tickers: list[str] | None = None) -> str:
        """전략가용 지식베이스 컨텍스트를 반환한다.

        구성: 원칙 전체 + 최근 실패 10건 + 관련 종목 노트 + 최근 교훈 5건
        """
        lines = []

        # 1. 매매 원칙 (전체)
        rules = self._read("strategy_rules.md")
        if rules.strip():
            lines.append("### 매매 원칙")
            lines.append(rules)
            lines.append("")

        # 2. 최근 실패 사례 (최근 10건)
        mistakes = self._read("mistakes.md")
        recent_mistakes = self._get_recent_entries(mistakes, count=10)
        if recent_mistakes:
            lines.append("### 최근 실패 사례")
            lines.append(recent_mistakes)
            lines.append("")

        # 3. 관련 종목 노트
        if relevant_tickers:
            notes = self._read("ticker_notes.md")
            relevant = self._filter_ticker_entries(notes, relevant_tickers)
            if relevant:
                lines.append("### 관련 종목 노트")
                lines.append(relevant)
                lines.append("")

        # 4. 최근 교훈 (최근 5건)
        lessons = self._read("market_lessons.md")
        recent_lessons = self._get_recent_entries(lessons, count=5)
        if recent_lessons:
            lines.append("### 최근 시장 교훈")
            lines.append(recent_lessons)
            lines.append("")

        return "\n".join(lines)

    def enforce_limits(self, filename: str | None = None) -> None:
        """파일별 최대 줄 수를 초과하면 오래된 항목을 삭제한다."""
        targets = [filename] if filename else list(MAX_LINES.keys())
        for fname in targets:
            if fname is None:
                continue
            max_lines = MAX_LINES.get(fname, 200)
            filepath = self.base_dir / fname
            if not filepath.exists():
                continue
            content = filepath.read_text(encoding="utf-8")
            all_lines = content.split("\n")
            if len(all_lines) > max_lines:
                # 헤더(첫 줄) 보존 + 뒤쪽(최신) 유지
                header = all_lines[0]
                kept = all_lines[-(max_lines - 2):]
                filepath.write_text(header + "\n\n" + "\n".join(kept) + "\n", encoding="utf-8")
                logger.info(f"지식베이스 {fname}: {len(all_lines)} → {max_lines} 줄로 압축")

    def generate_weekly_digest(self) -> str | None:
        """주간 다이제스트를 생성하고 원본 파일을 압축한다."""
        now = datetime.now()
        week_str = now.strftime("%Y-W%W")
        digest_path = self.digest_dir / f"digest-{week_str}.md"

        if digest_path.exists():
            return None  # 이미 생성됨

        lines = [
            f"# 주간 다이제스트 ({week_str})",
            f"생성일: {now.strftime('%Y-%m-%d %H:%M')}",
            "",
        ]

        for fname in MAX_LINES:
            content = self._read(fname)
            if content.strip():
                title = fname.replace(".md", "").replace("_", " ").title()
                lines.append(f"## {title}")
                lines.append(content[:2000])
                lines.append("")

        digest = "\n".join(lines)
        digest_path.write_text(digest, encoding="utf-8")

        # 원본 파일 초기화 (헤더만 남기기)
        for fname in MAX_LINES:
            filepath = self.base_dir / fname
            if filepath.exists():
                header_line = filepath.read_text(encoding="utf-8").split("\n")[0]
                filepath.write_text(header_line + "\n\n", encoding="utf-8")

        logger.info(f"주간 다이제스트 생성: {digest_path}")
        return str(digest_path)

    def prune_stale_tickers(self, active_tickers: list[str], stale_days: int = 30) -> int:
        """30일간 거래 없는 종목 노트를 삭제한다."""
        filepath = self.base_dir / "ticker_notes.md"
        if not filepath.exists():
            return 0

        content = filepath.read_text(encoding="utf-8")
        entries = content.split("\n## ")
        if not entries:
            return 0

        header = entries[0]
        kept = []
        removed = 0
        cutoff = datetime.now() - timedelta(days=stale_days)

        for entry in entries[1:]:
            try:
                date_part = entry.split("]")[0].split("[")[1].strip()
                entry_date = datetime.strptime(date_part, "%Y-%m-%d %H:%M")
                after_bracket = entry.split("]")[1].strip()
                ticker = after_bracket.split("\n")[0].strip()

                if entry_date < cutoff and ticker not in active_tickers:
                    removed += 1
                    continue
            except (IndexError, ValueError):
                pass

            kept.append(entry)

        if removed > 0:
            new_content = header + "\n## ".join([""] + kept) if kept else header + "\n"
            filepath.write_text(new_content, encoding="utf-8")
            logger.info(f"오래된 종목 노트 {removed}건 삭제")

        return removed

    # ── 내부 헬퍼 ──

    def _read(self, filename: str) -> str:
        filepath = self.base_dir / filename
        if filepath.exists():
            return filepath.read_text(encoding="utf-8")
        return ""

    def _append(self, filename: str, text: str) -> None:
        filepath = self.base_dir / filename
        with open(filepath, "a", encoding="utf-8") as f:
            f.write(text)

    def _get_recent_entries(self, content: str, count: int = 10) -> str:
        """## 로 시작하는 최근 N개 항목을 추출한다."""
        entries = content.split("\n## ")
        if len(entries) <= 1:
            return ""
        recent = entries[-count:]
        return "\n## ".join(recent)

    def _filter_ticker_entries(self, content: str, tickers: list[str]) -> str:
        """특정 종목에 해당하는 노트만 필터링한다."""
        entries = content.split("\n## ")
        matched = []
        for entry in entries[1:]:
            for ticker in tickers:
                if ticker in entry:
                    matched.append(entry)
                    break
        if not matched:
            return ""
        return "\n## ".join([""] + matched[-10:])
