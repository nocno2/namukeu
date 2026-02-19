import json
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from src.api.auth import verify
from src.core.database import Database
from src.core import runtime
from src.models.dashboard import PortfolioSummary

router = APIRouter(tags=["dashboard"])

TEMPLATES_DIR = Path(__file__).parent.parent / "dashboard" / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def get_db() -> Database:
    raise NotImplementedError


def get_config():
    raise NotImplementedError


def _get_context(db: Database, config=None) -> dict:
    if config is None:
        config = runtime.config
    positions = db.get_positions()
    history = db.get_performance_history(limit=1)
    strategies = db.get_strategies(enabled_only=True)

    positions_value = sum(
        (p.get("current_price", 0) or 0) * p.get("volume", 0) for p in positions
    )

    if history:
        latest = history[0]
        portfolio = {
            "total_equity": latest["total_equity"],
            "cash_balance": latest["cash_balance"],
            "positions_value": positions_value,
            "total_pnl": latest["total_pnl"],
            "total_pnl_pct": latest["total_pnl_pct"],
            "daily_pnl": latest["daily_pnl"],
            "active_positions": len(positions),
        }
    else:
        portfolio = {
            "total_equity": 0,
            "cash_balance": 0,
            "positions_value": positions_value,
            "total_pnl": 0,
            "total_pnl_pct": 0,
            "daily_pnl": 0,
            "active_positions": len(positions),
        }

    return {
        "portfolio": portfolio,
        "positions": positions,
        "dry_run": config.dry_run if config else True,
        "max_positions": config.max_positions if config else 5,
        "active_strategies": len(strategies),
    }


# --- HTML Pages ---


@router.get("/", response_class=HTMLResponse)
def dashboard_home(request: Request, db: Database = Depends(get_db)):
    ctx = _get_context(db)
    orders = db.get_orders(limit=10)
    return templates.TemplateResponse("index.html", {
        "request": request,
        **ctx,
        "orders": orders,
        "active": "home",
    })


@router.get("/dashboard/trades", response_class=HTMLResponse)
def dashboard_trades(request: Request, db: Database = Depends(get_db)):
    ctx = _get_context(db)
    orders = db.get_orders(limit=100)
    return templates.TemplateResponse("trades.html", {
        "request": request,
        **ctx,
        "orders": orders,
        "active": "trades",
    })


@router.get("/dashboard/strategies", response_class=HTMLResponse)
def dashboard_strategies(request: Request, db: Database = Depends(get_db)):
    ctx = _get_context(db)
    configs = db.get_strategies()
    configs = [{**c, "enabled": bool(c["enabled"])} for c in configs]

    from src.strategies.registry import list_strategies, get_strategy
    available = []
    for name in list_strategies():
        s = get_strategy(name)
        available.append({
            "name": s.name,
            "required_candle_count": s.required_candle_count,
            "default_params": s.default_params,
        })

    token = runtime.config.api_token if runtime.config else ""

    return templates.TemplateResponse("strategies.html", {
        "request": request,
        **ctx,
        "configs": configs,
        "available": available,
        "token": token,
        "active": "strategies",
    })


@router.get("/dashboard/pipeline-logs", response_class=HTMLResponse)
def dashboard_pipeline_logs(request: Request, db: Database = Depends(get_db)):
    ctx = _get_context(db)
    logs = db.get_pipeline_logs(limit=50)
    for log in logs:
        if log.get("evidences"):
            try:
                log["evidences_parsed"] = json.loads(log["evidences"])
            except (json.JSONDecodeError, TypeError):
                log["evidences_parsed"] = []
        else:
            log["evidences_parsed"] = []
    return templates.TemplateResponse("pipeline_logs.html", {
        "request": request,
        **ctx,
        "logs": logs,
        "active": "pipeline",
    })


