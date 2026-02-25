import type { Metadata } from "next";
import Link from "next/link";
import { rawDb } from "@/lib/db";

export const metadata: Metadata = {
  title: "검색 결과",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface SearchResult {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  publishedAt: string | null;
  tags: string | null;
  title_snippet: string;
  content_snippet: string;
}

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q, page: pageStr } = await searchParams;
  const query = q?.trim() || "";
  const page = Math.max(1, parseInt(pageStr || "1"));
  const limit = 10;
  const offset = (page - 1) * limit;

  let results: SearchResult[] = [];
  let total = 0;

  if (query) {
    const sanitized = query.replace(/['"(){}[\]*:^~!@#$%&\\]/g, "").trim();

    if (sanitized) {
      const ftsQuery = sanitized
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => `"${word}"*`)
        .join(" ");

      try {
        const countResult = rawDb
          .query<{ total: number }, [string]>(
            `SELECT COUNT(*) as total
             FROM posts_fts
             JOIN posts ON posts.id = posts_fts.rowid
             WHERE posts_fts MATCH ?
               AND posts.status = 'published'`
          )
          .get(ftsQuery);

        total = countResult?.total || 0;

        if (total > 0) {
          results = rawDb
            .query<SearchResult, [string, number, number]>(
              `SELECT
                 posts.id,
                 posts.title,
                 posts.slug,
                 posts.excerpt,
                 categories.name as categoryName,
                 categories.slug as categorySlug,
                 posts.published_at as publishedAt,
                 (SELECT GROUP_CONCAT(t.name || ':' || t.slug, ',')
                  FROM post_tags pt
                  JOIN tags t ON pt.tag_id = t.id
                  WHERE pt.post_id = posts.id) as tags,
                 snippet(posts_fts, 0, '<mark>', '</mark>', '...', 10) as title_snippet,
                 snippet(posts_fts, 1, '<mark>', '</mark>', '...', 30) as content_snippet
               FROM posts_fts
               JOIN posts ON posts.id = posts_fts.rowid
               LEFT JOIN categories ON posts.category_id = categories.id
               WHERE posts_fts MATCH ?
                 AND posts.status = 'published'
               ORDER BY rank
               LIMIT ? OFFSET ?`
            )
            .all(ftsQuery, limit, offset);
        }
      } catch {
        // FTS 실패 시 LIKE 폴백
        const likeQuery = `%${sanitized}%`;
        const countResult = rawDb
          .query<{ total: number }, [string, string]>(
            `SELECT COUNT(*) as total FROM posts
             WHERE status = 'published' AND (title LIKE ? OR content LIKE ?)`
          )
          .get(likeQuery, likeQuery);
        total = countResult?.total || 0;

        results = rawDb
          .query<SearchResult, [string, string, number, number]>(
            `SELECT
               posts.id, posts.title, posts.slug, posts.excerpt,
               categories.name as categoryName, categories.slug as categorySlug,
               posts.published_at as publishedAt,
               (SELECT GROUP_CONCAT(t.name || ':' || t.slug, ',')
                FROM post_tags pt JOIN tags t ON pt.tag_id = t.id
                WHERE pt.post_id = posts.id) as tags,
               posts.title as title_snippet,
               '' as content_snippet
             FROM posts
             LEFT JOIN categories ON posts.category_id = categories.id
             WHERE posts.status = 'published' AND (posts.title LIKE ? OR posts.content LIKE ?)
             ORDER BY posts.published_at DESC
             LIMIT ? OFFSET ?`
          )
          .all(likeQuery, likeQuery, limit, offset);
      }
    }
  }

  const pages = Math.ceil(total / limit);

  const parseTags = (tagsStr: string | null) =>
    tagsStr
      ? tagsStr.split(",").map((t) => {
          const [name, slug] = t.split(":");
          return { name, slug };
        })
      : [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-[var(--text-secondary)]">
          검색 결과
        </h1>
        {query && (
          <p className="text-[var(--text-tertiary)] mt-2">
            &ldquo;{query}&rdquo;에 대한 검색 결과{" "}
            <span className="font-medium text-[var(--accent)]">{total}건</span>
          </p>
        )}
      </header>

      {!query ? (
        <p className="text-[var(--text-tertiary)] text-center py-12">
          검색어를 입력해주세요.
        </p>
      ) : results.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[var(--text-muted)] text-lg mb-2">
            검색 결과가 없습니다.
          </p>
          <p className="text-[var(--text-muted)] text-sm">
            다른 키워드로 검색해 보세요.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-6">
            {results.map((result) => {
              const resultTags = parseTags(result.tags);
              return (
                <article
                  key={result.id}
                  className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)]/50 p-6 card-hover"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {result.categoryName && result.categorySlug && (
                      <Link
                        href={`/category/${result.categorySlug}`}
                        className="tag-chip bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
                      >
                        {result.categoryName}
                      </Link>
                    )}
                    {result.publishedAt && (
                      <time
                        dateTime={result.publishedAt}
                        className="text-xs text-[var(--text-muted)]"
                      >
                        {new Date(result.publishedAt).toLocaleDateString(
                          "ko-KR",
                          { year: "numeric", month: "short", day: "numeric" }
                        )}
                      </time>
                    )}
                  </div>

                  <h2 className="text-lg font-semibold text-[var(--text-secondary)] mb-2">
                    <Link
                      href={`/posts/${result.slug}`}
                      className="hover:text-[var(--accent)] transition [&_mark]:bg-[var(--accent)]/20 [&_mark]:text-[var(--accent)] [&_mark]:px-0.5 [&_mark]:rounded"
                      dangerouslySetInnerHTML={{
                        __html: result.title_snippet || result.title,
                      }}
                    />
                  </h2>

                  {(result.content_snippet || result.excerpt) && (
                    <p
                      className="text-sm text-[var(--text-tertiary)] leading-relaxed line-clamp-3 mb-3 [&_mark]:bg-[var(--accent)]/20 [&_mark]:text-[var(--accent)] [&_mark]:px-0.5 [&_mark]:rounded"
                      dangerouslySetInnerHTML={{
                        __html:
                          result.content_snippet || result.excerpt || "",
                      }}
                    />
                  )}

                  {resultTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {resultTags.map((tag) => (
                        <Link
                          key={tag.slug}
                          href={`/tags/${tag.slug}`}
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition"
                        >
                          #{tag.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* 페이지네이션 */}
          {pages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-10">
              {page > 1 && (
                <Link
                  href={`/search?q=${encodeURIComponent(query)}&page=${page - 1}`}
                  className="px-4 py-2 text-sm rounded-lg bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-white transition"
                >
                  &larr; 이전
                </Link>
              )}
              <span className="text-sm text-[var(--text-muted)]">
                {page} / {pages}
              </span>
              {page < pages && (
                <Link
                  href={`/search?q=${encodeURIComponent(query)}&page=${page + 1}`}
                  className="px-4 py-2 text-sm rounded-lg bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-white transition"
                >
                  다음 &rarr;
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
