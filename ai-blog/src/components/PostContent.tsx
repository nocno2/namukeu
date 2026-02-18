interface PostContentProps {
  html: string;
  showInArticleAd?: boolean;
}

// 콘텐츠 길이에 비례하여 인아티클 광고를 분산 삽입 (최대 3개)
const MIN_CHARS_BETWEEN_ADS = 1500;
const MIN_CHARS_FOR_AD = 800;
const MAX_IN_ARTICLE_ADS = 3;

export default function PostContent({ html, showInArticleAd = false }: PostContentProps) {
  const adsenseId = process.env.NEXT_PUBLIC_ADSENSE_ID;

  const insertInArticleAds = (content: string): string => {
    if (!showInArticleAd || !adsenseId) return content;

    const textLength = content.replace(/<[^>]*>/g, "").length;
    if (textLength < MIN_CHARS_FOR_AD) return content;

    // 삽입 가능한 위치 (</p>, </h2>, </h3> 태그 뒤) 모두 찾기
    const pattern = /<\/(?:p|h2|h3)>/gi;
    const positions: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      positions.push(m.index + m[0].length);
    }

    if (positions.length === 0) return content;

    // 콘텐츠 길이 기반 광고 수 결정
    const adCount = Math.min(
      MAX_IN_ARTICLE_ADS,
      Math.max(1, Math.floor(textLength / (MIN_CHARS_BETWEEN_ADS + MIN_CHARS_FOR_AD)))
    );

    // 균등 분산 삽입 위치 선택
    const interval = Math.floor(positions.length / (adCount + 1));
    const selectedPositions: number[] = [];
    for (let i = 1; i <= adCount; i++) {
      const idx = Math.min(interval * i, positions.length - 1);
      selectedPositions.push(positions[idx]);
    }

    // 뒤에서부터 삽입 (앞의 인덱스 보존)
    let result = content;
    for (let i = selectedPositions.length - 1; i >= 0; i--) {
      const pos = selectedPositions[i];
      const adCode = `
        <div class="my-8 adsense-in-article">
          <ins class="adsbygoogle"
               style="display:block; text-align:center;"
               data-ad-client="${adsenseId}"
               data-ad-slot="in-article-${i + 1}"
               data-ad-format="auto"
               data-full-width-responsive="true"></ins>
          <script>(adsbygoogle = window.adsbygoogle || []).push({})</script>
        </div>
      `;
      result = result.slice(0, pos) + adCode + result.slice(pos);
    }
    return result;
  };

  const htmlWithAd = insertInArticleAds(html);

  return (
    <div
      className="prose"
      dangerouslySetInnerHTML={{ __html: htmlWithAd }}
    />
  );
}
