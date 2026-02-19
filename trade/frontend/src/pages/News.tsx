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
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#f0f6fc]">뉴스</h1>
        <p className="text-sm text-[#8b949e] mt-1">최신 금융 뉴스를 확인하세요</p>
      </div>

      {/* Search */}
      <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-5">
        <div className="flex gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value)}
              placeholder="종목코드 (e.g., AAPL)"
              className="input-field"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch('symbol')}
            />
          </div>
          <button
            onClick={() => handleSearch('symbol')}
            disabled={fetching}
            className="btn-primary px-5"
          >
            {fetching ? '...' : '종목 뉴스'}
          </button>
        </div>

        <div className="flex gap-3 mt-3">
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색어 (e.g., 주식 시장)"
              className="input-field"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch('query')}
            />
          </div>
          <button
            onClick={() => handleSearch('query')}
            disabled={fetching}
            className="btn-secondary px-5"
          >
            {fetching ? '...' : '검색'}
          </button>
        </div>
      </div>

      {/* News List */}
      <div className="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden">
        <div className="p-5 border-b border-[#30363d]">
          <h2 className="text-lg font-semibold text-[#f0f6fc]">최신 뉴스</h2>
        </div>

        {loading || fetching ? (
          <div className="p-8 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin"></div>
              <div className="text-[#8b949e]">Loading...</div>
            </div>
          </div>
        ) : news.length > 0 ? (
          <div className="divide-y divide-[#21262d]">
            {news.map((item, idx) => (
              <a
                key={idx}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-5 hover:bg-[#21262d] transition-colors"
              >
                <div className="font-medium text-[#f0f6fc] line-clamp-2">{item.title}</div>
                {item.summary && (
                  <div className="text-sm text-[#8b949e] line-clamp-2">
                    {item.summary}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-3 text-xs text-[#6e7681]">
                  <span className="text-[#58a6ff]">{item.source}</span>
                  <span>•</span>
                  <span>{formatDate(item.published_at)}</span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📰</div>
            <div className="text-[#8b949e]">뉴스가 없습니다</div>
          </div>
        )}
      </div>
    </div>
  );
}