@router.get("/dashboard/backtest", response_class=HTMLResponse)
def dashboard_backtest(request: Request, page: int = 1, db: Database = Depends(get_db)):
    ctx = _get_context(db)
    per_page = 15
    total = db.count_backtest_results()
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))
    offset = (page - 1) * per_page
    results = db.get_backtest_results(limit=per_page, offset=offset)

    from src.strategies.registry import list_strategies, get_strategy
    available = []
    for name in list_strategies():
        s = get_strategy(name)
        available.append({
            "name": s.name,
            "required_candle_count": s.required_candle_count,
            "default_params": s.default_params,
        })

    token = runtime.config.api_token if runtime.config else ""

    # 전략별 최적 타임프레임 (백테스트 결과 기반)
    recommended_timeframes = {
        "combined_v2": "minute60",
        "rsi": "minute60",
        "rsi_ma_choice": "minute15",
        "ema_crossover_vol": "day",
        "trend_following": "minute60",
        "supertrend": "minute60",
    }

    return templates.TemplateResponse("backtest.html", {
        "request": request,
        **ctx,
        "results": results,
        "available": available,
        "token": token,
        "active": "backtest",
        "page": page,
        "total_pages": total_pages,
        "total": total,
        "recommended_timeframes": recommended_timeframes,
    })


@router.get("/dashboard/pipeline-logs", response_class=HTMLResponse)
def dashboard_pipeline_logs(request: Request, db: Database = Depends(get_db)):
    ctx = _get_context(db)
    logs = db.get_pipeline_logs(limit=50)
    for log in logs:
        if log.get("evidences"):
            try:
                log["evidences_parsed"] = json.loads(log["evidences"])
            except (json.JSONDecodeError, TypeError):
                log["evidences_parsed"] = []
        else:
            log["evidences_parsed"] = []
    return templates.TemplateResponse("pipeline_logs.html", {
        "request": request,
        **ctx,
        "logs": logs,
        "active": "pipeline",
    })


# --- HTMX Partials ---


@router.get("/dashboard/partials/equity", response_class=HTMLResponse)
def partial_equity(db: Database = Depends(get_db)):
    ctx = _get_context(db)
    p = ctx["portfolio"]
    return f"""
    <h3>총 자산</h3>
    <div class="value">{p['total_equity']:,.0f} <small style="font-size:14px">KRW</small></div>
    """


