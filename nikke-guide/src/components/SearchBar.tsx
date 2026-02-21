"use client";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = "캐릭터 검색..." }: SearchBarProps) {
  return (
    <div className="relative">
      <svg
        className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--nikke-text-muted)]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-12 pr-4 py-3 bg-[var(--nikke-bg-card)] border border-[var(--nikke-neon-blue)]/30 rounded-xl text-white placeholder-[var(--nikke-text-muted)] focus:outline-none focus:border-[var(--nikke-neon-blue)] focus:ring-1 focus:ring-[var(--nikke-neon-blue)]/50 transition-all"
      />
    </div>
  );
}
