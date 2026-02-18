import { useEffect, useState } from 'react';
import { alertsApi, stocksApi } from '../api/client';

interface Alert {
  id: number;
  symbol: string;
  name: string;
  condition: string;
  target_value: number;
  is_triggered: boolean;
  triggered_at: string | null;
  created_at: string;
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Form state
  const [symbol, setSymbol] = useState('');
  const [condition, setCondition] = useState('above');
  const [targetValue, setTargetValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const res = await alertsApi.list();
      setAlerts(res.data);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchStock = async (query: string) => {
    if (query.length < 1) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await stocksApi.search(query);
      setSearchResults(res.data.slice(0, 5));
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol || !targetValue) return;

    setSubmitting(true);
    setMessage('');

    try {
      await alertsApi.create({
        symbol,
        condition,
        target_value: parseFloat(targetValue),
      });

      setMessage('알림이 생성되었습니다');
      setShowForm(false);
      setSymbol('');
      setTargetValue('');
      fetchAlerts();
    } catch (error: any) {
      setMessage(error.response?.data?.detail || '생성 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('이 알림을 삭제하시겠습니까?')) return;
    try {
      await alertsApi.delete(id);
      fetchAlerts();
    } catch (error: any) {
      alert(error.response?.data?.detail || '삭제 실패');
    }
  };

  const conditionLabels: Record<string, string> = {
    above: '이상',
    below: '이하',
    change: '변동률',
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">가격 알림</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-[--accent] hover:bg-[--accent-hover] rounded-lg transition-colors"
        >
          {showForm ? '취소' : '새 알림'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
          <h2 className="text-lg font-semibold mb-4">새 알림 만들기</h2>

          {message && (
            <div className="mb-4 p-3 bg-green-500/20 text-green-400 rounded-lg text-sm">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <label className="block text-sm text-[--text-secondary] mb-1">
                종목
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  searchStock(e.target.value);
                }}
                placeholder="종목코드"
                className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
                required
              />
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[--bg-secondary] border border-[--border] rounded-lg overflow-hidden z-10">
                  {searchResults.map((stock) => (
                    <button
                      key={stock.id}
                      type="button"
                      onClick={() => {
                        setSymbol(stock.symbol);
                        setSearchResults([]);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-[--bg-card] flex justify-between"
                    >
                      <span className="font-medium">{stock.symbol}</span>
                      <span className="text-sm text-[--text-secondary]">
                        {stock.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[--text-secondary] mb-1">
                  조건
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
                >
                  <option value="above">가격이 이상일 때</option>
                  <option value="below">가격이 이하일 때</option>
                  <option value="change">변동률이 초과할 때</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[--text-secondary] mb-1">
                  {condition === 'change' ? '변동률 (%)' : '가격 ($)'}
                </label>
                <input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="0"
                  step={condition === 'change' ? '0.1' : '0.01'}
                  className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-[--accent] hover:bg-[--accent-hover] rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? '생성 중...' : '알림 생성'}
            </button>
          </form>
        </div>
      )}

      {/* Alert List */}
      <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
        <h2 className="text-lg font-semibold mb-4">내 알림</h2>

        {loading ? (
          <div className="text-[--text-secondary]">Loading...</div>
        ) : alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-4 bg-[--bg-secondary] rounded-lg flex justify-between items-center"
              >
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {alert.symbol}
                    {alert.is_triggered && (
                      <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                        발동됨
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-[--text-secondary] mt-1">
                    {alert.name}
                  </div>
                  <div className="text-sm mt-1">
                    {conditionLabels[alert.condition] || alert.condition}:{' '}
                    <span className="font-medium">
                      {alert.condition === 'change'
                        ? `${alert.target_value}%`
                        : `$${alert.target_value}`}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(alert.id)}
                  className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[--text-secondary] text-sm py-8 text-center">
            등록된 알림이 없습니다
          </p>
        )}
      </div>
    </div>
  );
}