@router.get("/dashboard/partials/positions", response_class=HTMLResponse)
async def partial_positions(request: Request, show_dust: bool = False, db: Database = Depends(get_db)):
    from datetime import datetime

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    stables = {"KRW", "USDT", "USDC", "BUSD"}

    # 1) 거래소 잔고 수집
    exchange_balances = []
    exchange_errors = []
    for name, ex in runtime.exchanges.items():
        try:
            balances = await ex.get_balances()
            quote = ex.info.quote_currency  # "KRW" or "USDT"
            # 현재가 일괄 조회를 위한 ticker 목록
            tickers_to_query = []
            balance_map = []
            for b in balances:
                currency = b.get("currency", "")
                bal = float(b.get("balance", 0))
                locked = float(b.get("locked", 0))
                total = bal + locked
                if total < 0.00000001:
                    continue
                avg_price = float(b.get("avg_buy_price", 0))
                ticker = f"{quote}-{currency}" if currency not in stables else None
                balance_map.append({
                    "exchange": name,
                    "currency": currency,
                    "balance": total,
                    "avg_buy_price": avg_price,
                    "ticker": ticker,
                    "quote": quote,
                })
                if ticker:
                    tickers_to_query.append(ticker)

            # 유효한 ticker만 필터링 후 현재가 일괄 조회
            price_map = {}
            if tickers_to_query:
                try:
                    valid_tickers = set(await ex.get_tickers(fiat=quote))
                    filtered = [t for t in tickers_to_query if t in valid_tickers]
                    if filtered:
                        result = await ex.get_current_price(filtered)
                        if isinstance(result, dict):
                            price_map = result
                        else:
                            price_map = {filtered[0]: float(result)}
                except Exception:
                    pass  # 현재가 조회 실패는 무시 (잔고는 표시)

            for item in balance_map:
                cur_price = 0.0
                if item["ticker"] and item["ticker"] in price_map:
                    cur_price = float(price_map[item["ticker"]])
                elif item["currency"] in stables:
                    cur_price = 1.0  # stablecoin: 1:1
                item["current_price"] = cur_price
                # 평가금액 계산 (quote 통화 기준)
                if item["currency"] in stables:
                    item["value"] = item["balance"]
                else:
                    item["value"] = cur_price * item["balance"]
                exchange_balances.append(item)
        except Exception as e:
            exchange_errors.append(f"{name}: {e}")

    # 2) 봇 DB 포지션
    positions = db.get_positions()

    if not positions and not exchange_balances:
        if exchange_errors:
            err_html = "<br>".join(exchange_errors)
            return f'<div style="padding:16px;"><p class="negative" style="font-size:13px;">거래소 잔고 조회 실패:</p><p style="font-size:12px; color:var(--text-dim); margin-top:4px;">{err_html}</p></div>'
        return '<div style="text-align:center; color:var(--text-dim); padding:24px;">보유 포지션 없음</div>'

    # dust 필터: 평가금액 1000원(또는 1 USDT) 미만
    dust_threshold_krw = 1000
    dust_threshold_usd = 1
    dust_items = []
    main_items = []
    for b in exchange_balances:
        threshold = dust_threshold_krw if b["quote"] == "KRW" else dust_threshold_usd
        if b["value"] < threshold:
            dust_items.append(b)
        else:
            main_items.append(b)

    # 표시할 항목 결정
    display_items = main_items + dust_items if show_dust else main_items
    display_items.sort(key=lambda x: x["value"], reverse=True)

    # 합계 계산 (quote별)
    totals = {}
    for b in main_items:
        q = b["quote"]
        totals[q] = totals.get(q, 0) + b["value"]

    html = ""

    # 거래소 잔고 테이블
    if display_items:
        rows = ""
        for b in display_items:
            is_dust = b in dust_items
            cur_fmt = f"{b['current_price']:,.2f}" if b["current_price"] and b["currency"] not in stables else "-"
            val_fmt = f"{b['value']:,.0f}" if b["value"] >= 1 else f"{b['value']:.4f}"
            unit = b["quote"]
            avg_fmt = f"{b['avg_buy_price']:,.0f}" if b["avg_buy_price"] else "-"
            dust_style = ' style="opacity:0.45;"' if is_dust else ""
            rows += f"""
            <tr{dust_style}>
                <td>{b['exchange']}</td>
                <td>{b['currency']}</td>
                <td>{b['balance']:.8g}</td>
                <td>{avg_fmt}</td>
                <td>{cur_fmt}</td>
                <td>{val_fmt} <small>{unit}</small></td>
            </tr>"""

        # 합계 행
        total_row = ""
        for q, val in totals.items():
            total_row += f"""
            <tr style="border-top:2px solid var(--border); font-weight:600;">
                <td colspan="5" style="text-align:right;">합계 ({q})</td>
                <td>{val:,.0f} <small>{q}</small></td>
            </tr>"""

        # dust 토글
        dust_count = len(dust_items)
        toggle_url = "?show_dust=true" if not show_dust else "?show_dust=false"
        toggle_label = f"더스트 포함 ({dust_count})" if not show_dust else "더스트 숨기기"
        toggle_html = f"""
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <h3 style="font-size:14px; color:var(--text-dim); margin:0;">거래소 잔고</h3>
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:11px; color:var(--text-dim);">{now}</span>
                <a href="{toggle_url}" hx-get="/dashboard/partials/positions{toggle_url}" hx-target="#positions-container" hx-swap="innerHTML"
                   style="font-size:12px; color:var(--accent); cursor:pointer; text-decoration:none;">{toggle_label}</a>
            </div>
        </div>"""

        html += f"""
        {toggle_html}
        <table>
            <thead><tr><th>거래소</th><th>자산</th><th>수량</th><th>평균 매수가</th><th>현재가</th><th>평가금액</th></tr></thead>
            <tbody>{rows}{total_row}</tbody>
        </table>"""

    # 봇 추적 포지션
    if positions:
        rows = ""
        for p in positions:
            pnl_class = "positive" if p["unrealized_pnl"] >= 0 else "negative"
            rows += f"""
            <tr>
                <td>{p['ticker']}</td>
                <td>{p['volume']:.6f}</td>
                <td>{p['avg_entry_price']:,.0f}</td>
                <td>{(p['current_price'] or 0):,.0f}</td>
                <td class="{pnl_class}">{p['unrealized_pnl']:+,.0f}</td>
                <td class="{pnl_class}">{p['unrealized_pnl_pct']:+.2f}%</td>
            </tr>"""
        if html:
            html += '<div style="margin-top:16px;"></div>'
        html += f"""
        <h3 style="font-size:14px; margin-bottom:8px; color:var(--text-dim);">봇 포지션</h3>
        <table>
            <thead><tr>
                <th>종목</th><th>수량</th><th>평균 매수가</th>
                <th>현재가</th><th>미실현 손익</th><th>수익률</th>
            </tr></thead>
            <tbody>{rows}</tbody>
        </table>"""

    return html


