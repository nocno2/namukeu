import { Suspense } from "react";
import { fetchSheetData } from "@/lib/data";
import { CharacterCard } from "@/components/CharacterCard";
import { CharacterList } from "@/components/CharacterList";

export const revalidate = 3600; // 1시간마다 재검증

export default async function Home() {
  const characters = await fetchSheetData();

  // 모든 태그 추출
  const allTags = [...new Set(characters.flatMap((c) => c.tags))];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* 히어로 섹션 */}
      <section className="mb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          <span className="neon-pink">NIKKE</span>{" "}
          <span className="neon-blue">육성 가이드</span>
        </h1>
        <p className="text-[var(--nikke-text-muted)] text-lg">
          스킬, 오버로드, 장비 가이드 한눈에 보기
        </p>
      </section>

      {/* 캐릭터 목록 (클라이언트 컴포넌트) */}
      <Suspense fallback={<div className="text-center py-20">로딩 중...</div>}>
        <CharacterList initialCharacters={characters} allTags={allTags} />
      </Suspense>
    </div>
  );
}
