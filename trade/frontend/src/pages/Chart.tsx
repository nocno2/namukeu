import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, Time, HistogramData, LineData, IPriceLine } from 'lightweight-charts';
import { stocksApi, alertsApi } from '../api/client';

const periods = [
  { label: '1분', value: '1m' },
  { label: '5분', value: '5m' },
  { label: '15분', value: '15m' },
  { label: '30분', value: '30m' },
  { label: '1시간', value: '1h' },
  { label: '4시간', value: '4h' },
  { label: '1일', value: '1d' },
  { label: '1주', value: '1wk' },
  { label: '1개월', value: '1mo' },
];

const chartTypes = [
  { label: '캔들', value: 'candle', icon: '🕯' },
  { label: '라인', value: 'line', icon: '📈' },
  { label: '산형', value: 'area', icon: '⛰' },
];

const indicators = [
  { label: 'MA', value: 'ma', color: '#d29922' },
  { label: 'BB', value: 'bb', color: '#a371f7' },
  { label: '볼륨', value: 'volume', color: '#58a6ff' },
  { label: 'RSI', value: 'rsi', color: '#3fb950' },
  { label: 'MACD', value: 'macd', color: '#f0883e' },
];

const drawingTools = [
  { label: '↔', value: 'trendline', title: ' 트렌드선' },
  { label: '━', value: 'priceLine', title: '가격선' },
  { label: '🔔', value: 'alert', title: '알림' },
  { label: '✕', value: 'clear', title: '초기화' },
];

// Calculate Bollinger Bands
function calculateBollingerBands(data: any[], period = 20, stdDev = 2) {
  const upper: LineData[] = [];
  const middle: LineData[] = [];
  const lower: LineData[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const closes = slice.map(d => d.close);
    const sma = closes.reduce((a, b) => a + b, 0) / period;
    const variance = closes.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
    const std = Math.sqrt(variance);

    middle.push({ time: data[i].date.split('T')[0] as Time, value: sma });
    upper.push({ time: data[i].date.split('T')[0] as Time, value: sma + stdDev * std });
    lower.push({ time: data[i].date.split('T')[0] as Time, value: sma - stdDev * std });
  }

  return { upper, middle, lower };
}

// Calculate MACD
function calculateMACD(data: any[], fast = 12, slow = 26, signal = 9) {
  const ema = (values: number[], period: number) => {
    const k = 2 / (period + 1);
    let emaArray = [values[0]];
    for (let i = 1; i < values.length; i++) {
      emaArray.push(values[i] * k + emaArray[i - 1] * (1 - k));
    }
    return emaArray;
  };

  const closes = data.map(d => d.close);
  const fastEMA = ema(closes, fast);
  const slowEMA = ema(closes, slow);
  const macdLine = fastEMA.map((f, i) => f - slowEMA[i]);
  const signalEMA = ema(macdLine, signal);
  const histogram = macdLine.map((m, i) => m - signalEMA[i]);

  const macd: LineData[] = [];
  const signalLine: LineData[] = [];
  const hist: HistogramData[] = [];

  const startIdx = slow + signal - 2;
  for (let i = startIdx; i < data.length; i++) {
    const time = data[i].date.split('T')[0] as Time;
    macd.push({ time, value: macdLine[i] });
    signalLine.push({ time, value: signalEMA[i] });
    hist.push({
      time,
      value: histogram[i],
      color: histogram[i] >= 0 ? 'rgba(63, 185, 80, 0.7)' : 'rgba(248, 81, 73, 0.7)',
    });
  }

  return { macd, signalLine, histogram: hist };
}

// Calculate RSI
function calculateRSI(data: any[], period = 14) {
  const rsi: LineData[] = [];

  for (let i = period; i < data.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const change = data[j].close - data[j - 1].close;
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsiValue = 100 - (100 / (1 + rs));

    rsi.push({ time: data[i].date.split('T')[0] as Time, value: rsiValue });
  }

  return rsi;
}

// Calculate MA
function calculateMA(data: any[], period: number) {
  const ma: LineData[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b.close, 0);
    ma.push({ time: data[i].date.split('T')[0] as Time, value: sum / period });
  }
  return ma;
}

interface ChartPanelProps {
  symbol: string;
  period: string;
  chartType: string;
  activeIndicators: string[];
  onSymbolChange?: (symbol: string) => void;
}

