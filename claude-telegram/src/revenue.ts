import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
const REVENUE_FILE = join(DATA_DIR, "revenue.json");

export interface RevenueRecord {
  date: string; // YYYY-MM-DD
  amount: number;
  source: string;
}

export interface CostRecord {
  date: string; // YYYY-MM-DD
  amount: number;
  category: string;
  description?: string;
}

export interface RevenueData {
  monthlyTarget: number;
  records: RevenueRecord[];
  costs: CostRecord[];
}

async function loadRevenue(): Promise<RevenueData> {
  try {
    const raw = await readFile(REVENUE_FILE, "utf-8");
    const data = JSON.parse(raw);
    // Ensure costs array exists for backwards compatibility
    if (!data.costs) {
      data.costs = [];
      await saveRevenue(data);
    }
    return data;
  } catch {
    // Create default revenue.json if not exists
    const defaultData: RevenueData = { monthlyTarget: 0, records: [], costs: [] };
    await saveRevenue(defaultData);
    console.log("[revenue] Created new revenue.json with default values");
    return defaultData;
  }
}

async function saveRevenue(data: RevenueData): Promise<void> {
  await writeFile(REVENUE_FILE, JSON.stringify(data, null, 2));
}

export async function getRevenueStatus(): Promise<string> {
  const data = await loadRevenue();

  // Get current month's records
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthRecords = data.records.filter((r) => r.date.startsWith(currentMonth));
  const monthCosts = data.costs.filter((c) => c.date.startsWith(currentMonth));
  const currentRevenue = monthRecords.reduce((sum, r) => sum + r.amount, 0);
  const currentCost = monthCosts.reduce((sum, c) => sum + c.amount, 0);
  const netIncome = currentRevenue - currentCost;

  const lines: string[] = [];

  if (data.monthlyTarget > 0) {
    const percent = Math.round((netIncome / data.monthlyTarget) * 100);
    const bar = "█".repeat(Math.min(Math.max(percent, 0), 50)) + "░".repeat(50 - Math.min(Math.max(percent, 0), 50));
    lines.push(`월 목표: ₩${data.monthlyTarget.toLocaleString()}`);
    lines.push(`수익: ₩${currentRevenue.toLocaleString()} | 비용: ₩${currentCost.toLocaleString()}`);
    lines.push(`순수입: ₩${netIncome.toLocaleString()} (${percent}%)`);
    lines.push(`${bar.slice(0, 25)}`);

    if (netIncome >= data.monthlyTarget) {
      lines.push("\n🎉 월 목표 달성!");
    } else {
      const remaining = data.monthlyTarget - netIncome;
      lines.push(`\n남은 금액: ₩${remaining.toLocaleString()}`);
    }
  } else {
    lines.push("월 목표가 설정되지 않았습니다.");
    lines.push(`수익: ₩${currentRevenue.toLocaleString()} | 비용: ₩${currentCost.toLocaleString()}`);
    lines.push(`순수입: ₩${netIncome.toLocaleString()}`);
  }

  // recent records (last 5)
  if (data.records.length > 0) {
    lines.push("\n최근 수익:");
    const recent = data.records.slice(-5).reverse();
    for (const r of recent) {
      lines.push(`+ ${r.date}: ₩${r.amount.toLocaleString()} (${r.source})`);
    }
  }

  // recent costs (last 3)
  if (monthCosts.length > 0) {
    lines.push("\n최근 비용:");
    const recent = monthCosts.slice(-3).reverse();
    for (const c of recent) {
      lines.push(`- ${c.date}: ₩${c.amount.toLocaleString()} (${c.category})`);
    }
  }

  return lines.join("\n");
}

export async function setMonthlyTarget(amount: number): Promise<string> {
  const data = await loadRevenue();
  data.monthlyTarget = amount;
  await saveRevenue(data);
  return `월 목표가 ₩${amount.toLocaleString()}로 설정되었습니다.`;
}

export async function addRevenue(amount: number, source: string): Promise<string> {
  const data = await loadRevenue();
  const now = new Date();
  const date = now.toISOString().split("T")[0];

  data.records.push({ date, amount, source });
  await saveRevenue(data);

  // Calculate current month total
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthTotal = data.records
    .filter((r) => r.date.startsWith(currentMonth))
    .reduce((sum, r) => sum + r.amount, 0);

  let msg = `₩${amount.toLocaleString()}(${source}) 추가됨.`;
  if (data.monthlyTarget > 0) {
    const percent = Math.round((monthTotal / data.monthlyTarget) * 100);
    msg += ` 현재 ${percent}% (₩${monthTotal.toLocaleString()}/${data.monthlyTarget.toLocaleString()})`;
  }

  return msg;
}

