import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border-light)] mt-20">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8">
          <div>
            <p className="font-semibold text-[var(--text-secondary)] mb-2">AI Blog</p>
            <p className="text-sm text-[var(--text-tertiary)] max-w-xs leading-relaxed">
              AI와 차세대 기술의 최신 트렌드를 쉽고 깊게 다룹니다.
            </p>
          </div>
          <div className="flex gap-12 text-sm">
            <div>
              <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">카테고리</h4>
              <ul className="space-y-2">
                <li><Link href="/category/ai" className="text-[var(--text-nav)] hover:text-[var(--accent)] transition">AI</Link></li>
                <li><Link href="/category/next-gen" className="text-[var(--text-nav)] hover:text-[var(--accent)] transition">Next Gen</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">링크</h4>
              <ul className="space-y-2">
                <li><Link href="/about" className="text-[var(--text-nav)] hover:text-[var(--accent)] transition">About</Link></li>
                <li><Link href="/privacy" className="text-[var(--text-nav)] hover:text-[var(--accent)] transition">개인정보처리방침</Link></li>
                <li><Link href="/feed" className="text-[var(--text-nav)] hover:text-[var(--accent)] transition">RSS</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-[var(--border-light)] text-center text-xs text-[var(--text-muted)]">
          &copy; {new Date().getFullYear()} AI Blog. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
