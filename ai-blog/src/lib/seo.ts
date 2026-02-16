import type { Metadata } from "next";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "AI Blog";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export function generatePostMetadata(post: {
  title: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  excerpt?: string | null;
  slug: string;
  featuredImage?: string | null;
  publishedAt?: string | null;
}): Metadata {
  const title = post.metaTitle || post.title;
  const description = post.metaDescription || post.excerpt || "";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `${SITE_URL}/posts/${post.slug}`,
      siteName: SITE_NAME,
      authors: [SITE_NAME],
      ...(post.featuredImage && {
        images: [{ url: post.featuredImage.startsWith("http") ? post.featuredImage : `${SITE_URL}${post.featuredImage}` }],
      }),
      ...(post.publishedAt && {
        publishedTime: post.publishedAt,
      }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(post.featuredImage && {
        images: [post.featuredImage.startsWith("http") ? post.featuredImage : `${SITE_URL}${post.featuredImage}`],
      }),
    },
  };
}

export function generateWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: "AI와 차세대 기술의 인사이트 — 최신 트렌드, 심층 분석, 실용 가이드",
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
    },
  };
}

export function generateJsonLd(post: {
  title: string;
  excerpt?: string | null;
  slug: string;
  featuredImage?: string | null;
  publishedAt?: string | null;
  updatedAt: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || "",
    url: `${SITE_URL}/posts/${post.slug}`,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    ...(post.featuredImage && {
      image: post.featuredImage.startsWith("http") ? post.featuredImage : `${SITE_URL}${post.featuredImage}`,
    }),
    author: {
      "@type": "Person",
      name: SITE_NAME,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
    },
  };
}
