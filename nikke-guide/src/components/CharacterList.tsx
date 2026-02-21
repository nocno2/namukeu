"use client";

import { useState, useMemo } from "react";
import { NikkeCharacter } from "@/lib/types";
import { CharacterCard } from "./CharacterCard";
import { SearchBar } from "./SearchBar";
import { FilterTags } from "./FilterTags";

interface CharacterListProps {
  initialCharacters: NikkeCharacter[];
  allTags: string[];
}

export function CharacterList({ initialCharacters, allTags }: CharacterListProps) {
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");

  // 필터링된 캐릭터 목록
  const filteredCharacters = useMemo(() => {
    return initialCharacters.filter((char) => {
      const matchesSearch = char.name.toLowerCase().includes(search.toLowerCase());
      const matchesTag = selectedTag === "" || char.tags.includes(selectedTag);
      return matchesSearch && matchesTag;
    });
  }, [initialCharacters, search, selectedTag]);

  return (
    <div>
      {/* 검색 및 필터 */}
      <div className="mb-8 space-y-4">
        <SearchBar value={search} onChange={setSearch} />
        <FilterTags tags={allTags} selected={selectedTag} onChange={setSelectedTag} />

        {/* 결과 개수 */}
        <p className="text-[var(--nikke-text-muted)] text-sm">
          {filteredCharacters.length}개의 캐릭터
        </p>
      </div>

      {/* 캐릭터 그리드 */}
      {filteredCharacters.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {filteredCharacters.map((character) => (
            <CharacterCard key={character.id} character={character} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-[var(--nikke-text-muted)] text-lg">
            검색 결과가 없습니다
          </p>
        </div>
      )}
    </div>
  );
}
