import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', new URLSearchParams({ username, password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  register: (data: { username: string; email: string; password: string }) =>
    api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

// Stocks
export const stocksApi = {
  search: (q: string, market?: string) =>
    api.get('/stocks/search', { params: { q, market } }),
  list: (market?: string) => api.get('/stocks/', { params: { market } }),
  getPrice: (symbol: string) => api.get(`/stocks/${symbol}`),
  getHistory: (symbol: string, period: string = '1y') =>
    api.get(`/stocks/${symbol}/history`, { params: { period } }),
  getPopular: (market: string = 'US', limit: number = 20) =>
    api.get('/stocks/popular/', { params: { market, limit } }),
};

// Trading
export const tradingApi = {
  getPortfolio: () => api.get('/trading/portfolio'),
  createOrder: (data: {
    symbol: string;
    order_type: string;
    side: string;
    quantity: number;
    price?: number;
  }) => api.post('/trading/order', data),
  getOrders: (status?: string) =>
    api.get('/trading/orders', { params: { status } }),
  cancelOrder: (orderId: number) => api.delete(`/trading/order/${orderId}`),
};

// Strategies
export const strategiesApi = {
  list: () => api.get('/strategies/'),
  create: (data: {
    name: string;
    description?: string;
    logic: object;
    market: string;
    symbols: string;
  }) => api.post('/strategies/', data),
  get: (id: number) => api.get(`/strategies/${id}`),
  update: (id: number, data: { status: string }) =>
    api.patch(`/strategies/${id}`, data),
  delete: (id: number) => api.delete(`/strategies/${id}`),
  backtest: (data: {
    strategy_id: number;
    symbol: string;
    start_date: string;
    end_date: string;
    initial_capital: number;
  }) => api.post('/strategies/backtest', data),
};

// News
export const newsApi = {
  list: (symbol?: string) =>
    api.get('/news/', { params: { symbol } }),
  fetch: (symbol?: string, query?: string) =>
    api.get('/news/fetch', { params: { symbol, query } }),
};

// Alerts
export const alertsApi = {
  list: () => api.get('/alerts/'),
  create: (data: {
    symbol: string;
    condition: string;
    target_value: number;
  }) => api.post('/alerts/', data),
  delete: (id: number) => api.delete(`/alerts/${id}`),
  check: () => api.post('/alerts/check'),
};

// Watchlist
export const watchlistApi = {
  list: () => api.get('/watchlist/'),
  create: (data: { name: string; symbols: string }) =>
    api.post('/watchlist/', data),
  delete: (id: number) => api.delete(`/watchlist/${id}`),
};
