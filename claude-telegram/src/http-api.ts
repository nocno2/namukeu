/**
 * HTTP API server for dashboard integration.
 * Runs alongside the Telegram bot on port 8003.
 */
import type { Heartbeat, TaskStore, GoalStore, AuditLog, ForbiddenActions } from "@namukeu/agent-core";
import {
  getRevenueStatus,
  getRevenueHistory,
  getRevenueForecast,
  getProfitSummary,
  getRevenueBySource,
  setMonthlyTarget,
  addRevenue,
  addCost,
  type RevenueData,
} from "./revenue";

const PORT = parseInt(process.env.AGENT_API_PORT || "8003", 10);
const API_TOKEN = process.env.AGENT_API_TOKEN || "agent-api-token";

interface HttpApiDeps {
  heartbeat: Heartbeat | null;
  taskStore: TaskStore | null;
  goalStore: GoalStore | null;
  auditLog: AuditLog | null;
  forbidden: ForbiddenActions | null;
}

let deps: HttpApiDeps;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorized(): Response {
  return json({ error: "Unauthorized" }, 401);
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("Authorization");
  return auth === `Bearer ${API_TOKEN}`;
}

async function parseBody(req: Request): Promise<Record<string, any>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function handleRequest(req: Request): Promise<Response> {
  if (!checkAuth(req)) return unauthorized();

  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // --- Status ---
  if (path === "/api/status" && method === "GET") {
    const hb = deps.heartbeat;
    const status = hb ? await hb.getStatus() : null;
    return json(status || { error: "Heartbeat not initialized" });
  }

  // --- Tasks ---
  if (path === "/api/tasks" && method === "GET") {
    if (!deps.taskStore) return json([]);
    return json(deps.taskStore.getActive());
  }

  // --- Monitors ---
  if (path === "/api/monitors" && method === "GET") {
    const hb = deps.heartbeat;
    if (!hb) return json({ monitors: [] });
    const ms = hb.getMonitorSystem();
    return json(ms ? ms.getStatus() : { monitors: [] });
  }

  // --- Toggles ---
  if (path === "/api/toggle/idle" && method === "POST") {
    const body = await parseBody(req);
    if (deps.heartbeat) {
      deps.heartbeat.setIdleEnabled(!!body.enabled);
      return json({ ok: true, idle: body.enabled });
    }
    return json({ error: "Heartbeat not initialized" }, 500);
  }

  if (path === "/api/toggle/chain" && method === "POST") {
    const body = await parseBody(req);
    if (deps.heartbeat) {
      deps.heartbeat.setChainingEnabled(!!body.enabled);
      return json({ ok: true, chain: body.enabled });
    }
    return json({ error: "Heartbeat not initialized" }, 500);
  }

  if (path === "/api/toggle/monitors" && method === "POST") {
    const body = await parseBody(req);
    if (deps.heartbeat) {
      deps.heartbeat.setMonitorsEnabled(!!body.enabled);
      return json({ ok: true, monitors: body.enabled });
    }
    return json({ error: "Heartbeat not initialized" }, 500);
  }

  // --- Heartbeat control ---
  if (path === "/api/heartbeat/stop" && method === "POST") {
    if (deps.heartbeat) {
      deps.heartbeat.stop();
      return json({ ok: true, status: "stopped" });
    }
    return json({ error: "Heartbeat not initialized" }, 500);
  }

  if (path === "/api/heartbeat/resume" && method === "POST") {
    if (deps.heartbeat) {
      deps.heartbeat.resume();
      return json({ ok: true, status: "running" });
    }
    return json({ error: "Heartbeat not initialized" }, 500);
  }

  // --- Goals CRUD ---
  if (path === "/api/goals" && method === "GET") {
    if (!deps.goalStore) return json([]);
    return json(deps.goalStore.getAll());
  }

  if (path.match(/^\/api\/goals\/[^/]+$/) && method === "GET") {
    const id = path.split("/").pop()!;
    if (!deps.goalStore) return notFound();
    // Check if it's a project code
    const projectCodes = ["COIN", "BLOG", "DASH", "TRAIN", "TGBOT", "DCBOT", "GENERAL"];
    if (projectCodes.includes(id.toUpperCase())) {
      return json(deps.goalStore.getByProject(id.toUpperCase() as any));
    }
    const goal = deps.goalStore.getById(id);
    return goal ? json(goal) : notFound();
  }

  if (path === "/api/goals" && method === "POST") {
    if (!deps.goalStore) return json({ error: "Goals not initialized" }, 500);
    const body = await parseBody(req);
    if (!body.title || !body.description || !body.projects) {
      return json({ error: "title, description, projects required" }, 400);
    }
    const goal = deps.goalStore.createGoal({
      title: body.title,
      description: body.description,
      projects: body.projects,
      priority: body.priority,
      deadline: body.deadline,
    });
    return json(goal, 201);
  }

  if (path.match(/^\/api\/goals\/[^/]+$/) && method === "PUT") {
    const id = path.split("/").pop()!;
    if (!deps.goalStore) return json({ error: "Goals not initialized" }, 500);
    const body = await parseBody(req);
    const goal = deps.goalStore.updateGoal(id, body);
    return goal ? json(goal) : notFound();
  }

  if (path.match(/^\/api\/goals\/[^/]+$/) && method === "DELETE") {
    const id = path.split("/").pop()!;
    if (!deps.goalStore) return json({ error: "Goals not initialized" }, 500);
    const ok = deps.goalStore.deleteGoal(id);
    return ok ? json({ ok: true }) : notFound();
  }

  // --- Revenue ---
  if (path === "/api/revenue/status" && method === "GET") {
    const status = await getRevenueStatus();
    return json({ status });
  }

  if (path === "/api/revenue/history" && method === "GET") {
    const months = parseInt(new URL(req.url).searchParams.get("months") || "6", 10);
    const history = await getRevenueHistory(months);
    return json({ history });
  }

  if (path === "/api/revenue/forecast" && method === "GET") {
    const forecast = await getRevenueForecast();
    return json({ forecast });
  }

  if (path === "/api/revenue/profit" && method === "GET") {
    const months = parseInt(new URL(req.url).searchParams.get("months") || "6", 10);
    const profit = await getProfitSummary(months);
    return json({ profit });
  }

  if (path === "/api/revenue/by-source" && method === "GET") {
    const months = parseInt(new URL(req.url).searchParams.get("months") || "12", 10);
    const bySource = await getRevenueBySource(months);
    return json({ bySource });
  }

  if (path === "/api/revenue/target" && method === "POST") {
    const body = await parseBody(req);
    if (!body.amount || typeof body.amount !== "number") {
      return json({ error: "amount (number) required" }, 400);
    }
    const result = await setMonthlyTarget(body.amount);
    return json({ result });
  }

  if (path === "/api/revenue" && method === "POST") {
    const body = await parseBody(req);
    if (!body.amount || !body.source) {
      return json({ error: "amount (number) and source (string) required" }, 400);
    }
    const result = await addRevenue(body.amount, body.source);
    return json({ result });
  }

  if (path === "/api/revenue/cost" && method === "POST") {
    const body = await parseBody(req);
    if (!body.amount || !body.category) {
      return json({ error: "amount (number) and category (string) required" }, 400);
    }
    const result = await addCost(body.amount, body.category, body.description);
    return json({ result });
  }

  // Raw data endpoint for dashboard visualization
  if (path === "/api/revenue/data" && method === "GET") {
    // Read revenue.json directly for dashboard visualization
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const dataDir = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
    try {
      const raw = await readFile(join(dataDir, "revenue.json"), "utf-8");
      const data: RevenueData = JSON.parse(raw);

      // Process data for visualization
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const monthRecords = data.records.filter((r) => r.date.startsWith(currentMonth));
      const monthCosts = data.costs.filter((c) => c.date.startsWith(currentMonth));

      const currentRevenue = monthRecords.reduce((sum, r) => sum + r.amount, 0);
      const currentCost = monthCosts.reduce((sum, c) => sum + c.amount, 0);
      const netIncome = currentRevenue - currentCost;

      // Calculate monthly data for the last 6 months
      const monthlyData: { month: string; revenue: number; cost: number; profit: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthRev = data.records.filter((r) => r.date.startsWith(month)).reduce((sum, r) => sum + r.amount, 0);
        const monthCost = data.costs.filter((c) => c.date.startsWith(month)).reduce((sum, c) => sum + c.amount, 0);
        monthlyData.push({ month, revenue: monthRev, cost: monthCost, profit: monthRev - monthCost });
      }

      // Calculate forecast with multiple methods
      const today = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const remainingDays = daysInMonth - today;

      // Helper: calculate moving average
      const calculateMovingAverage = (values: number[], days: number): number => {
        if (values.length === 0) return 0;
        const recent = values.slice(-days);
        if (recent.length === 0) return 0;
        return recent.reduce((a, b) => a + b, 0) / recent.length;
      };

      // Simple average based on current month
      const simpleDailyRevenue = today > 0 ? currentRevenue / today : 0;
      const simpleDailyCost = today > 0 ? currentCost / today : 0;

      // Moving averages based on all records
      const dailyRevenueValues = data.records.map((r) => r.amount);
      const dailyCostValues = data.costs.map((c) => c.amount);

      const ma7Revenue = calculateMovingAverage(dailyRevenueValues, 7);
      const ma7Cost = calculateMovingAverage(dailyCostValues, 7);
      const ma14Revenue = calculateMovingAverage(dailyRevenueValues, 14);
      const ma14Cost = calculateMovingAverage(dailyCostValues, 14);

      // Projections for each method
      const projSimple = {
        method: "simple",
        label: "단순 평균",
        projectedRevenue: Math.round(simpleDailyRevenue * daysInMonth),
        projectedCost: Math.round(simpleDailyCost * daysInMonth),
        projectedProfit: Math.round(simpleDailyRevenue * daysInMonth) - Math.round(simpleDailyCost * daysInMonth),
      };
      const proj7d = {
        method: "ma7",
        label: "7일 이동평균",
        projectedRevenue: Math.round(ma7Revenue * daysInMonth),
        projectedCost: Math.round(ma7Cost * daysInMonth),
        projectedProfit: Math.round(ma7Revenue * daysInMonth) - Math.round(ma7Cost * daysInMonth),
      };
      const proj14d = {
        method: "ma14",
        label: "14일 이동평균",
        projectedRevenue: Math.round(ma14Revenue * daysInMonth),
        projectedCost: Math.round(ma14Cost * daysInMonth),
        projectedProfit: Math.round(ma14Revenue * daysInMonth) - Math.round(ma14Cost * daysInMonth),
      };

      // Choose best prediction (prioritize 7-day if enough data)
      const hasEnoughData = monthRecords.length >= 7;
      const bestForecast = hasEnoughData ? proj7d : projSimple;

      // Trend indicator
      const trend = ma7Revenue > ma14Revenue ? "up" : ma7Revenue < ma14Revenue ? "down" : "stable";
      const trendLabel = trend === "up" ? "상승" : trend === "down" ? "하락" : "持平";

      // Calculate by-source breakdown for recent months
      const recentMonths: string[] = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        recentMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }

      const bySource: Record<string, number> = {};
      for (const r of data.records) {
        const month = r.date.substring(0, 7);
        if (recentMonths.includes(month)) {
          bySource[r.source] = (bySource[r.source] || 0) + r.amount;
        }
      }

      // Convert to sorted array
      const bySourceArray = Object.entries(bySource)
        .map(([source, amount]) => ({ source, amount }))
        .sort((a, b) => b.amount - a.amount);

      const totalBySource = bySourceArray.reduce((sum, item) => sum + item.amount, 0);

      return json({
        monthlyTarget: data.monthlyTarget,
        currentRevenue,
        currentCost,
        netIncome,
        targetProgress: data.monthlyTarget > 0 ? Math.round((netIncome / data.monthlyTarget) * 100) : 0,
        monthlyData,
        forecast: {
          projectedRevenue: bestForecast.projectedRevenue,
          projectedCost: bestForecast.projectedCost,
          projectedProfit: bestForecast.projectedProfit,
          remainingDays,
          daysInMonth,
          today,
          methods: [projSimple, proj7d, proj14d],
          bestMethod: bestForecast.method,
          trend,
          trendLabel,
        },
        bySource: bySourceArray.map((item) => ({
          ...item,
          percent: totalBySource > 0 ? Math.round((item.amount / totalBySource) * 100) : 0,
        })),
        recentRecords: data.records.slice(-5).reverse(),
        recentCosts: monthCosts.slice(-3).reverse(),
      });
    } catch (err) {
      return json({ error: "Failed to load revenue data", detail: String(err) }, 500);
    }
  }

  return notFound();
}

export function startHttpApi(dependencies: HttpApiDeps): void {
  deps = dependencies;

  Bun.serve({
    port: PORT,
    fetch: handleRequest,
  });

  console.log(`[http-api] Agent API server running on port ${PORT}`);
}
