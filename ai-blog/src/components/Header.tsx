import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-[var(--bg)]/90 backdrop-blur-md border-b border-[var(--border-light)]">
      <nav className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight text-[var(--text-secondary)]">
          Namukeu Blog
        </Link>
        <ul className="flex items-center gap-1 text-sm">
          <li>
            <Link href="/category/ai" className="px-3 py-1.5 rounded-full text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition">
              AI
            </Link>
          </li>
          <li>
            <Link href="/category/next-gen" className="px-3 py-1.5 rounded-full text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition">
              Next Gen
            </Link>
          </li>
          <li>
            <Link href="/tags" className="px-3 py-1.5 rounded-full text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition">
              Tags
            </Link>
          </li>
          <li>
            <Link href="/about" className="px-3 py-1.5 rounded-full text-[var(--text-nav)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition">
              About
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
