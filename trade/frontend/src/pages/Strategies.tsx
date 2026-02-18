import { useEffect, useState } from 'react';
import { strategiesApi } from '../api/client';

interface Strategy {
  id: number;
  name: string;
  description: string | null;
  logic: object;
  market: string;
  symbols: string;
  status: string;
  last_run_at: string | null;
  created_at: string;
}

export default function Strategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logicType, setLogicType] = useState('RSI');
  const [market, setMarket] = useState('US');
  const [symbols, setSymbols] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchStrategies();
  }, []);

  const fetchStrategies = async () => {
    try {
      const res = await strategiesApi.list();
      setStrategies(res.data);
    } catch (error) {
      console.error('Failed to fetch strategies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const logic: Record<string, object> = {
        RSI: { period: 14, oversold: 30, overbought: 70 },
        MACD: { fast: 12, slow: 26, signal: 9 },
        MA: { period: 20 },
      };

      await strategiesApi.create({
        name,
        description: description || undefined,
        logic: { type: logicType, params: logic[logicType as keyof typeof logic] },
        market,
        symbols,
      });

      setMessage('전략이 생성되었습니다');
      setShowForm(false);
      setName('');
      setDescription('');
      setSymbols('');
      fetchStrategies();
    } catch (error: any) {
      setMessage(error.response?.data?.detail || '생성 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (strategy: Strategy) => {
    const newStatus = strategy.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await strategiesApi.update(strategy.id, { status: newStatus });
      fetchStrategies();
    } catch (error: any) {
      alert(error.response?.data?.detail || '상태 변경 실패');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('이 전략을 삭제하시겠습니까?')) return;
    try {
      await strategiesApi.delete(id);
      fetchStrategies();
    } catch (error: any) {
      alert(error.response?.data?.detail || '삭제 실패');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">자동매매 전략</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-[--accent] hover:bg-[--accent-hover] rounded-lg transition-colors"
        >
          {showForm ? '취소' : '새 전략'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
          <h2 className="text-lg font-semibold mb-4">새 전략 만들기</h2>

          {message && (
            <div className="mb-4 p-3 bg-green-500/20 text-green-400 rounded-lg text-sm">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[--text-secondary] mb-1">
                  전략명
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="RSI 전략"
                  className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-[--text-secondary] mb-1">
                  시장
                </label>
                <select
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
                >
                  <option value="US">미국</option>
                  <option value="KOSPI">한국 (KOSPI)</option>
                  <option value="KOSDAQ">한국 (KOSDAQ)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-[--text-secondary] mb-1">
                전략유형
              </label>
              <select
                value={logicType}
                onChange={(e) => setLogicType(e.target.value)}
                className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
              >
                <option value="RSI">RSI (Relative Strength Index)</option>
                <option value="MACD">MACD</option>
                <option value="MA">이동평균 (MA)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-[--text-secondary] mb-1">
                종목을 (쉼표로 구분)
              </label>
              <input
                type="text"
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
                placeholder="AAPL, MSFT, GOOGL"
                className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-[--text-secondary] mb-1">
                설명 (선택)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="이 전략에 대한 설명"
                rows={2}
                className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-[--accent] hover:bg-[--accent-hover] rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? '생성 중...' : '전략 생성'}
            </button>
          </form>
        </div>
      )}

      {/* Strategy List */}
      <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
        <h2 className="text-lg font-semibold mb-4">내 전략</h2>

        {loading ? (
          <div className="text-[--text-secondary]">Loading...</div>
        ) : strategies.length > 0 ? (
          <div className="space-y-3">
            {strategies.map((strategy) => (
              <div
                key={strategy.id}
                className="p-4 bg-[--bg-secondary] rounded-lg flex justify-between items-center"
              >
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {strategy.name}
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        strategy.status === 'ACTIVE'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {strategy.status}
                    </span>
                  </div>
                  <div className="text-sm text-[--text-secondary] mt-1">
                    {strategy.market} | {strategy.symbols}
                  </div>
                  {strategy.description && (
                    <div className="text-xs text-[--text-secondary] mt-1">
                      {strategy.description}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleStatus(strategy)}
                    className={`px-3 py-1 rounded text-sm ${
                      strategy.status === 'ACTIVE'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-green-500/20 text-green-400'
                    }`}
                  >
                    {strategy.status === 'ACTIVE' ? '중지' : '시작'}
                  </button>
                  <button
                    onClick={() => handleDelete(strategy.id)}
                    className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[--text-secondary] text-sm py-8 text-center">
            등록된 전략이 없습니다
          </p>
        )}
      </div>
    </div>
  );
}
