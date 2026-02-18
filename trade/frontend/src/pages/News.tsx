import { useEffect, useState } from 'react';
import { newsApi } from '../api/client';

interface NewsItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  published_at: string;
}

export default function News() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const res = await newsApi.list();
      if (res.data.length > 0) {
        setNews(res.data);
      } else {
        // Fetch from external if no local news
        const fetchRes = await newsApi.fetch();
        setNews(fetchRes.data.news);
      }
    } catch (error) {
      console.error('Failed to fetch news:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (type: 'symbol' | 'query') => {
    setFetching(true);
    try {
      const symbol = type === 'symbol' ? searchSymbol : undefined;
      const query = type === 'query' ? searchQuery : undefined;

      const res = await newsApi.fetch(symbol, query);
      setNews(res.data.news);
    } catch (error) {
      console.error('Failed to fetch news:', error);
    } finally {
      setFetching(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    return date.toLocaleDateString('ko-KR');
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">뉴스</h1>

      {/* Search */}
      <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value)}
              placeholder="종목코드 (e.g., AAPL)"
              className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch('symbol')}
            />
          </div>
          <button
            onClick={() => handleSearch('symbol')}
            disabled={fetching}
            className="px-4 py-2 bg-[--accent] hover:bg-[--accent-hover] rounded-lg transition-colors disabled:opacity-50"
          >
            {fetching ? '...' : '종목 뉴스'}
          </button>
        </div>

        <div className="flex gap-4 mt-3">
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색어 (e.g., 주식 시장)"
              className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch('query')}
            />
          </div>
          <button
            onClick={() => handleSearch('query')}
            disabled={fetching}
            className="px-4 py-2 bg-[--bg-card] hover:bg-[--accent] border border-[--border] rounded-lg transition-colors disabled:opacity-50"
          >
            {fetching ? '...' : '검색'}
          </button>
        </div>
      </div>

      {/* News List */}
      <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
        <h2 className="text-lg font-semibold mb-4">최신 뉴스</h2>

        {loading || fetching ? (
          <div className="text-[--text-secondary]">Loading...</div>
        ) : news.length > 0 ? (
          <div className="space-y-4">
            {news.map((item, idx) => (
              <a
                key={idx}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-[--bg-secondary] rounded-lg hover:bg-[--bg-primary] transition-colors"
              >
                <div className="font-medium line-clamp-2">{item.title}</div>
                {item.summary && (
                  <div className="text-sm text-[--text-secondary] mt-1 line-clamp-2">
                    {item.summary}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-[--text-secondary]">
                  <span>{item.source}</span>
                  <span>•</span>
                  <span>{formatDate(item.published_at)}</span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-[--text-secondary] text-sm py-8 text-center">
            뉴스가 없습니다
          </p>
        )}
      </div>
    </div>
  );
}
