import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";

interface FtsRow {
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

// GET /api/search?q=키워드&page=1
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = 10;
  const offset = (page - 1) * limit;

  if (!q || q.length < 1) {
    return NextResponse.json({ results: [], pagination: { page, total: 0, pages: 0 } });
  }

  // FTS5 쿼리용 검색어 가공: 특수문자 제거 후 각 단어에 * 붙이기 (prefix 검색)
  const sanitized = q.replace(/['"(){}[\]*:^~!@#$%&\\]/g, "").trim();
  if (!sanitized) {
    return NextResponse.json({ results: [], pagination: { page, total: 0, pages: 0 } });
  }

  const ftsQuery = sanitized
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `"${word}"*`)
    .join(" ");

  try {
    // 총 결과 수 조회
    const countResult = rawDb
      .query<{ total: number }, [string]>(
        `SELECT COUNT(*) as total
         FROM posts_fts
         JOIN posts ON posts.id = posts_fts.rowid
         WHERE posts_fts MATCH ?
           AND posts.status = 'published'`
      )
      .get(ftsQuery);

    const total = countResult?.total || 0;

    if (total === 0) {
      return NextResponse.json({ results: [], pagination: { page, total: 0, pages: 0 } });
    }

    // 검색 결과 + snippet 조회
    const results = rawDb
      .query<FtsRow, [string, number, number]>(
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

    const formatted = results.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.content_snippet || row.excerpt || "",
      titleHighlight: row.title_snippet || row.title,
      categoryName: row.categoryName,
      categorySlug: row.categorySlug,
      publishedAt: row.publishedAt,
      tags: row.tags
        ? row.tags.split(",").map((t) => {
            const [name, slug] = t.split(":");
            return { name, slug };
          })
        : [],
    }));

    return NextResponse.json({
      results: formatted,
      pagination: {
        page,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch {
    // FTS 쿼리 실패 시 LIKE 폴백
    const likeQuery = `%${sanitized}%`;

    const countResult = rawDb
      .query<{ total: number }, [string, string]>(
        `SELECT COUNT(*) as total
         FROM posts
         WHERE status = 'published'
           AND (title LIKE ? OR content LIKE ?)`
      )
      .get(likeQuery, likeQuery);

    const total = countResult?.total || 0;

    const results = rawDb
      .query<
        {
          id: number;
          title: string;
          slug: string;
          excerpt: string | null;
          categoryName: string | null;
          categorySlug: string | null;
          publishedAt: string | null;
          tags: string | null;
        },
        [string, string, number, number]
      >(
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
            WHERE pt.post_id = posts.id) as tags
         FROM posts
         LEFT JOIN categories ON posts.category_id = categories.id
         WHERE posts.status = 'published'
           AND (posts.title LIKE ? OR posts.content LIKE ?)
         ORDER BY posts.published_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(likeQuery, likeQuery, limit, offset);

    const formatted = results.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt || "",
      titleHighlight: row.title,
      categoryName: row.categoryName,
      categorySlug: row.categorySlug,
      publishedAt: row.publishedAt,
      tags: row.tags
        ? row.tags.split(",").map((t) => {
            const [name, slug] = t.split(":");
            return { name, slug };
          })
        : [],
    }));

    return NextResponse.json({
      results: formatted,
      pagination: { page, total, pages: Math.ceil(total / limit) },
    });
  }
}