export async function getRevenueHistory(months: number = 6): Promise<string> {
  const data = await loadRevenue();

  if (data.records.length === 0) {
    return "수익 기록이 없습니다.";
  }

  // Group by month
  const byMonth: Record<string, number> = {};
  for (const r of data.records) {
    const month = r.date.substring(0, 7);
    byMonth[month] = (byMonth[month] || 0) + r.amount;
  }

  const sortedMonths = Object.keys(byMonth).sort().slice(-months);
  const lines: string[] = ["월별 수익:"];
  for (const month of sortedMonths) {
    const amount = byMonth[month];
    const target = data.monthlyTarget;
    const mark = target > 0 && amount >= target ? " ✓" : "";
    lines.push(`- ${month}: ₩${amount.toLocaleString()}${mark}`);
  }

  const total = sortedMonths.reduce((sum, m) => sum + byMonth[m], 0);
  lines.push(`\n총 ${sortedMonths.length}개월: ₩${total.toLocaleString()}`);

  return lines.join("\n");
}

// --- Cost tracking functions ---

export async function addCost(amount: number, category: string, description?: string): Promise<string> {
  const data = await loadRevenue();
  const now = new Date();
  const date = now.toISOString().split("T")[0];

  data.costs.push({ date, amount, category, description });
  await saveRevenue(data);

  // Calculate current month totals
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthRevenue = data.records
    .filter((r) => r.date.startsWith(currentMonth))
    .reduce((sum, r) => sum + r.amount, 0);
  const monthCost = data.costs
    .filter((c) => c.date.startsWith(currentMonth))
    .reduce((sum, c) => sum + c.amount, 0);
  const netIncome = monthRevenue - monthCost;

  let msg = `₩${amount.toLocaleString()}(${category}) 비용 추가됨.`;
  if (data.monthlyTarget > 0) {
    const percent = Math.round((netIncome / data.monthlyTarget) * 100);
    msg += ` 순수입: ₩${netIncome.toLocaleString()} (${percent}%)`;
  }

  return msg;
}

export async function getCostStatus(): Promise<string> {
  const data = await loadRevenue();

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthCosts = data.costs.filter((c) => c.date.startsWith(currentMonth));
  const currentCost = monthCosts.reduce((sum, c) => sum + c.amount, 0);

  // Group by category
  const byCategory: Record<string, number> = {};
  for (const c of monthCosts) {
    byCategory[c.category] = (byCategory[c.category] || 0) + c.amount;
  }

  const lines: string[] = ["이번 달 비용:"];
  lines.push(`총 비용: ₩${currentCost.toLocaleString()}`);

  if (Object.keys(byCategory).length > 0) {
    for (const [cat, amount] of Object.entries(byCategory)) {
      lines.push(`- ${cat}: ₩${amount.toLocaleString()}`);
    }
  }

  return lines.join("\n");
}

export async function getCostHistory(months: number = 6): Promise<string> {
  const data = await loadRevenue();

  if (data.costs.length === 0) {
    return "비용 기록이 없습니다.";
  }

  // Group by month
  const byMonth: Record<string, number> = {};
  for (const c of data.costs) {
    const month = c.date.substring(0, 7);
    byMonth[month] = (byMonth[month] || 0) + c.amount;
  }

  const sortedMonths = Object.keys(byMonth).sort().slice(-months);
  const lines: string[] = ["월별 비용:"];
  for (const month of sortedMonths) {
    const amount = byMonth[month];
    lines.push(`- ${month}: ₩${amount.toLocaleString()}`);
  }

  const total = sortedMonths.reduce((sum, m) => sum + byMonth[m], 0);
  lines.push(`\n총 ${sortedMonths.length}개월: ₩${total.toLocaleString()}`);

  return lines.join("\n");
}

export async function getProfitSummary(months: number = 6): Promise<string> {
  const data = await loadRevenue();

  const byMonth: Record<string, { revenue: number; cost: number }> = {};
  for (const r of data.records) {
    const month = r.date.substring(0, 7);
    if (!byMonth[month]) byMonth[month] = { revenue: 0, cost: 0 };
    byMonth[month].revenue += r.amount;
  }
  for (const c of data.costs) {
    const month = c.date.substring(0, 7);
    if (!byMonth[month]) byMonth[month] = { revenue: 0, cost: 0 };
    byMonth[month].cost += c.amount;
  }

  const sortedMonths = Object.keys(byMonth).sort().slice(-months);
  const lines: string[] = ["월별 손익:"];
  for (const month of sortedMonths) {
    const { revenue, cost } = byMonth[month];
    const profit = revenue - cost;
    const mark = profit >= 0 ? "+" : "";
    const emoji = profit >= 0 ? "↑" : "↓";
    lines.push(`${month}: ${emoji} ₩${mark}${profit.toLocaleString()} (수익 ₩${revenue.toLocaleString()} - 비용 ₩${cost.toLocaleString()})`);
  }

  const totalRevenue = sortedMonths.reduce((sum, m) => sum + byMonth[m].revenue, 0);
  const totalCost = sortedMonths.reduce((sum, m) => sum + byMonth[m].cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const profitMark = totalProfit >= 0 ? "+" : "";
  lines.push(`\n총 ${sortedMonths.length}개월:`);
  lines.push(`수익: ₩${totalRevenue.toLocaleString()} | 비용: ₩${totalCost.toLocaleString()}`);
  lines.push(`순수입: ₩${profitMark}${totalProfit.toLocaleString()}`);

  return lines.join("\n");
}
