import { useEffect, useState } from 'react';
import { tradingApi, stocksApi } from '../api/client';

interface Order {
  id: number;
  symbol: string;
  name: string;
  order_type: string;
  side: string;
  quantity: number;
  price: number | null;
  status: string;
  filled_quantity: number;
  filled_price: number | null;
  created_at: string;
}

interface Stock {
  symbol: string;
  name: string;
  price: number | null;
}

export default function Trading() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Order form
  const [symbol, setSymbol] = useState('');
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [orderType, setOrderType] = useState('MARKET');
  const [side, setSide] = useState('BUY');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await tradingApi.getOrders();
      setOrders(res.data);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
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

  const selectStock = (stock: Stock) => {
    setSymbol(stock.symbol);
    setSearchResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol || !quantity) return;

    setSubmitting(true);
    setMessage('');

    try {
      await tradingApi.createOrder({
        symbol,
        order_type: orderType,
        side,
        quantity: parseFloat(quantity),
        price: orderType === 'LIMIT' ? parseFloat(price) : undefined,
      });

      setMessage(`${side} 주문이 제출되었습니다`);
      setQuantity('');
      setPrice('');
      fetchOrders();
    } catch (error: any) {
      setMessage(error.response?.data?.detail || '주문 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (orderId: number) => {
    try {
      await tradingApi.cancelOrder(orderId);
      fetchOrders();
    } catch (error: any) {
      alert(error.response?.data?.detail || '취소 실패');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ko-KR');
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#f0f6fc]">주문하기</h1>
        <p className="text-sm text-[#8b949e] mt-1">주문을 제출하고 포트폴리오를 관리하세요</p>
      </div>

      {/* Order Form */}
      <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-6">
        <h2 className="text-lg font-semibold text-[#f0f6fc] mb-4">새 주문</h2>

        {message && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              message.includes('실패') || message.includes('오류')
                ? 'bg-[#f85149]/10 text-[#f85149] border border-[#f85149]/20'
                : 'bg-[#3fb950]/10 text-[#3fb950] border border-[#3fb950]/20'
            }`}
          >
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Symbol Search */}
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
              onFocus={() => symbol.length > 0 && searchStock(symbol)}
              placeholder="종목코드 검색"
              className="input-field"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#21262d] border border-[#30363d] rounded-lg overflow-hidden z-10">
                {searchResults.map((stock) => (
                  <button
                    key={stock.symbol}
                    type="button"
                    onClick={() => selectStock(stock)}
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

          {/* Order Type & Side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#8b949e] mb-2">
                주문유형
              </label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value)}
                className="input-field"
              >
                <option value="MARKET">시장가</option>
                <option value="LIMIT">지정가</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#8b949e] mb-2">
                매도/매수
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${
                    side === 'BUY'
                      ? 'bg-[#3fb950] text-white'
                      : 'bg-[#21262d] text-[#8b949e] hover:text-[#f0f6fc]'
                  }`}
                >
                  매수
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${
                    side === 'SELL'
                      ? 'bg-[#f85149] text-white'
                      : 'bg-[#21262d] text-[#8b949e] hover:text-[#f0f6fc]'
                  }`}
                >
                  매도
                </button>
              </div>
            </div>
          </div>

          {/* Quantity & Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#8b949e] mb-2">
                수량
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                min="0"
                step="1"
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-[#8b949e] mb-2">
                가격 {orderType === 'MARKET' && '(시장가)'}
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={orderType === 'MARKET' ? '-' : '0'}
                min="0"
                step="0.01"
                disabled={orderType === 'MARKET'}
                className="input-field disabled:opacity-50"
                required={orderType === 'LIMIT'}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !symbol || !quantity}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              side === 'BUY'
                ? 'bg-[#3fb950] hover:bg-[#3fb950]/90'
                : 'bg-[#f85149] hover:bg-[#f85149]/90'
            } disabled:opacity-50`}
          >
            {submitting ? '주문 중...' : `${side === 'BUY' ? '매수' : '매도'} 주문`}
          </button>
        </form>
      </div>

      {/* Order History */}
      <div className="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden">
        <div className="p-5 border-b border-[#30363d]">
          <h2 className="text-lg font-semibold text-[#f0f6fc]">주문내역</h2>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin"></div>
              <div className="text-[#8b949e]">Loading...</div>
            </div>
          </div>
        ) : orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#21262d]">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase">시간</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase">종목</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase">유형</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase">구분</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase">수량</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#8b949e] uppercase">가격</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#8b949e] uppercase">상태</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {orders.map((order) => (
                  <tr key={order.id} className="table-row">
                    <td className="px-5 py-4 text-xs text-[#8b949e]">{formatDate(order.created_at)}</td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-[#f0f6fc]">{order.symbol}</div>
                    </td>
                    <td className="px-5 py-4 text-[#f0f6fc]">{order.order_type}</td>
                    <td className={`px-5 py-4 font-medium ${order.side === 'BUY' ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                      {order.side}
                    </td>
                    <td className="px-5 py-4 text-right text-[#f0f6fc]">{order.quantity}</td>
                    <td className="px-5 py-4 text-right text-[#f0f6fc]">
                      {order.filled_price
                        ? `$${order.filled_price.toLocaleString()}`
                        : '-'}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`badge ${
                          order.status === 'FILLED'
                            ? 'badge-success'
                            : order.status === 'PENDING'
                            ? 'badge-warning'
                            : order.status === 'CANCELLED'
                            ? 'bg-[#6e7681]/20 text-[#6e7681]'
                            : 'badge-danger'
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {order.status === 'PENDING' && (
                        <button
                          onClick={() => handleCancel(order.id)}
                          className="text-xs text-[#f85149] hover:underline"
                        >
                          취소
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-[#8b949e]">
            주문내역이 없습니다
          </div>
        )}
      </div>
    </div>
  );
}
