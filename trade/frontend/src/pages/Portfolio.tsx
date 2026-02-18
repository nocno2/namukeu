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
      <div className="p-6 flex items-center justify-center">
        <div className="text-[--text-secondary]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">포트폴리오</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
          <div className="text-sm text-[--text-secondary]">총 자산</div>
          <div className="text-2xl font-bold mt-1">
            ${formatMoney(portfolio?.total_value || 0)}
          </div>
        </div>
        <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
          <div className="text-sm text-[--text-secondary]">총 비용</div>
          <div className="text-2xl font-bold mt-1">
            ${formatMoney(portfolio?.total_cost || 0)}
          </div>
        </div>
        <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
          <div className="text-sm text-[--text-secondary]">총 손익</div>
          <div
            className={`text-2xl font-bold mt-1 ${
              (portfolio?.total_pnl || 0) >= 0 ? 'positive' : 'negative'
            }`}
          >
            {portfolio?.total_pnl && portfolio.total_pnl >= 0 ? '+' : ''}$
            {formatMoney(portfolio?.total_pnl || 0)}
          </div>
        </div>
        <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
          <div className="text-sm text-[--text-secondary]">총 수익률</div>
          <div
            className={`text-2xl font-bold mt-1 ${
              (portfolio?.total_pnl_pct || 0) >= 0 ? 'positive' : 'negative'
            }`}
          >
            {portfolio?.total_pnl_pct && portfolio.total_pnl_pct >= 0 ? '+' : ''}
            {formatPrice(portfolio?.total_pnl_pct || 0)}%
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
        <h2 className="text-lg font-semibold mb-4">보유종목</h2>

        {portfolio?.items && portfolio.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[--text-secondary] border-b border-[--border]">
                  <th className="pb-2">종목</th>
                  <th className="pb-2 text-right">수량</th>
                  <th className="pb-2 text-right">평균가</th>
                  <th className="pb-2 text-right">현재가</th>
                  <th className="pb-2 text-right">평가금액</th>
                  <th className="pb-2 text-right">손익</th>
                  <th className="pb-2 text-right">수익률</th>
                  <th className="pb-2 text-right">비중</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.items.map((item) => {
                  const weight = portfolio.total_value > 0
                    ? (item.market_value / portfolio.total_value) * 100
                    : 0;

                  return (
                    <tr
                      key={item.symbol}
                      className="border-b border-[--border]/50 hover:bg-[--bg-secondary]"
                    >
                      <td className="py-3">
                        <div className="font-medium">{item.symbol}</div>
                        <div className="text-xs text-[--text-secondary]">
                          {item.name}
                        </div>
                      </td>
                      <td className="py-3 text-right">{item.quantity}</td>
                      <td className="py-3 text-right">
                        ${formatPrice(item.avg_price)}
                      </td>
                      <td className="py-3 text-right">
                        ${formatPrice(item.current_price)}
                      </td>
                      <td className="py-3 text-right">
                        ${formatMoney(item.market_value)}
                      </td>
                      <td
                        className={`py-3 text-right ${
                          item.unrealized_pnl >= 0 ? 'positive' : 'negative'
                        }`}
                      >
                        {item.unrealized_pnl >= 0 ? '+' : ''}$
                        {formatMoney(item.unrealized_pnl)}
                      </td>
                      <td
                        className={`py-3 text-right ${
                          item.unrealized_pnl_pct >= 0 ? 'positive' : 'negative'
                        }`}
                      >
                        {item.unrealized_pnl_pct >= 0 ? '+' : ''}
                        {formatPrice(item.unrealized_pnl_pct)}%
                      </td>
                      <td className="py-3 text-right">
                        {formatPrice(weight)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[--text-secondary] text-sm py-8 text-center">
            보유종목이 없습니다. 주문을 통해 종목을 구매하세요.
          </p>
        )}
      </div>
    </div>
  );
}
