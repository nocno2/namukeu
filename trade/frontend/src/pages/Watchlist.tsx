import { useEffect, useState } from 'react';
import { watchlistApi } from '../api/client';

interface WatchlistItem {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  change_pct: number | null;
}

interface WatchlistData {
  id: number;
  name: string;
  items: WatchlistItem[];
}

export default function Watchlist() {
  const [watchlists, setWatchlists] = useState<WatchlistData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [symbols, setSymbols] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchWatchlists();
  }, []);

  const fetchWatchlists = async () => {
    try {
      const res = await watchlistApi.list();
      setWatchlists(res.data);
    } catch (error) {
      console.error('Failed to fetch watchlists:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !symbols) return;

    setSubmitting(true);
    setMessage('');

    try {
      await watchlistApi.create({ name, symbols });
      setMessage('관심종목이 추가되었습니다');
      setShowForm(false);
      setName('');
      setSymbols('');
      fetchWatchlists();
    } catch (error: any) {
      setMessage(error.response?.data?.detail || '추가 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('이 관심종목을 삭제하시겠습니까?')) return;
    try {
      await watchlistApi.delete(id);
      fetchWatchlists();
    } catch (error: any) {
      alert(error.response?.data?.detail || '삭제 실패');
    }
  };

  const formatPrice = (num: number | null) => {
    if (num === null) return '-';
    return num.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">관심종목</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-[--accent] hover:bg-[--accent-hover] rounded-lg transition-colors"
        >
          {showForm ? '취소' : '새 그룹'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
          <h2 className="text-lg font-semibold mb-4">새 관심종목 그룹</h2>

          {message && (
            <div className="mb-4 p-3 bg-green-500/20 text-green-400 rounded-lg text-sm">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-[--text-secondary] mb-1">
                그룹명
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="미국 주식"
                className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-[--text-secondary] mb-1">
                종목을 (쉼표로 구분)
              </label>
              <input
                type="text"
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
                placeholder="AAPL, MSFT, GOOGL, AMZN"
                className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-[--accent] hover:bg-[--accent-hover] rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? '추가 중...' : '그룹 만들기'}
            </button>
          </form>
        </div>
      )}

      {/* Watchlist */}
      {loading ? (
        <div className="text-[--text-secondary]">Loading...</div>
      ) : watchlists.length > 0 ? (
        <div className="space-y-6">
          {watchlists.map((watchlist) => (
            <div
              key={watchlist.id}
              className="p-4 bg-[--bg-card] rounded-xl border border-[--border]"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">{watchlist.name}</h2>
                <button
                  onClick={() => handleDelete(watchlist.id)}
                  className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm"
                >
                  삭제
                </button>
              </div>

              {watchlist.items.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[--text-secondary] border-b border-[--border]">
                        <th className="pb-2">종목</th>
                        <th className="pb-2 text-right">현재가</th>
                        <th className="pb-2 text-right">변동</th>
                        <th className="pb-2 text-right">변동률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {watchlist.items.map((item) => (
                        <tr
                          key={item.symbol}
                          className="border-b border-[--border]/50 hover:bg-[--bg-secondary]"
                        >
                          <td className="py-2">
                            <div className="font-medium">{item.symbol}</div>
                            <div className="text-xs text-[--text-secondary]">
                              {item.name}
                            </div>
                          </td>
                          <td className="py-2 text-right">
                            ${formatPrice(item.price)}
                          </td>
                          <td
                            className={`py-2 text-right ${
                              (item.change || 0) >= 0 ? 'positive' : 'negative'
                            }`}
                          >
                            {item.change !== null
                              ? `${item.change >= 0 ? '+' : ''}${formatPrice(
                                  item.change
                                )}`
                              : '-'}
                          </td>
                          <td
                            className={`py-2 text-right ${
                              (item.change_pct || 0) >= 0
                                ? 'positive'
                                : 'negative'
                            }`}
                          >
                            {item.change_pct !== null
                              ? `${
                                  item.change_pct >= 0 ? '+' : ''
                                }${formatPrice(item.change_pct)}%`
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[--text-secondary] text-sm">
                  종목을 추가해주세요
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 bg-[--bg-card] rounded-xl border border-[--border] text-center">
          <p className="text-[--text-secondary]">
            관심종목 그룹이 없습니다
          </p>
        </div>
      )}
    </div>
  );
}
