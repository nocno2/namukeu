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
    alternates: {
      canonical: `${SITE_URL}/posts/${post.slug}`,
    },
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

export function generateBreadcrumbJsonLd(post: {
  title: string;
  slug: string;
  categoryName?: string | null;
  categorySlug?: string | null;
}) {
  const items = [
    { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
  ];

  if (post.categoryName && post.categorySlug) {
    items.push({
      "@type": "ListItem",
      position: 2,
      name: post.categoryName,
      item: `${SITE_URL}/category/${post.categorySlug}`,
    });
    items.push({
      "@type": "ListItem",
      position: 3,
      name: post.title,
      item: `${SITE_URL}/posts/${post.slug}`,
    });
  } else {
    items.push({
      "@type": "ListItem",
      position: 2,
      name: post.title,
      item: `${SITE_URL}/posts/${post.slug}`,
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

export function generateJsonLd(post: {
  title: string;
  excerpt?: string | null;
  slug: string;
  featuredImage?: string | null;
  publishedAt?: string | null;
  updatedAt: string;
  content?: string | null;
  categoryName?: string | null;
  tags?: string[];
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // FAQ 스키마 추출 (markdown에서 H2 + Q:/A: 패턴 파싱)
  const faqList: { question: string; answer: string }[] = [];
  if (post.content) {
    const lines = post.content.split("\n");
    let currentQuestion = "";
    let currentAnswer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // H2 헤더 감지 (## 로 시작)
      if (line.startsWith("## ")) {
        // 이전 FAQ 저장
        if (currentQuestion && currentAnswer.length > 0) {
          faqList.push({
            question: currentQuestion,
            answer: currentAnswer.join("\n").trim(),
          });
        }
        currentQuestion = line.slice(3).trim();
        currentAnswer = [];
      }
      // Q: 또는 A: 패턴 감지
      else if (line.match(/^[QA]:\s*/i)) {
        if (currentQuestion && line.toLowerCase().startsWith("a:")) {
          currentAnswer.push(line.replace(/^[QA]:\s*/i, "").trim());
        }
      }
      // 답변 텍스트 수집 (들여쓰기된 줄)
      else if (currentQuestion && line && !line.startsWith("#") && currentAnswer.length > 0) {
        currentAnswer.push(line);
      }
    }

    // 마지막 FAQ 저장
    if (currentQuestion && currentAnswer.length > 0) {
      faqList.push({
        question: currentQuestion,
        answer: currentAnswer.join("\n").trim(),
      });
    }
  }

  const baseSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || "",
    url: `${siteUrl}/posts/${post.slug}`,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    ...(post.featuredImage && {
      image: post.featuredImage.startsWith("http") ? post.featuredImage : `${siteUrl}${post.featuredImage}`,
    }),
    author: {
      "@type": "Person",
      name: siteUrl.includes("namukeu") ? "남욱" : "AI Blog",
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: siteUrl.includes("namukeu") ? "namukeu" : "AI Blog",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/og-image.png`,
      },
    },
    // 추가 SEO 필드
    ...(post.categoryName && { articleSection: post.categoryName }),
    ...(post.tags && post.tags.length > 0 && { keywords: post.tags.join(", ") }),
    ...(post.content && { wordCount: post.content.split(/\s+/).filter(Boolean).length }),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${siteUrl}/posts/${post.slug}`,
    },
  };

  // FAQ가 있으면 FAQPage 스키마 추가
  if (faqList.length > 0) {
    return [
      baseSchema,
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqList.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ];
  }

  return baseSchema;
}
