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
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">주문하기</h1>

      {/* Order Form */}
      <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
        <h2 className="text-lg font-semibold mb-4">새 주문</h2>

        {message && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              message.includes('실패') || message.includes('오류')
                ? 'bg-red-500/20 text-red-400'
                : 'bg-green-500/20 text-green-400'
            }`}
          >
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Symbol Search */}
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
              onFocus={() => symbol.length > 0 && searchStock(symbol)}
              placeholder="종목코드 검색"
              className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[--bg-secondary] border border-[--border] rounded-lg overflow-hidden z-10">
                {searchResults.map((stock) => (
                  <button
                    key={stock.symbol}
                    type="button"
                    onClick={() => selectStock(stock)}
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

          {/* Order Type & Side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[--text-secondary] mb-1">
                주문유형
              </label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value)}
                className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
              >
                <option value="MARKET">시장가</option>
                <option value="LIMIT">지정가</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-[--text-secondary] mb-1">
                매도/매수
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                    side === 'BUY'
                      ? 'bg-[--positive] text-white'
                      : 'bg-[--bg-secondary] text-[--text-secondary] hover:text-white'
                  }`}
                >
                  매수
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                    side === 'SELL'
                      ? 'bg-[--negative] text-white'
                      : 'bg-[--bg-secondary] text-[--text-secondary] hover:text-white'
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
              <label className="block text-sm text-[--text-secondary] mb-1">
                수량
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                min="0"
                step="1"
                className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-[--text-secondary] mb-1">
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
                className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent] disabled:opacity-50"
                required={orderType === 'LIMIT'}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !symbol || !quantity}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              side === 'BUY'
                ? 'bg-[--positive] hover:bg-[--positive]/80'
                : 'bg-[--negative] hover:bg-[--negative]/80'
            } disabled:opacity-50`}
          >
            {submitting ? '주문 중...' : `${side === 'BUY' ? '매수' : '매도'} 주문`}
          </button>
        </form>
      </div>

      {/* Order History */}
      <div className="p-4 bg-[--bg-card] rounded-xl border border-[--border]">
        <h2 className="text-lg font-semibold mb-4">주문내역</h2>

        {loading ? (
          <div className="text-[--text-secondary]">Loading...</div>
        ) : orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[--text-secondary] border-b border-[--border]">
                  <th className="pb-2">시간</th>
                  <th className="pb-2">종목</th>
                  <th className="pb-2">유형</th>
                  <th className="pb-2">구분</th>
                  <th className="pb-2 text-right">수량</th>
                  <th className="pb-2 text-right">가격</th>
                  <th className="pb-2">상태</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-[--border]/50 hover:bg-[--bg-secondary]"
                  >
                    <td className="py-2 text-xs">{formatDate(order.created_at)}</td>
                    <td className="py-2">
                      <div className="font-medium">{order.symbol}</div>
                    </td>
                    <td className="py-2">{order.order_type}</td>
                    <td className={`py-2 ${order.side === 'BUY' ? 'positive' : 'negative'}`}>
                      {order.side}
                    </td>
                    <td className="py-2 text-right">{order.quantity}</td>
                    <td className="py-2 text-right">
                      {order.filled_price
                        ? `$${order.filled_price.toLocaleString()}`
                        : '-'}
                    </td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          order.status === 'FILLED'
                            ? 'bg-green-500/20 text-green-400'
                            : order.status === 'PENDING'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : order.status === 'CANCELLED'
                            ? 'bg-gray-500/20 text-gray-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="py-2">
                      {order.status === 'PENDING' && (
                        <button
                          onClick={() => handleCancel(order.id)}
                          className="text-xs text-red-400 hover:underline"
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
          <p className="text-[--text-secondary] text-sm">주문내역이 없습니다</p>
        )}
      </div>
    </div>
  );
}
