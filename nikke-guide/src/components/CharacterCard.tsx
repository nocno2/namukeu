"use client";

import { NikkeCharacter } from "@/lib/types";

interface CharacterCardProps {
  character: NikkeCharacter;
}

/** 캐릭터 카드 컴포넌트 */
export function CharacterCard({ character }: CharacterCardProps) {
  return (
    <a
      href={`/character/${character.id}`}
      className="block bg-[var(--nikke-bg-card)] rounded-xl overflow-hidden card-glow transition-all duration-300 hover:transform hover:scale-[1.02]"
    >
      {/* 캐릭터 이미지 */}
      <div className="relative aspect-[3/4] bg-[var(--nikke-bg-secondary)]">
        <img
          src={character.imageUrl}
          alt={character.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            // 이미지 로드 실패 시 대체 이미지
            e.currentTarget.src = `https://placehold.co/300x400/1a1a24/ff2d6a?text=${encodeURIComponent(character.name)}`;
          }}
        />
        {/* 태그 배지 */}
        <div className="absolute top-2 right-2 flex gap-1 flex-wrap justify-end">
          {character.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--nikke-neon-blue)]/20 text-[var(--nikke-neon-blue)] border border-[var(--nikke-neon-blue)]/40"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* 캐릭터 정보 */}
      <div className="p-4">
        <h3 className="text-lg font-bold text-white mb-2">{character.name}</h3>

        {/* 스킬 정보 */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--nikke-text-muted)]">권장:</span>
            <span className="text-[var(--nikke-neon-green)] font-mono">
              {character.skills.recommended}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--nikke-text-muted)]">종결:</span>
            <span className="text-[var(--nikke-neon-pink)] font-mono">
              {character.skills.full}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
