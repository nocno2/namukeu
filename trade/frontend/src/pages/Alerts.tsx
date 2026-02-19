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
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f6fc]">가격 알림</h1>
          <p className="text-sm text-[#8b949e] mt-1">종목 가격 알림을 설정하세요</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary px-4 py-2"
        >
          {showForm ? '취소' : '새 알림'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-6">
          <h2 className="text-lg font-semibold text-[#f0f6fc] mb-4">새 알림 만들기</h2>

          {message && (
            <div className="mb-4 p-3 bg-[#3fb950]/10 text-[#3fb950] border border-[#3fb950]/20 rounded-lg text-sm">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <label className="block text-sm text-[#8b949e] mb-2">
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
                className="input-field"
                required
              />
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#21262d] border border-[#30363d] rounded-lg overflow-hidden z-10">
                  {searchResults.map((stock) => (
                    <button
                      key={stock.id}
                      type="button"
                      onClick={() => {
                        setSymbol(stock.symbol);
                        setSearchResults([]);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-[#30363d] flex justify-between items-center"
                    >
                      <span className="font-medium text-[#f0f6fc]">{stock.symbol}</span>
                      <span className="text-sm text-[#8b949e]">
                        {stock.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#8b949e] mb-2">
                  조건
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="input-field"
                >
                  <option value="above">가격이 이상일 때</option>
                  <option value="below">가격이 이하일 때</option>
                  <option value="change">변동률이 초과할 때</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#8b949e] mb-2">
                  {condition === 'change' ? '변동률 (%)' : '가격 ($)'}
                </label>
                <input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="0"
                  step={condition === 'change' ? '0.1' : '0.01'}
                  className="input-field"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full py-3"
            >
              {submitting ? '생성 중...' : '알림 생성'}
            </button>
          </form>
        </div>
      )}

      {/* Alert List */}
      <div className="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden">
        <div className="p-5 border-b border-[#30363d]">
          <h2 className="text-lg font-semibold text-[#f0f6fc]">내 알림</h2>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin"></div>
              <div className="text-[#8b949e]">Loading...</div>
            </div>
          </div>
        ) : alerts.length > 0 ? (
          <div className="divide-y divide-[#21262d]">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-5 hover:bg-[#21262d] transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-[#f0f6fc]">{alert.symbol}</span>
                      {alert.is_triggered && (
                        <span className="badge badge-success">발동됨</span>
                      )}
                    </div>
                    <div className="text-sm text-[#8b949e] mt-1">
                      {alert.name}
                    </div>
                    <div className="text-sm mt-2">
                      <span className="text-[#8b949e]">
                        {conditionLabels[alert.condition] || alert.condition}:{' '}
                      </span>
                      <span className="font-medium text-[#f0f6fc]">
                        {alert.condition === 'change'
                          ? `${alert.target_value}%`
                          : `$${alert.target_value}`}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(alert.id)}
                    className="px-3 py-1.5 bg-[#f85149]/20 text-[#f85149] rounded-lg text-sm font-medium hover:bg-[#f85149]/30 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">🔔</div>
            <div className="text-[#8b949e]">등록된 알림이 없습니다</div>
          </div>
        )}
      </div>
    </div>
  );
}
