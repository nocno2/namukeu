interface PostContentProps {
  html: string;
  showInArticleAd?: boolean;
}

export default function PostContent({ html, showInArticleAd = false }: PostContentProps) {
  // 인아티클 광고: 첫 번째 </p> 또는 </h2> 태그 뒤에 광고 삽입
  const insertInArticleAd = (content: string): string => {
    if (!showInArticleAd) return content;

    // 첫 번째 단락 또는 제목 뒤에 광고 삽입
    const match = content.match(/(<\/p>|<\/h2>|<\/h3>)/i);
    if (match && match.index) {
      const insertPos = match.index + match[0].length;
      const adCode = `
        <div class="my-8 adsense-in-article">
          <ins class="adsbygoogle"
               style="display:block; text-align:center;"
               data-ad-client="pub-9370960833787203"
               data-ad-slot="in-article"
               data-ad-format="auto"
               data-full-width-responsive="true"></ins>
          <script>(adsbygoogle = window.adsbygoogle || []).push({})</script>
        </div>
      `;
      return content.slice(0, insertPos) + adCode + content.slice(insertPos);
    }
    return content;
  };

  const htmlWithAd = insertInArticleAd(html);

  return (
    <div
      className="prose"
      dangerouslySetInnerHTML={{ __html: htmlWithAd }}
    />
  );
}
