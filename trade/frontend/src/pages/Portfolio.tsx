import { useEffect, useState } from 'react';
import { tradingApi } from '../api/client';

interface PortfolioItem {
  symbol: string;
  name: string;
  quantity: number;
  avg_price: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
}

export default function Portfolio() {
  const [portfolio, setPortfolio] = useState<{
    total_value: number;
    total_cost: number;
    total_pnl: number;
    total_pnl_pct: number;
    items: PortfolioItem[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const fetchPortfolio = async () => {
    try {
      const res = await tradingApi.getPortfolio();
      setPortfolio(res.data);
    } catch (error) {
      console.error('Failed to fetch portfolio:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (num: number) => {
    return num.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  };

  const formatMoney = (num: number) => {
    return num.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin"></div>
          <div className="text-[#8b949e]">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f6fc]">포트폴리오</h1>
          <p className="text-sm text-[#8b949e] mt-1">보유 종목을 확인하세요</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-5 card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#8b949e]">총 자산</span>
            <div className="w-8 h-8 rounded-lg bg-[#21262d] flex items-center justify-center text-[#58a6ff]">💰</div>
          </div>
          <div className="text-2xl font-bold text-[#f0f6fc]">
            ${formatMoney(portfolio?.total_value || 0)}
          </div>
          <div className="text-xs text-[#6e7681] mt-1">평가금액</div>
        </div>

        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-5 card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#8b949e]">총 투자금</span>
            <div className="w-8 h-8 rounded-lg bg-[#21262d] flex items-center justify-center text-[#a371f7]">📊</div>
          </div>
          <div className="text-2xl font-bold text-[#f0f6fc]">
            ${formatMoney(portfolio?.total_cost || 0)}
          </div>
          <div className="text-xs text-[#6e7681] mt-1">투자원금</div>
        </div>

        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-5 card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#8b949e]">총 손익</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${(portfolio?.total_pnl || 0) >= 0 ? 'bg-[#3fb950]/10 text-[#3fb950]' : 'bg-[#f85149]/10 text-[#f85149]'}`}>
              {(portfolio?.total_pnl || 0) >= 0 ? '↑' : '↓'}
            </div>
          </div>
          <div className={`text-2xl font-bold ${(portfolio?.total_pnl || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
            {(portfolio?.total_pnl || 0) >= 0 ? '+' : ''}${formatMoney(portfolio?.total_pnl || 0)}
          </div>
          <div className={`text-xs ${(portfolio?.total_pnl || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
            {(portfolio?.total_pnl || 0) >= 0 ? '+' : ''}${formatMoney(portfolio?.total_pnl || 0)} KRW
          </div>
        </div>

        <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-5 card-hover">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#8b949e]">수익률</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${(portfolio?.total_pnl_pct || 0) >= 0 ? 'bg-[#3fb950]/10 text-[#3fb950]' : 'bg-[#f85149]/10 text-[#f85149]'}`}>
              %
            </div>
          </div>
          <div className={`text-2xl font-bold ${(portfolio?.total_pnl_pct || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
            {(portfolio?.total_pnl_pct || 0) >= 0 ? '+' : ''}{formatPrice(portfolio?.total_pnl_pct || 0)}%
          </div>
          <div className="text-xs text-[#6e7681] mt-1">전체 수익률</div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden">
        <div className="p-5 border-b border-[#30363d]">
          <h2 className="text-lg font-semibold text-[#f0f6fc]">보유종목</h2>
        </div>

        {portfolio?.items && portfolio.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#21262d]">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider">종목</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">수량</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">평균가</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">현재가</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">평가금액</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">손익</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">수익률</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase tracking-wider">비중</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {portfolio.items.map((item) => {
                  const weight = portfolio.total_value > 0
                    ? (item.market_value / portfolio.total_value) * 100
                    : 0;

                  return (
                    <tr key={item.symbol} className="table-row">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-[#f0f6fc]">{item.symbol}</div>
                        <div className="text-xs text-[#6e7681]">{item.name}</div>
                      </td>
                      <td className="px-5 py-4 text-right text-[#f0f6fc]">{item.quantity}</td>
                      <td className="px-5 py-4 text-right text-[#f0f6fc]">${formatPrice(item.avg_price)}</td>
                      <td className="px-5 py-4 text-right text-[#f0f6fc]">${formatPrice(item.current_price)}</td>
                      <td className="px-5 py-4 text-right text-[#f0f6fc]">${formatMoney(item.market_value)}</td>
                      <td className={`px-5 py-4 text-right font-medium ${item.unrealized_pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                        {item.unrealized_pnl >= 0 ? '+' : ''}${formatMoney(item.unrealized_pnl)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className={`badge ${item.unrealized_pnl_pct >= 0 ? 'badge-success' : 'badge-danger'}`}>
                          {item.unrealized_pnl_pct >= 0 ? '+' : ''}{formatPrice(item.unrealized_pnl_pct)}%
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right text-[#f0f6fc]">{formatPrice(weight)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📈</div>
            <div className="text-[#8b949e]">보유종목이 없습니다</div>
            <div className="text-sm text-[#6e7681] mt-1">주문을 통해 종목을 구매하세요</div>
          </div>
        )}
      </div>
    </div>
  );
}
