import Link from "next/link";

interface PostCardProps {
  title: string;
  slug: string;
  excerpt?: string | null;
  categoryName?: string;
  categorySlug?: string;
  publishedAt?: string | null;
  featuredImage?: string | null;
  tags?: { name: string; slug: string }[];
}

const GRADIENTS = [
  "from-blue-500/20 to-purple-500/20",
  "from-emerald-500/20 to-teal-500/20",
  "from-orange-500/20 to-rose-500/20",
  "from-violet-500/20 to-indigo-500/20",
  "from-cyan-500/20 to-blue-500/20",
  "from-pink-500/20 to-red-500/20",
];

function getGradient(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export default function PostCard({
  title,
  slug,
  excerpt,
  categoryName,
  categorySlug,
  publishedAt,
  featuredImage,
  tags,
}: PostCardProps) {
  return (
    <article className="card-hover bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]/50">
      <Link href={`/posts/${slug}`} className="block overflow-hidden">
        {featuredImage ? (
          <img
            src={featuredImage}
            alt={title}
            className="w-full h-44 object-cover hover:scale-105 transition duration-500"
          />
        ) : (
          <div className={`w-full h-44 bg-gradient-to-br ${getGradient(slug)} flex items-end p-5`}>
            <span className="text-sm font-medium text-[var(--text-tertiary)] line-clamp-2 leading-relaxed">
              {categoryName || "Blog"}
            </span>
          </div>
        )}
      </Link>
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          {categoryName && categorySlug && (
            <Link
              href={`/category/${categorySlug}`}
              className="tag-chip bg-[var(--bg-subtle)] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
            >
              {categoryName}
            </Link>
          )}
          {publishedAt && (
            <time dateTime={publishedAt} className="text-xs text-[var(--text-muted)]">
              {new Date(publishedAt).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </time>
          )}
        </div>
        <h2 className="text-[15px] font-semibold text-[var(--text-secondary)] mb-2 leading-snug">
          <Link href={`/posts/${slug}`} className="hover:text-[var(--accent)] transition">
            {title}
          </Link>
        </h2>
        {excerpt && (
          <p className="text-[var(--text-tertiary)] text-sm line-clamp-2 leading-relaxed mb-3">{excerpt}</p>
        )}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
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
      </div>
    </article>
  );
}
