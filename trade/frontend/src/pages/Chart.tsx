import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { stocksApi } from '../api/client';

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface MAData {
  ma20: number[];
  ma50: number[];
  ma100: number[];
}

const TIMEFRAMES = [
  { label: '1분', value: '1m' },
  { label: '5분', value: '5m' },
  { label: '15분', value: '15m' },
  { label: '30분', value: '30m' },
  { label: '1시간', value: '1h' },
  { label: '4시간', value: '4h' },
  { label: '1일', value: '1d' },
  { label: '1주', value: '1wk' },
  { label: '1개월', value: '1mo' },
  { label: '3개월', value: '3mo' },
  { label: '6개월', value: '6mo' },
  { label: '1년', value: '1y' },
  { label: '2년', value: '2y' },
];

export default function ChartPage() {
  const [searchParams] = useSearchParams();
  const symbol = searchParams.get('symbol') || 'AAPL';

  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeframe, setTimeframe] = useState('3mo');
  const [showMA, setShowMA] = useState(true);
  const [showVolume, setShowVolume] = useState(true);

  // 디바이스 감지
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 선택된 캔들
  const [selectedCandle, setSelectedCandle] = useState<Candle | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);

  // 스케일/줌
  const [chartScale, setChartScale] = useState(1);
  const [volumeHeight, setVolumeHeight] = useState(80);
  const [candlesOnScreen, setCandlesOnScreen] = useState(60);

  // 스크롤
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);

  // 모바일 터치
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchStartOffset, setTouchStartOffset] = useState(0);
  const [touchStartDist, setTouchStartDist] = useState(0);
  const [touchStartCandles, setTouchStartCandles] = useState(60);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | undefined>(undefined);

  // MA 계산
  const calculateMA = useCallback((data: Candle[]): MAData => {
    const ma20: number[] = [], ma50: number[] = [], ma100: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i >= 19) ma20.push(data.slice(i - 19, i + 1).reduce((a, b) => a + b.close, 0) / 20);
      else ma20.push(NaN);
      if (i >= 49) ma50.push(data.slice(i - 49, i + 1).reduce((a, b) => a + b.close, 0) / 50);
      else ma50.push(NaN);
      if (i >= 99) ma100.push(data.slice(i - 99, i + 1).reduce((a, b) => a + b.close, 0) / 100);
      else ma100.push(NaN);
    }
    return { ma20, ma50, ma100 };
  }, []);

  // 데이터 로드
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setSelectedCandle(null);
      try {
        const res = await stocksApi.getHistory(symbol, timeframe);
        setCandles(res.data);
        setTimeout(() => {
          const maxScroll = Math.max(0, res.data.length - candlesOnScreen);
          setScrollOffset(maxScroll);
        }, 100);
        setError('');
      } catch (err: any) {
        setError(err.response?.data?.detail || '데이터 로드 실패');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [symbol, timeframe, candlesOnScreen]);

  // 차트 그리기
  const drawChart = useCallback(() => {
    if (!canvasRef.current || candles.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width, height = rect.height;
    const leftMargin = 60, rightMargin = 20, topMargin = 20, bottomMargin = 30;
    const volHeight = showVolume ? volumeHeight : 0;
    const chartWidth = width - leftMargin - rightMargin;
    const chartHeight = height - topMargin - bottomMargin - volHeight - 10;
    const priceChartHeight = chartHeight * chartScale;

    const maxScroll = Math.max(0, candles.length - candlesOnScreen);
    const startIndex = Math.min(scrollOffset, maxScroll);
    const endIndex = Math.min(startIndex + candlesOnScreen, candles.length);
    const visibleCandles = candles.slice(startIndex, endIndex);
    if (visibleCandles.length === 0) return;

    const visiblePrices = visibleCandles.flatMap(c => [c.high, c.low]);
    const minPrice = Math.min(...visiblePrices);
    const maxPrice = Math.max(...visiblePrices);
    const pricePadding = (maxPrice - minPrice) * 0.1;
    const displayMinPrice = minPrice - pricePadding;
    const displayMaxPrice = maxPrice + pricePadding;
    const displayPriceRange = displayMaxPrice - displayMinPrice;

    const maxVolume = showVolume ? Math.max(...visibleCandles.map(c => c.volume || 0)) : 0;
    const candleWidth = chartWidth / candlesOnScreen;
    const bodyWidth = Math.max(candleWidth * 0.8, 1);

    const priceToY = (price: number) => topMargin + priceChartHeight * (1 - (price - displayMinPrice) / displayPriceRange);
    const indexToX = (i: number) => leftMargin + i * candleWidth;

    // 배경
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    // 그리드
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 1;
    const priceStep = displayPriceRange / 6;
    for (let i = 0; i <= 6; i++) {
      const price = displayMinPrice + priceStep * i;
      const y = priceToY(price);
      ctx.beginPath();
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(width - rightMargin, y);
      ctx.stroke();
      ctx.fillStyle = '#8b949e';
      ctx.font = '11px SF Pro Text, -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(price.toFixed(2), leftMargin - 8, y + 4);
    }

    // 거래량
    if (showVolume && maxVolume > 0) {
      const volumeTop = height - bottomMargin - volHeight - 5;
      visibleCandles.forEach((candle, i) => {
        const x = indexToX(i);
        const volH = candle.volume ? (candle.volume / maxVolume) * volHeight : 0;
        const isUp = candle.close >= candle.open;
        ctx.fillStyle = isUp ? 'rgba(63, 185, 80, 0.5)' : 'rgba(248, 81, 73, 0.5)';
        ctx.fillRect(x, volumeTop, bodyWidth, -volH);
      });
    }

    // 현재가 라인
    const lastCandle = visibleCandles[visibleCandles.length - 1];
    const lastY = priceToY(lastCandle.close);
    ctx.strokeStyle = lastCandle.close >= lastCandle.open ? '#3fb950' : '#f85149';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(leftMargin, lastY);
    ctx.lineTo(width - rightMargin, lastY);
    ctx.stroke();
    ctx.setLineDash([]);

    // MA
    if (showMA) {
      const maData = calculateMA(candles);
      const drawMA = (ma: number[], color: string, lw: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        let started = false;
        ma.slice(startIndex, endIndex).forEach((val, i) => {
          if (!isNaN(val)) {
            const x = indexToX(i);
            const y = priceToY(val);
            if (!started) { ctx.moveTo(x, y); started = true; }
            else ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      };
      drawMA(maData.ma100, 'rgba(163, 113, 247, 0.7)', 1);
      drawMA(maData.ma50, 'rgba(247, 180, 55, 0.8)', 1);
      drawMA(maData.ma20, 'rgba(210, 153, 34, 0.9)', 1.5);
    }

    // 캔들
    visibleCandles.forEach((candle, i) => {
      const x = indexToX(i);
      const isUp = candle.close >= candle.open;
      const color = isUp ? '#3fb950' : '#f85149';

      const isSelected = selectedCandle?.date === candle.date;
      const isHovered = hoveredCandle?.date === candle.date;

      // Wick
      ctx.strokeStyle = isSelected ? '#58a6ff' : color;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x + candleWidth / 2, priceToY(candle.high));
      ctx.lineTo(x + candleWidth / 2, priceToY(candle.low));
      ctx.stroke();

      // Body
      const bodyTop = Math.min(priceToY(candle.open), priceToY(candle.close));
      const bodyHeight = Math.abs(priceToY(candle.close) - priceToY(candle.open)) || 1;
      ctx.fillStyle = isSelected ? '#58a6ff' : color;
      ctx.fillRect(x + candleWidth * 0.1, bodyTop, bodyWidth, bodyHeight);

      // 호버/선택 테두리
      if (isHovered || isSelected) {
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, priceToY(candle.high), bodyWidth, priceToY(candle.low) - priceToY(candle.high));
      }
    });

    // 날짜 라벨
    ctx.fillStyle = '#6e7681';
    ctx.font = '10px SF Pro Text, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const labelInterval = Math.ceil(visibleCandles.length / 8);
    visibleCandles.forEach((candle, i) => {
      if (i % labelInterval === 0) {
        const x = indexToX(i) + candleWidth / 2;
        const date = candle.date.split('T')[0].slice(5);
        ctx.fillText(date, x, height - 8);
      }
    });

    // 스크롤바
    if (candles.length > candlesOnScreen) {
      const scrollBarH = 4, scrollBarW = chartWidth;
      const scrollBarY = height - bottomMargin - scrollBarH - 2;
      const thumbW = (candlesOnScreen / candles.length) * scrollBarW;
      const thumbX = leftMargin + (scrollOffset / maxScroll) * (scrollBarW - thumbW);
      ctx.fillStyle = '#21262d';
      ctx.fillRect(leftMargin, scrollBarY, scrollBarW, scrollBarH);
      ctx.fillStyle = '#58a6ff';
      ctx.fillRect(thumbX, scrollBarY, thumbW, scrollBarH);
    }

    // 정보 박스
    const activeCandle = selectedCandle || hoveredCandle;
    if (activeCandle) {
      const idx = visibleCandles.findIndex(c => c.date === activeCandle.date);
      if (idx >= 0) {
        const x = indexToX(idx) + candleWidth / 2;
        const y = priceToY(activeCandle.high);

        // 크로스헤어
        ctx.strokeStyle = 'rgba(88, 166, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(leftMargin, y);
        ctx.lineTo(width - rightMargin, y);
        ctx.moveTo(x, topMargin);
        ctx.lineTo(x, height - bottomMargin);
        ctx.stroke();
        ctx.setLineDash([]);

        // 박스
        const boxW = 140, boxH = 90;
        const boxX = Math.min(x + 10, width - boxW - 10);
        const boxY = Math.max(y - boxH - 10, 10);
        ctx.fillStyle = 'rgba(22, 27, 34, 0.95)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = '#30363d';
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        ctx.font = '11px SF Pro Text, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#f0f6fc';
        ctx.fillText(activeCandle.date.split('T')[0], boxX + 8, boxY + 16);

        ctx.fillStyle = '#8b949e';
        ['O:', 'H:', 'L:', 'C:'].forEach((label, j) => {
          ctx.fillText(label, boxX + 8, boxY + 32 + j * 16);
        });

        const isUp = activeCandle.close >= activeCandle.open;
        ctx.fillStyle = isUp ? '#3fb950' : '#f85149';
        ctx.textAlign = 'right';
        [activeCandle.open, activeCandle.high, activeCandle.low, activeCandle.close].forEach((v, j) => {
          ctx.fillText(v.toFixed(2), boxX + boxW - 8, boxY + 32 + j * 16);
        });

        if (selectedCandle) {
          ctx.fillStyle = '#58a6ff';
          ctx.font = '10px sans-serif';
          ctx.fillText('✓ 선택됨', boxX + 8, boxY + boxH - 5);
        }
      }
    }

  }, [candles, showMA, showVolume, hoveredCandle, selectedCandle, scrollOffset, chartScale, volumeHeight, candlesOnScreen, calculateMA]);

  // 애니메이션
  useEffect(() => {
    const animate = () => { drawChart(); animationRef.current = requestAnimationFrame(animate); };
    animate();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [drawChart]);

  // 리사이즈
  useEffect(() => {
    const handleResize = () => drawChart();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawChart]);

  // 마우스 이벤트 (데스크톱)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartOffset(scrollOffset);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      const deltaX = dragStartX - e.clientX;
      const maxScroll = Math.max(0, candles.length - candlesOnScreen);
      const scrollAmount = (deltaX / (window.innerWidth - 80)) * candles.length;
      setScrollOffset(Math.max(0, Math.min(maxScroll, dragStartOffset + scrollAmount)));
      return;
    }

    if (!canvasRef.current || candles.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const leftMargin = 60;
    const chartWidth = rect.width - leftMargin - 20;
    const candleW = chartWidth / candlesOnScreen;
    const idx = Math.floor((x - leftMargin) / candleW) + scrollOffset;

    if (idx >= 0 && idx < candles.length) setHoveredCandle(candles[idx]);
    else setHoveredCandle(null);
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => { setIsDragging(false); setHoveredCandle(null); };

  // 클릭으로 캔들 선택
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || candles.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const leftMargin = 60;
    const chartWidth = rect.width - leftMargin - 20;
    const candleW = chartWidth / candlesOnScreen;
    const idx = Math.floor((x - leftMargin) / candleW) + scrollOffset;

    if (idx >= 0 && idx < candles.length) {
      const clickedCandle = candles[idx];
      if (selectedCandle?.date === clickedCandle.date) {
        setSelectedCandle(null);
      } else {
        setSelectedCandle(clickedCandle);
      }
    }
  };

  // 데스크톱 휠: 위=과거, 아래=最新 (트레이딩뷰 표준)
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const maxScroll = Math.max(0, candles.length - candlesOnScreen);
    // 위(deltaY < 0) = 과거로 이동, 아래(deltaY > 0) = 최신으로 이동
    const scrollAmount = e.deltaY > 0
      ? Math.ceil(candles.length / 20)
      : -Math.ceil(candles.length / 20);
    setScrollOffset(Math.max(0, Math.min(maxScroll, scrollOffset + scrollAmount)));
  };

  // 모바일 터치 시작
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      // 단일 터치: 스크롤
      setTouchStartX(e.touches[0].clientX);
      setTouchStartOffset(scrollOffset);
    } else if (e.touches.length === 2) {
      // 두手指: 핀치 줌용 거리 저장
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setTouchStartDist(Math.sqrt(dx * dx + dy * dy));
      setTouchStartCandles(candlesOnScreen);
    }
  };

  // 모바일 터치 이동
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      // 스크롤
      const deltaX = touchStartX - e.touches[0].clientX;
      const maxScroll = Math.max(0, candles.length - candlesOnScreen);
      const scrollAmount = (deltaX / 100) * candles.length;
      setScrollOffset(Math.max(0, Math.min(maxScroll, touchStartOffset + scrollAmount)));
    } else if (e.touches.length === 2) {
      // 핀치 줌
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const delta = touchStartDist - dist;
      const zoomDelta = Math.round(delta / 10);
      setCandlesOnScreen(Math.max(20, Math.min(candles.length, touchStartCandles + zoomDelta)));
    }
  };

  // 줌 버튼
  const zoomIn = () => setCandlesOnScreen(Math.max(20, candlesOnScreen - 10));
  const zoomOut = () => setCandlesOnScreen(Math.min(candles.length, candlesOnScreen + 10));

  const formatPrice = (num: number | undefined) => {
    if (num === undefined || num === null) return '-';
    return num.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  };

  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : null;
  const firstPrice = candles.length > 0 ? candles[0].open : null;
  const changePct = currentPrice && firstPrice ? ((currentPrice - firstPrice) / firstPrice * 100) : null;

  const helpText = isMobile
    ? '스와이프로 이동 • 핀치로 줌 • 클릭으로 캔들 선택'
    : '드래그로 이동 • 휠로 스크롤 • 클릭으로 캔들 선택';

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#0d1117]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#30363d] gap-2 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-[#f0f6fc]">{symbol}</span>
          {currentPrice && (
            <div className="flex flex-col">
              <span className="text-lg font-bold text-[#f0f6fc]">${formatPrice(currentPrice)}</span>
              <span className={`text-xs ${changePct && changePct >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                {changePct !== null && (changePct >= 0 ? '+' : '')}{formatPrice(changePct ?? undefined)}%
              </span>
            </div>
          )}
        </div>

        {/* Timeframes */}
        <div className="flex items-center gap-1 overflow-x-auto max-w-[300px]">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`px-2 py-1 rounded text-xs whitespace-nowrap ${timeframe === tf.value ? 'bg-[#58a6ff] text-white' : 'text-[#8b949e] hover:text-[#f0f6fc]'}`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          {/* 시간축 줌 */}
          <button onClick={zoomIn} className="px-2 py-1 bg-[#21262d] text-[#8b949e] rounded text-xs hover:text-[#f0f6fc]">−</button>
          <span className="px-1 text-xs text-[#8b949e]">{candlesOnScreen}</span>
          <button onClick={zoomOut} className="px-2 py-1 bg-[#21262d] text-[#8b949e] rounded text-xs hover:text-[#f0f6fc]">+</button>

          {/* 가격 스케일 */}
          <button onClick={() => setChartScale(Math.max(0.5, chartScale - 0.1))} className="px-2 py-1 bg-[#21262d] text-[#8b949e] rounded text-xs">−</button>
          <span className="px-1 text-xs text-[#8b949e]">{Math.round(chartScale * 100)}%</span>
          <button onClick={() => setChartScale(Math.min(2, chartScale + 0.1))} className="px-2 py-1 bg-[#21262d] text-[#8b949e] rounded text-xs">+</button>

          {/* 거래량 */}
          <button onClick={() => setVolumeHeight(Math.max(0, volumeHeight - 20))} className="px-2 py-1 bg-[#21262d] text-[#8b949e] rounded text-xs">▼</button>
          <button onClick={() => setVolumeHeight(Math.min(150, volumeHeight + 20))} className="px-2 py-1 bg-[#21262d] text-[#8b949e] rounded text-xs">▲</button>

          <button onClick={() => setShowMA(!showMA)} className={`px-2 py-1 rounded text-xs ${showMA ? 'bg-[#d29922] text-white' : 'bg-[#21262d] text-[#8b949e]'}`}>MA</button>
          <button onClick={() => setShowVolume(!showVolume)} className={`px-2 py-1 rounded text-xs ${showVolume ? 'bg-[#58a6ff] text-white' : 'bg-[#21262d] text-[#8b949e]'}`}>Vol</button>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="flex-1 w-full">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-[#f85149]">{error}</div>
        ) : (
          <canvas
            ref={canvasRef}
            className={`w-full h-full ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
          />
        )}
      </div>

      <div className="px-3 py-1 bg-[#161b22] border-t border-[#30363d] text-xs text-[#6e7681]">
        {helpText} • +/- 버튼으로 줌
      </div>
    </div>
  );
}