function ChartPanel({ symbol: initialSymbol, period, chartType, activeIndicators, onSymbolChange }: ChartPanelProps) {
  const [searchParams] = useSearchParams();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const volumeContainerRef = useRef<HTMLDivElement>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null);

  const priceLinesRef = useRef<IPriceLine[]>([]);

  const urlSymbol = searchParams.get('symbol');
  const [symbol, setSymbol] = useState(urlSymbol || initialSymbol || 'AAPL');
  const [searchInput, setSearchInput] = useState(urlSymbol || initialSymbol || 'AAPL');
  const [price, setPrice] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [alertPrice, setAlertPrice] = useState('');
  const [alertCondition, setAlertCondition] = useState('above');
  const [alertMessage, setAlertMessage] = useState('');

  const indicatorCount = activeIndicators.length;

  // Initialize main chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#0d1117' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#58a6ff', width: 1, style: 2, labelBackgroundColor: '#58a6ff' },
        horzLine: { color: '#58a6ff', width: 1, style: 2, labelBackgroundColor: '#58a6ff' },
      },
      rightPriceScale: {
        borderColor: '#30363d',
        scaleMargins: { top: 0.05, bottom: indicatorCount > 0 ? 0.25 : 0.1 },
      },
      timeScale: {
        borderColor: '#30363d',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Click handler for adding price lines
    chart.subscribeClick((param) => {
      if (param.point && param.time) {
        const price = candlestickSeriesRef.current?.coordinateToPrice(param.point.y);
        if (price) {
          addPriceLine(price);
        }
      }
    });

    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const container = chartContainerRef.current;
        chart.applyOptions({
          width: container.clientWidth || 300,
          height: Math.max(container.clientHeight || 200, 200),
        });
      }
    };

    // Initial resize after mount
    setTimeout(handleResize, 100);
    window.addEventListener('resize', handleResize);
    // Also handle orientation change on mobile
    window.addEventListener('orientationchange', () => setTimeout(handleResize, 200));

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [indicatorCount]);

  const addPriceLine = (priceValue: number) => {
    if (!chartRef.current || !candlestickSeriesRef.current) return;

    const priceLine = candlestickSeriesRef.current.createPriceLine({
      price: priceValue,
      color: '#58a6ff',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: `$${priceValue.toFixed(2)}`,
    });

    priceLinesRef.current.push(priceLine);
  };

  const clearPriceLines = () => {
    priceLinesRef.current.forEach((pl) => {
      candlestickSeriesRef.current?.removePriceLine(pl);
    });
    priceLinesRef.current = [];
  };

  // Create series based on chart type
  useEffect(() => {
    if (!chartRef.current) return;

    if (candlestickSeriesRef.current) {
      chartRef.current.removeSeries(candlestickSeriesRef.current);
      candlestickSeriesRef.current = null;
    }

    switch (chartType) {
      case 'candle':
        const candleSeries = chartRef.current.addSeries(CandlestickSeries, {
          upColor: '#3fb950', downColor: '#f85149',
          borderUpColor: '#3fb950', borderDownColor: '#f85149',
          wickUpColor: '#3fb950', wickDownColor: '#f85149',
        });
        candlestickSeriesRef.current = candleSeries as any;
        break;
      case 'line':
        const lineSeries = chartRef.current.addSeries(LineSeries, {
          color: '#58a6ff', lineWidth: 2, priceLineVisible: false,
        });
        candlestickSeriesRef.current = lineSeries as any;
        break;
      case 'area':
        const areaSeries = chartRef.current.addSeries(AreaSeries, {
          lineColor: '#58a6ff', topColor: 'rgba(88, 166, 255, 0.4)',
          bottomColor: 'rgba(88, 166, 255, 0.0)', lineWidth: 2, priceLineVisible: false,
        });
        candlestickSeriesRef.current = areaSeries as any;
        break;
    }

    if (activeIndicators.includes('ma')) {
      const maSeries = chartRef.current.addSeries(LineSeries, {
        color: '#d29922', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
      });
      maSeriesRef.current = maSeries;
    }

    if (activeIndicators.includes('bb')) {
      const upper = chartRef.current.addSeries(LineSeries, { color: 'rgba(163, 113, 247, 0.5)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
      const middle = chartRef.current.addSeries(LineSeries, { color: '#a371f7', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      const lower = chartRef.current.addSeries(LineSeries, { color: 'rgba(163, 113, 247, 0.5)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
      bbUpperRef.current = upper;
      bbMiddleRef.current = middle;
      bbLowerRef.current = lower;
    }

  }, [chartType, activeIndicators]);

  // Volume sub-chart
  useEffect(() => {
    if (!activeIndicators.includes('volume')) return;
    if (!volumeContainerRef.current) return;

    const chart = createChart(volumeContainerRef.current, {
      layout: { background: { color: '#0d1117' }, textColor: '#8b949e' },
      grid: { vertLines: { color: '#21262d' }, horzLines: { color: '#21262d' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#30363d', scaleMargins: { top: 0.1, bottom: 0 } },
      timeScale: { visible: false, borderColor: '#30363d' },
      height: 80,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#58a6ff', priceFormat: { type: 'volume' }, priceLineVisible: false,
    });

    volumeSeriesRef.current = volumeSeries;
    chartRef.current?.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) chart.timeScale().setVisibleLogicalRange(range);
    });

    return () => { chart.remove(); };
  }, [activeIndicators]);

  // Fetch data
  const fetchData = useCallback(async (sym: string, periodValue: string) => {
    setLoading(true);
    setError('');

    try {
      const [priceRes, historyRes] = await Promise.all([
        stocksApi.getPrice(sym),
        stocksApi.getHistory(sym, periodValue),
      ]);

      setPrice(priceRes.data);
      onSymbolChange?.(sym);

      const history = historyRes.data;
      if (!history || history.length === 0) {
        setError('데이터가 없습니다');
        setLoading(false);
        return;
      }

      const candleData: CandlestickData[] = history.map((item: any) => ({
        time: item.date.split('T')[0] as Time,
        open: item.open, high: item.high, low: item.low, close: item.close,
      }));

      const lineData: LineData[] = history.map((item: any) => ({
        time: item.date.split('T')[0] as Time, value: item.close,
      }));

      const volumeData: HistogramData[] = history.map((item: any) => ({
        time: item.date.split('T')[0] as Time,
        value: item.volume,
        color: item.close >= item.open ? 'rgba(63, 185, 80, 0.5)' : 'rgba(248, 81, 73, 0.5)',
      }));

      if (candlestickSeriesRef.current) {
        candlestickSeriesRef.current.setData(chartType === 'candle' ? candleData : lineData);
      }

      if (maSeriesRef.current) {
        maSeriesRef.current.setData(calculateMA(history, 20));
      }

      if (bbUpperRef.current && bbMiddleRef.current && bbLowerRef.current) {
        const bb = calculateBollingerBands(history);
        bbUpperRef.current.setData(bb.upper);
        bbMiddleRef.current.setData(bb.middle);
        bbLowerRef.current.setData(bb.lower);
      }

      chartRef.current?.timeScale().fitContent();

      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(volumeData);
      }

    } catch (err: any) {
      console.error('Chart error:', err);
      setError(err.response?.data?.detail || '차트 데이터를 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [chartType, onSymbolChange]);

  useEffect(() => {
    fetchData(symbol, period);
  }, [symbol, period]);

  // Real-time price update
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await stocksApi.getPrice(symbol);
        setPrice(res.data);
      } catch (e) {}
    }, 10000);
    return () => clearInterval(interval);
  }, [symbol]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSymbol(searchInput.toUpperCase().trim());
      fetchData(searchInput.toUpperCase().trim(), period);
      setShowSearch(false);
    }
  };

  const handleCreateAlert = async () => {
    if (!alertPrice || !symbol) return;

    try {
      await alertsApi.create({
        symbol,
        condition: alertCondition,
        target_value: parseFloat(alertPrice),
      });
      setAlertMessage('알림이 등록되었습니다!');
      setAlertPrice('');
      setShowAlertForm(false);
      setTimeout(() => setAlertMessage(''), 3000);
    } catch (err: any) {
      setAlertMessage(err.response?.data?.detail || '알림 등록 실패');
    }
  };

  const formatPrice = (num: number | undefined) => {
    if (num === undefined || num === null) return '-';
    return num.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Symbol & Price Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowSearch(!showSearch)} className="text-lg font-bold text-[#f0f6fc] hover:text-[#58a6ff]">
            {symbol}
          </button>
          {showSearch && (
            <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(e as any)} placeholder="종목코드"
              className="w-24 px-2 py-1 bg-[#21262d] border border-[#30363d] rounded text-sm text-[#f0f6fc] focus:outline-none focus:border-[#58a6ff]" autoFocus />
          )}
          <div className="flex flex-col">
            <span className="text-lg font-bold text-[#f0f6fc]">${formatPrice(price?.price)}</span>
            <span className={`text-xs ${(price?.change_pct || 0) >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
              {(price?.change_pct || 0) >= 0 ? '+' : ''}{formatPrice(price?.change_pct)}%
            </span>
          </div>
        </div>

        {/* Alert Button */}
        <div className="relative">
          <button
            onClick={() => setShowAlertForm(!showAlertForm)}
            className="px-3 py-1 bg-[#f0883e]/20 text-[#f0883e] rounded-lg text-sm hover:bg-[#f0883e]/30"
          >
            🔔 알림
          </button>

          {showAlertForm && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-[#161b22] border border-[#30363d] rounded-lg p-4 z-50 shadow-xl">
              <div className="text-sm font-medium text-[#f0f6fc] mb-3">가격 알림 설정</div>
              {alertMessage && (
                <div className="mb-2 p-2 text-xs bg-[#3fb950]/20 text-[#3fb950] rounded">{alertMessage}</div>
              )}
              <div className="space-y-2">
                <input
                  type="number"
                  value={alertPrice}
                  onChange={(e) => setAlertPrice(e.target.value)}
                  placeholder="가격 입력"
                  className="w-full px-3 py-2 bg-[#21262d] border border-[#30363d] rounded text-sm text-[#f0f6fc]"
                />
                <select
                  value={alertCondition}
                  onChange={(e) => setAlertCondition(e.target.value)}
                  className="w-full px-3 py-2 bg-[#21262d] border border-[#30363d] rounded text-sm text-[#f0f6fc]"
                >
                  <option value="above">이상</option>
                  <option value="below">이하</option>
                </select>
                <button
                  onClick={handleCreateAlert}
                  className="w-full py-2 bg-[#58a6ff] text-white rounded text-sm font-medium hover:bg-[#58a6ff]/90"
                >
                  알림 등록
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-[#f85149]">{error}</div>
        ) : (
          <>
            <div ref={chartContainerRef} className="flex-1" />
            {activeIndicators.includes('volume') && (
              <div ref={volumeContainerRef} className="h-20 border-t border-[#21262d]" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ChartMulti() {
  const [searchParams] = useSearchParams();
  const [symbol, setSymbol] = useState(searchParams.get('symbol') || 'AAPL');
  const [period, setPeriod] = useState('1y');
  const [chartType, setChartType] = useState('candle');
  const [activeIndicators, setActiveIndicators] = useState<string[]>(['volume']);
  const [viewMode, setViewMode] = useState<'single' | 'quad'>('single');
  const [showToolbar, setShowToolbar] = useState(true);

  const toggleIndicator = (ind: string) => {
    setActiveIndicators(prev =>
      prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]
    );
  };

  return (
    <div className="flex flex-col bg-[#0d1117]" style={{ height: '100dvh' }}>
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
        {/* Left: Symbol */}
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-[#f0f6fc]">{symbol}</span>
        </div>

        {/* Center: Chart Type */}
        <div className="flex items-center gap-1 bg-[#21262d] rounded-lg p-1">
          {chartTypes.map((type) => (
            <button key={type.value} onClick={() => setChartType(type.value)}
              className={`px-3 py-1 rounded text-sm ${chartType === type.value ? 'bg-[#58a6ff] text-white' : 'text-[#8b949e] hover:text-[#f0f6fc]'}`}>
              {type.icon} {type.label}
            </button>
          ))}
        </div>

        {/* Period */}
        <div className="flex items-center gap-1 bg-[#21262d] rounded-lg p-1">
          {periods.map((p) => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`px-2 py-1 rounded text-xs ${period === p.value ? 'bg-[#58a6ff] text-white' : 'text-[#8b949e] hover:text-[#f0f6fc]'}`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Indicators */}
        <div className="flex items-center gap-1">
          {indicators.map((ind) => (
            <button key={ind.value} onClick={() => toggleIndicator(ind.value)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                activeIndicators.includes(ind.value)
                  ? 'text-white' : 'bg-[#21262d] text-[#8b949e] hover:text-[#f0f6fc]'
              }`}
              style={activeIndicators.includes(ind.value) ? { backgroundColor: ind.color } : {}}
            >
              {ind.label}
            </button>
          ))}
        </div>

        {/* View Mode */}
        <div className="flex items-center gap-1">
          <button onClick={() => setViewMode('single')} className={`px-3 py-1 rounded text-sm ${viewMode === 'single' ? 'bg-[#58a6ff] text-white' : 'bg-[#21262d] text-[#8b949e]'}`}>
            1분할
          </button>
          <button onClick={() => setViewMode('quad')} className={`px-3 py-1 rounded text-sm ${viewMode === 'quad' ? 'bg-[#58a6ff] text-white' : 'bg-[#21262d] text-[#8b949e]'}`}>
            4분할
          </button>
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'single' ? (
          <ChartPanel symbol={symbol} period={period} chartType={chartType} activeIndicators={activeIndicators} onSymbolChange={setSymbol} />
        ) : (
          <div className="grid grid-cols-2 grid-rows-2 h-full gap-0.5 bg-[#30363d]">
            <div className="bg-[#0d1117]"><ChartPanel symbol={symbol} period={period} chartType={chartType} activeIndicators={activeIndicators} /></div>
            <div className="bg-[#0d1117]"><ChartPanel symbol="MSFT" period={period} chartType={chartType} activeIndicators={activeIndicators} /></div>
            <div className="bg-[#0d1117]"><ChartPanel symbol="GOOGL" period={period} chartType={chartType} activeIndicators={activeIndicators} /></div>
            <div className="bg-[#0d1117]"><ChartPanel symbol="NVDA" period={period} chartType={chartType} activeIndicators={activeIndicators} /></div>
          </div>
        )}
      </div>
    </div>
  );
}
