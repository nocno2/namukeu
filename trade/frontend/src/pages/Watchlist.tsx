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
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f6fc]">관심종목</h1>
          <p className="text-sm text-[#8b949e] mt-1">관심있는 종목을 추가하여 모니터링하세요</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary px-4 py-2"
        >
          {showForm ? '취소' : '새 그룹'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-6">
          <h2 className="text-lg font-semibold text-[#f0f6fc] mb-4">새 관심종목 그룹</h2>

          {message && (
            <div className="mb-4 p-3 bg-[#3fb950]/10 text-[#3fb950] border border-[#3fb950]/20 rounded-lg text-sm">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-[#8b949e] mb-2">
                그룹명
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="미국 주식"
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-[#8b949e] mb-2">
                종목 (쉼표로 구분)
              </label>
              <input
                type="text"
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
                placeholder="AAPL, MSFT, GOOGL, AMZN"
                className="input-field"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full py-3"
            >
              {submitting ? '추가 중...' : '그룹 만들기'}
            </button>
          </form>
        </div>
      )}

      {/* Watchlist */}
      {loading ? (
        <div className="p-8 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin"></div>
            <div className="text-[#8b949e]">Loading...</div>
          </div>
        </div>
      ) : watchlists.length > 0 ? (
        <div className="space-y-6">
          {watchlists.map((watchlist) => (
            <div
              key={watchlist.id}
              className="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden"
            >
              <div className="p-5 border-b border-[#30363d] flex justify-between items-center">
                <h2 className="text-lg font-semibold text-[#f0f6fc]">{watchlist.name}</h2>
                <button
                  onClick={() => handleDelete(watchlist.id)}
                  className="px-3 py-1.5 bg-[#f85149]/20 text-[#f85149] rounded-lg text-sm font-medium hover:bg-[#f85149]/30 transition-colors"
                >
                  삭제
                </button>
              </div>

              {watchlist.items.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#21262d]">
                        <th className="px-5 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase">종목</th>
                        <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase">현재가</th>
                        <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase">변동</th>
                        <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase">변동률</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#21262d]">
                      {watchlist.items.map((item) => (
                        <tr key={item.symbol} className="table-row">
                          <td className="px-5 py-4">
                            <div className="font-medium text-[#f0f6fc]">{item.symbol}</div>
                            <div className="text-xs text-[#6e7681]">
                              {item.name}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right text-[#f0f6fc]">
                            ${formatPrice(item.price)}
                          </td>
                          <td className={`px-5 py-4 text-right font-medium ${(item.change || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                            {item.change !== null
                              ? `${item.change >= 0 ? '+' : ''}${formatPrice(item.change)}`
                              : '-'}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className={`badge ${(item.change_pct || 0) >= 0 ? 'badge-success' : 'badge-danger'}`}>
                              {item.change_pct !== null
                                ? `${item.change_pct >= 0 ? '+' : ''}${formatPrice(item.change_pct)}%`
                                : '-'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-[#8b949e]">
                  종목을 추가해주세요
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-12 text-center">
          <div className="text-4xl mb-3">★</div>
          <div className="text-[#8b949e]">관심종목 그룹이 없습니다</div>
        </div>
      )}
    </div>
  );
}
