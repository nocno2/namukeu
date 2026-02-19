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
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f6fc]">자동매매 전략</h1>
          <p className="text-sm text-[#8b949e] mt-1">자동매매 전략을 생성하고 관리하세요</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary px-4 py-2"
        >
          {showForm ? '취소' : '새 전략'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-6">
          <h2 className="text-lg font-semibold text-[#f0f6fc] mb-4">새 전략 만들기</h2>

          {message && (
            <div className="mb-4 p-3 bg-[#3fb950]/10 text-[#3fb950] border border-[#3fb950]/20 rounded-lg text-sm">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#8b949e] mb-2">
                  전략명
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="RSI 전략"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-[#8b949e] mb-2">
                  시장
                </label>
                <select
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  className="input-field"
                >
                  <option value="US">미국</option>
                  <option value="KOSPI">한국 (KOSPI)</option>
                  <option value="KOSDAQ">한국 (KOSDAQ)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#8b949e] mb-2">
                전략유형
              </label>
              <select
                value={logicType}
                onChange={(e) => setLogicType(e.target.value)}
                className="input-field"
              >
                <option value="RSI">RSI (Relative Strength Index)</option>
                <option value="MACD">MACD</option>
                <option value="MA">이동평균 (MA)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-[#8b949e] mb-2">
                종목 (쉼표로 구분)
              </label>
              <input
                type="text"
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
                placeholder="AAPL, MSFT, GOOGL"
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-[#8b949e] mb-2">
                설명 (선택)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="이 전략에 대한 설명"
                rows={2}
                className="input-field resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full py-3"
            >
              {submitting ? '생성 중...' : '전략 생성'}
            </button>
          </form>
        </div>
      )}

      {/* Strategy List */}
      <div className="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden">
        <div className="p-5 border-b border-[#30363d]">
          <h2 className="text-lg font-semibold text-[#f0f6fc]">내 전략</h2>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin"></div>
              <div className="text-[#8b949e]">Loading...</div>
            </div>
          </div>
        ) : strategies.length > 0 ? (
          <div className="divide-y divide-[#21262d]">
            {strategies.map((strategy) => (
              <div
                key={strategy.id}
                className="p-5 hover:bg-[#21262d] transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-[#f0f6fc]">{strategy.name}</span>
                      <span
                        className={`badge ${
                          strategy.status === 'ACTIVE'
                            ? 'badge-success'
                            : 'bg-[#6e7681]/20 text-[#6e7681]'
                        }`}
                      >
                        {strategy.status}
                      </span>
                    </div>
                    <div className="text-sm text-[#8b949e] mt-1">
                      {strategy.market} | {strategy.symbols}
                    </div>
                    {strategy.description && (
                      <div className="text-xs text-[#6e7681] mt-2">
                        {strategy.description}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => toggleStatus(strategy)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        strategy.status === 'ACTIVE'
                          ? 'bg-[#d29922]/20 text-[#d29922] hover:bg-[#d29922]/30'
                          : 'bg-[#3fb950]/20 text-[#3fb950] hover:bg-[#3fb950]/30'
                      }`}
                    >
                      {strategy.status === 'ACTIVE' ? '중지' : '시작'}
                    </button>
                    <button
                      onClick={() => handleDelete(strategy.id)}
                      className="px-3 py-1.5 bg-[#f85149]/20 text-[#f85149] rounded-lg text-sm font-medium hover:bg-[#f85149]/30 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">⚡</div>
            <div className="text-[#8b949e]">등록된 전략이 없습니다</div>
            <div className="text-sm text-[#6e7681] mt-1">새 전략을 만들어 자동매매를 시작하세요</div>
          </div>
        )}
      </div>
    </div>
  );
}