# --- API Endpoints ---


@router.get("/portfolio/summary", response_model=PortfolioSummary)
def portfolio_summary(
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    ctx = _get_context(db)
    p = ctx["portfolio"]
    return PortfolioSummary(
        **p,
        trading_mode="dry_run" if ctx["dry_run"] else "live",
    )


@router.get("/portfolio/history")
def portfolio_history(
    limit: int = 100,
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    return db.get_performance_history(limit=limit)


# --- 전환 체크리스트 검증 API ---

@router.get("/transition-checklist")
def transition_checklist(
    _=Depends(verify),
    db: Database = Depends(get_db),
):
    """라이브 트레이딩 전환 체크리스트 자동 검증.

    조건:
    - 백테스트 수익률 > 0
    - 백테스트 최대낙폭 < 10%
    - 페이퍼 트레이딩 승률 > 50%
    """
    # 1. 백테스트 결과 조회
    backtest_results = db.get_backtest_results(limit=100)
    bt_passed = False
    bt_details = []

    if backtest_results:
        # 모든 백테스트 결과 중 조건 충족 비율 계산
        bt_profitable = sum(1 for r in backtest_results if r["total_return_pct"] > 0)
        bt_low_drawdown = sum(1 for r in backtest_results if r["max_drawdown_pct"] < 10)
        bt_total = len(backtest_results)

        bt_details = {
            "total_backtests": bt_total,
            "profitable_count": bt_profitable,
            "low_drawdown_count": bt_low_drawdown,
            "profitable_rate": round(bt_profitable / bt_total * 100, 1) if bt_total > 0 else 0,
            "low_drawdown_rate": round(bt_low_drawdown / bt_total * 100, 1) if bt_total > 0 else 0,
        }

        # 조건: 수익률>0 AND 최대낙폭<10% 인 백테스트가 1개 이상
        bt_passed = any(
            r["total_return_pct"] > 0 and r["max_drawdown_pct"] < 10
            for r in backtest_results
        )
    else:
        bt_details = {"total_backtests": 0, "message": "백테스트 결과 없음"}

    # 2. 페이퍼 트레이딩 결과 조회
    paper_pnl = db.get_paper_trading_pnl()
    paper_passed = paper_pnl.get("win_rate", 0) > 50 if paper_pnl else False

    paper_details = {
        "total_trades": paper_pnl.get("completed_trades", 0),
        "wins": paper_pnl.get("wins", 0),
        "losses": paper_pnl.get("losses", 0),
        "win_rate": paper_pnl.get("win_rate", 0),
        "total_pnl": paper_pnl.get("total_pnl", 0),
        "total_pnl_pct": paper_pnl.get("total_pnl_pct", 0),
    }

    # 3. 종합 판정
    all_passed = bt_passed and paper_passed

    recommendation = "전환 준비 완료"
    if not bt_passed and not paper_passed:
        recommendation = "백테스트/페이퍼 모두 조건 미충족 - 추가 검증 필요"
    elif bt_passed and not paper_passed:
        recommendation = "백테스트는 통과, 페이퍼 트레이딩 승률 확보 필요"
    elif not bt_passed and paper_passed:
        recommendation = "페이퍼는 양호, 백테스트 조건 충족 전략 필요"
    else:
        recommendation = "모든 조건 충족 - 소액 라이브 전환 권장 (5% 이하)"

    return {
        "ready_to_transition": all_passed,
        "backtest": {
            "passed": bt_passed,
            "conditions": {
                "profit_rate_gt_0": bt_passed,
                "max_drawdown_lt_10pct": bt_passed,
            },
            "details": bt_details,
        },
        "paper_trading": {
            "passed": paper_passed,
            "conditions": {
                "win_rate_gt_50pct": paper_passed,
            },
            "details": paper_details,
        },
        "recommendation": recommendation,
    }
