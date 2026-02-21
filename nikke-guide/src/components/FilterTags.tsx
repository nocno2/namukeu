"use client";

interface FilterTagsProps {
  tags: string[];
  selected: string;
  onChange: (tag: string) => void;
}

export function FilterTags({ tags, selected, onChange }: FilterTagsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange("")}
        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
          selected === ""
            ? "bg-[var(--nikke-neon-pink)] text-white"
            : "bg-[var(--nikke-bg-card)] text-[var(--nikke-text-muted)] hover:text-white border border-[var(--nikke-neon-pink)]/30"
        }`}
      >
        전체
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          onClick={() => onChange(tag === selected ? "" : tag)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            selected === tag
              ? "bg-[var(--nikke-neon-blue)] text-white"
              : "bg-[var(--nikke-bg-card)] text-[var(--nikke-text-muted)] hover:text-white border border-[var(--nikke-neon-blue)]/30"
          }`}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
