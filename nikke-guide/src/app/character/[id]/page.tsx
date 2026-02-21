import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchSheetData } from "@/lib/data";

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CharacterPage({ params }: PageProps) {
  const { id } = await params;
  // URL 디코딩 (한글 URL 처리)
  const decodedId = decodeURIComponent(id);
  const characters = await fetchSheetData();
  const character = characters.find((c) => c.id === decodedId);

  if (!character) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 뒤로 가기 */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-[var(--nikke-text-muted)] hover:text-white mb-6 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        목록으로
      </Link>

      <div className="grid md:grid-cols-2 gap-8">
        {/* 캐릭터 이미지 */}
        <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-[var(--nikke-bg-card)]">
          <img
            src={character.imageUrl}
            alt={character.name}
            className="w-full h-full object-cover"
          />
        </div>

        {/* 캐릭터 정보 */}
        <div>
          <h1 className="text-3xl font-bold mb-4">{character.name}</h1>

          {/* 태그 */}
          <div className="flex gap-2 mb-6">
            {character.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 text-sm font-medium rounded-full bg-[var(--nikke-neon-blue)]/20 text-[var(--nikke-neon-blue)] border border-[var(--nikke-neon-blue)]/40"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* 스킬 정보 */}
          <div className="space-y-4 mb-6">
            <h2 className="text-xl font-semibold neon-blue">스킬</h2>
            <div className="bg-[var(--nikke-bg-card)] rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[var(--nikke-text-muted)]">기본</span>
                <span className="font-mono text-white">{character.skills.basic}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--nikke-text-muted)]">권장</span>
                <span className="font-mono text-[var(--nikke-neon-green)]">{character.skills.recommended}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--nikke-text-muted)]">종결</span>
                <span className="font-mono text-[var(--nikke-neon-pink)]">{character.skills.full}</span>
              </div>
            </div>
          </div>

          {/* 오버로드 */}
          <div className="space-y-2 mb-6">
            <h2 className="text-xl font-semibold neon-pink">오버로드</h2>
            <div className="bg-[var(--nikke-bg-card)] rounded-lg p-4">
              <p className="text-white">{character.overload || "-"}</p>
            </div>
          </div>

          {/* 장비/큐브 */}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-[var(--nikke-neon-purple)]">장비 (큐브)</h2>
            <div className="bg-[var(--nikke-bg-card)] rounded-lg p-4">
              <p className="text-white">{character.cube || "-"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
