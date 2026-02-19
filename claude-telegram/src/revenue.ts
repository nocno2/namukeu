import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
const REVENUE_FILE = join(DATA_DIR, "revenue.json");

const COIN_API_URL = process.env.COIN_API_URL || "http://localhost:8001";
const BLOG_API_URL = process.env.BLOG_API_URL || "http://localhost:3100";

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

export async function getRevenueBySource(months: number = 12): Promise<string> {
  const data = await loadRevenue();

  if (data.records.length === 0) {
    return "수익 기록이 없습니다.";
  }

  // Get recent months data
  const now = new Date();
  const recentMonths: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    recentMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // Group by source (all time)
  const bySourceAllTime: Record<string, number> = {};
  for (const r of data.records) {
    bySourceAllTime[r.source] = (bySourceAllTime[r.source] || 0) + r.amount;
  }

  // Group by source (recent months)
  const bySourceRecent: Record<string, number> = {};
  for (const r of data.records) {
    const month = r.date.substring(0, 7);
    if (recentMonths.includes(month)) {
      bySourceRecent[r.source] = (bySourceRecent[r.source] || 0) + r.amount;
    }
  }

  const lines: string[] = ["📊 수익 원별 분석:"];

  // Recent months breakdown
  const recentTotal = Object.values(bySourceRecent).reduce((a, b) => a + b, 0);
  lines.push(`\n최근 ${months}개월 (총 ₩${recentTotal.toLocaleString()}):`);

  if (Object.keys(bySourceRecent).length > 0) {
    const sorted = Object.entries(bySourceRecent)
      .sort((a, b) => b[1] - a[1]);

    for (const [source, amount] of sorted) {
      const percent = recentTotal > 0 ? Math.round((amount / recentTotal) * 100) : 0;
      const bar = "▓".repeat(Math.min(percent / 5, 20));
      lines.push(`- ${source}: ₩${amount.toLocaleString()} (${percent}%) ${bar}`);
    }
  } else {
    lines.push("  데이터 없음");
  }

  // All time breakdown
  const allTimeTotal = Object.values(bySourceAllTime).reduce((a, b) => a + b, 0);
  lines.push(`\n전체 기간 (총 ₩${allTimeTotal.toLocaleString()}):`);

  const sortedAll = Object.entries(bySourceAllTime)
    .sort((a, b) => b[1] - a[1]);

  for (const [source, amount] of sortedAll) {
    const percent = allTimeTotal > 0 ? Math.round((amount / allTimeTotal) * 100) : 0;
    const bar = "▓".repeat(Math.min(percent / 5, 20));
    lines.push(`- ${source}: ₩${amount.toLocaleString()} (${percent}%) ${bar}`);
  }

  // Top source highlight
  if (sortedAll.length > 0) {
    const topSource = sortedAll[0][0];
    lines.push(`\n🏆 최대 수익 원: ${topSource} (₩${sortedAll[0][1].toLocaleString()})`);
  }

  return lines.join("\n");
}

// Helper: calculate moving average
function calculateMovingAverage(values: number[], days: number): number {
  if (values.length === 0) return 0;
  const recent = values.slice(-days);
  if (recent.length === 0) return 0;
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

// Get daily averages for revenue and cost
// For moving averages, we use ALL records (not just current month) to get better trend
function getDailyAverages(monthRecords: RevenueRecord[], monthCosts: CostRecord[], allRecords: RevenueRecord[], allCosts: CostRecord[], today: number) {
  const currentRevenue = monthRecords.reduce((sum, r) => sum + r.amount, 0);
  const currentCost = monthCosts.reduce((sum, c) => sum + c.amount, 0);

  // Simple daily average (based on current month only)
  const simpleDailyRevenue = today > 0 ? currentRevenue / today : 0;
  const simpleDailyCost = today > 0 ? currentCost / today : 0;

  // Moving averages (based on ALL records to capture trend)
  const dailyRevenueValues = allRecords.map((r) => r.amount);
  const dailyCostValues = allCosts.map((c) => c.amount);

  const ma7Revenue = calculateMovingAverage(dailyRevenueValues, 7);
  const ma7Cost = calculateMovingAverage(dailyCostValues, 7);
  const ma14Revenue = calculateMovingAverage(dailyRevenueValues, 14);
  const ma14Cost = calculateMovingAverage(dailyCostValues, 14);

  return {
    currentRevenue,
    currentCost,
    simpleDailyRevenue,
    simpleDailyCost,
    ma7Revenue,
    ma7Cost,
    ma14Revenue,
    ma14Cost,
  };
}

// Enhanced forecast with confidence intervals
export async function getRevenueForecast(): Promise<string> {
  const data = await loadRevenue();

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Get this month's data
  const monthRecords = data.records.filter((r) => r.date.startsWith(currentMonth));
  const monthCosts = data.costs.filter((c) => c.date.startsWith(currentMonth));

  if (monthRecords.length === 0 && monthCosts.length === 0) {
    return "이번 달 데이터가 없습니다. 예측을 할 수 없습니다.";
  }

  const today = now.getDate(); // 1~31
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDays = daysInMonth - today;
  const weekOfMonth = Math.ceil(today / 7);

  // Use the helper function for all calculations
  const {
    currentRevenue,
    currentCost,
    simpleDailyRevenue,
    simpleDailyCost,
    ma7Revenue,
    ma7Cost,
    ma14Revenue,
    ma14Cost,
  } = getDailyAverages(monthRecords, monthCosts, data.records, data.costs, today);

  // Projections for each method
  const projSimple = {
    revenue: Math.round(simpleDailyRevenue * daysInMonth),
    cost: Math.round(simpleDailyCost * daysInMonth),
    profit: Math.round(simpleDailyRevenue * daysInMonth) - Math.round(simpleDailyCost * daysInMonth),
  };
  const proj7d = {
    revenue: Math.round(ma7Revenue * daysInMonth),
    cost: Math.round(ma7Cost * daysInMonth),
    profit: Math.round(ma7Revenue * daysInMonth) - Math.round(ma7Cost * daysInMonth),
  };
  const proj14d = {
    revenue: Math.round(ma14Revenue * daysInMonth),
    cost: Math.round(ma14Cost * daysInMonth),
    profit: Math.round(ma14Revenue * daysInMonth) - Math.round(ma14Cost * daysInMonth),
  };

  // Calculate confidence interval (standard deviation based)
  const allDailyRevenue = [...data.records.map((r) => r.amount), ...Array(monthRecords.length).fill(0)];
  const revenueStdDev = allDailyRevenue.length > 1
    ? Math.sqrt(allDailyRevenue.reduce((sum, v) => sum + Math.pow(v - (allDailyRevenue.reduce((a, b) => a + b, 0) / allDailyRevenue.length), 2), 0) / allDailyRevenue.length)
    : 0;

  const optimisticProj = {
    revenue: proj7d.revenue + Math.round(revenueStdDev * remainingDays * 0.5),
    cost: proj7d.cost - Math.round(revenueStdDev * remainingDays * 0.2),
    profit: 0,
  };
  optimisticProj.profit = optimisticProj.revenue - optimisticProj.cost;

  const pessimisticProj = {
    revenue: Math.max(0, proj7d.revenue - Math.round(revenueStdDev * remainingDays * 0.5)),
    cost: proj7d.cost + Math.round(revenueStdDev * remainingDays * 0.3),
    profit: 0,
  };
  pessimisticProj.profit = pessimisticProj.revenue - pessimisticProj.cost;

  // Week-over-week growth calculation
  const week1Records = monthRecords.filter((r) => {
    const day = parseInt(r.date.split("-")[2], 10);
    return day >= 1 && day <= 7;
  });
  const week2Records = monthRecords.filter((r) => {
    const day = parseInt(r.date.split("-")[2], 10);
    return day >= 8 && day <= 14;
  });
  const week3Records = monthRecords.filter((r) => {
    const day = parseInt(r.date.split("-")[2], 10);
    return day >= 15 && day <= 21;
  });

  const week1Revenue = week1Records.reduce((sum, r) => sum + r.amount, 0);
  const week2Revenue = week2Records.reduce((sum, r) => sum + r.amount, 0);
  const week3Revenue = week3Records.reduce((sum, r) => sum + r.amount, 0);

  const w1w2Growth = week1Revenue > 0 ? ((week2Revenue - week1Revenue) / week1Revenue) * 100 : 0;
  const w2w3Growth = week2Revenue > 0 ? ((week3Revenue - week2Revenue) / week2Revenue) * 100 : 0;
  const avgWeeklyGrowth = (w1w2Growth + w2w3Growth) / 2;

  // Trend projection using growth rate
  const growthProj = {
    revenue: Math.round(week3Revenue * (1 + avgWeeklyGrowth / 100) * (4 - weekOfMonth + 1)),
    cost: Math.round(simpleDailyCost * daysInMonth),
    profit: 0,
  };
  growthProj.profit = growthProj.revenue - growthProj.cost;

  const lines: string[] = ["📊 월말 예측 (향상된 분석):"];

  lines.push(`\n📅 현재 (${today}/${daysInMonth}일, ${weekOfMonth}주차):`);
  lines.push(`- 수익: ₩${currentRevenue.toLocaleString()}`);
  lines.push(`- 비용: ₩${currentCost.toLocaleString()}`);
  lines.push(`- 순수입: ₩${(currentRevenue - currentCost).toLocaleString()}`);

  // Best prediction selection
  const hasEnoughData = monthRecords.length >= 7;
  const bestProj = hasEnoughData ? proj7d : projSimple;
  const bestMethod = hasEnoughData ? "7일 이동평균" : "단순 평균";

  lines.push(`\n🎯 ${bestMethod} 기반 예측:`);
  lines.push(`  수익: ₩${bestProj.revenue.toLocaleString()}`);
  lines.push(`  비용: ₩${bestProj.cost.toLocaleString()}`);
  const profitMark = bestProj.profit >= 0 ? "+" : "";
  lines.push(`  순수입: ₩${profitMark}${bestProj.profit.toLocaleString()}`);

  // Confidence interval
  if (revenueStdDev > 0) {
    lines.push(`\n📊 신뢰구간 (₩${Math.round(revenueStdDev).toLocaleString()} 일일 표준편차):`);
    const optMark = optimisticProj.profit >= 0 ? "+" : "";
    const pesMark = pessimisticProj.profit >= 0 ? "+" : "";
    lines.push(`  낙관: ₩${optMark}${optimisticProj.profit.toLocaleString()}`);
    lines.push(`  중심: ₩${profitMark}${bestProj.profit.toLocaleString()}`);
    lines.push(`  비관: ₩${pesMark}${pessimisticProj.profit.toLocaleString()}`);
  }

  // Week-over-week analysis
  if (week1Revenue > 0 || week2Revenue > 0 || week3Revenue > 0) {
    lines.push(`\n📈 주간 추세:`);
    lines.push(`  1주: ₩${week1Revenue.toLocaleString()}`);
    if (week2Revenue > 0) {
      const w1w2Icon = w1w2Growth >= 0 ? "↑" : "↓";
      lines.push(`  2주: ₩${week2Revenue.toLocaleString()} (${w1w2Icon}${Math.abs(Math.round(w1w2Growth))}%)`);
    }
    if (week3Revenue > 0) {
      const w2w3Icon = w2w3Growth >= 0 ? "↑" : "↓";
      lines.push(`  3주: ₩${week3Revenue.toLocaleString()} (${w2w3Icon}${Math.abs(Math.round(w2w3Growth))}%)`);
    }
    if (!isNaN(avgWeeklyGrowth)) {
      const growthIcon = avgWeeklyGrowth >= 0 ? "📈 상승" : "📉 하락";
      lines.push(`  평균 성장률: ${growthIcon} (${Math.round(avgWeeklyGrowth)}%)`);
    }
  }

  if (data.monthlyTarget > 0) {
    const currentPercent = Math.round(((currentRevenue - currentCost) / data.monthlyTarget) * 100);
    const projectedPercent = Math.round((bestProj.profit / data.monthlyTarget) * 100);

    lines.push(`\n🎯 월 목표 (₩${data.monthlyTarget.toLocaleString()}):`);
    lines.push(`  현재: ${currentPercent}%`);
    lines.push(`  예측: ${projectedPercent}%`);

    // Confidence-based goal probability
    if (revenueStdDev > 0 && optimisticProj.profit >= data.monthlyTarget && pessimisticProj.profit < data.monthlyTarget) {
      lines.push(`  달성 확률: 🔶 불확실 (추이 관찰 필요)`);
    } else if (optimisticProj.profit >= data.monthlyTarget) {
      lines.push(`  달성 확률: 🟢 높음`);
    } else if (bestProj.profit >= data.monthlyTarget) {
      lines.push(`  달성 확률: 🟡 보통`);
    } else {
      lines.push(`  달성 확률: 🔴 낮음`);
    }

    if (bestProj.profit >= data.monthlyTarget) {
      lines.push("\n✨ 예측 달성 가능!");
    } else {
      const needed = data.monthlyTarget - bestProj.profit;
      const avgNeeded = remainingDays > 0 ? Math.ceil(needed / remainingDays) : 0;
      lines.push(`\n💡 남은 ${remainingDays}일에 하루 ₩${avgNeeded.toLocaleString()}씩 필요`);
    }
  }

  return lines.join("\n");
}

// --- Auto fetch functions ---

export async function fetchCoinRevenue(): Promise<{ success: boolean; amount?: number; error?: string }> {
  try {
    // Fetch portfolio summary from COIN server
    const response = await fetch(`${COIN_API_URL}/portfolio/summary`, {
      headers: {
        "Authorization": `Bearer ${process.env.INTERNAL_API_KEY || "dev-secret"}`,
        "X-Internal-Key": process.env.INTERNAL_API_KEY || "dev-secret",
      },
    });

    if (!response.ok) {
      return { success: false, error: `COIN API 오류: ${response.status}` };
    }

    const data = await response.json();
    // portfolio summary returns total_equity
    const totalEquity = data.total_equity || 0;

    return { success: true, amount: Math.round(totalEquity) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("[revenue] COIN fetch error:", msg);
    return { success: false, error: msg };
  }
}

export async function fetchBlogRevenue(): Promise<{ success: boolean; amount?: number; error?: string }> {
  try {
    // Fetch manual revenue from BLOG server
    const response = await fetch(`${BLOG_API_URL}/api/admin/revenue`);

    if (!response.ok) {
      return { success: false, error: `BLOG API 오류: ${response.status}` };
    }

    const data = await response.json();
    const records = data.records || [];

    // Get this month's total
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthRecords = records.filter((r: { date: string }) => r.date.startsWith(currentMonth));
    const total = monthRecords.reduce((sum: number, r: { amount: number }) => sum + r.amount, 0);

    return { success: true, amount: total };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("[revenue] BLOG fetch error:", msg);
    return { success: false, error: msg };
  }
}

// Fetch all revenue sources and add to records
export async function syncAllRevenue(): Promise<string> {
  const results: string[] = [];
  const now = new Date();
  const date = now.toISOString().split("T")[0];

  // Fetch COIN revenue
  const coinResult = await fetchCoinRevenue();
  if (coinResult.success && coinResult.amount !== undefined) {
    const data = await loadRevenue();

    // Check if already synced today (avoid duplicate)
    const alreadySynced = data.records.some(
      (r) => r.date === date && r.source === "COIN"
    );

    if (!alreadySynced && coinResult.amount > 0) {
      data.records.push({
        date,
        amount: coinResult.amount,
        source: "COIN",
      });
      await saveRevenue(data);
      results.push(`COIN: ₩${coinResult.amount.toLocaleString()} 추가됨`);
    } else if (alreadySynced) {
      results.push(`COIN: 이미 동기화됨 (₩${coinResult.amount.toLocaleString()})`);
    } else {
      results.push(`COIN: ₩0 (자산 부족)`);
    }
  } else {
    results.push(`COIN: 실패 - ${coinResult.error}`);
  }

  // Fetch BLOG revenue (AdSense)
  const blogResult = await fetchBlogRevenue();
  if (blogResult.success && blogResult.amount !== undefined) {
    const data = await loadRevenue();

    // Check if already synced today
    const alreadySynced = data.records.some(
      (r) => r.date === date && r.source === "BLOG"
    );

    if (!alreadySynced && blogResult.amount > 0) {
      data.records.push({
        date,
        amount: blogResult.amount,
        source: "BLOG",
      });
      await saveRevenue(data);
      results.push(`BLOG: ₩${blogResult.amount.toLocaleString()} 추가됨`);
    } else if (alreadySynced) {
      results.push(`BLOG: 이미 동기화됨 (₩${blogResult.amount.toLocaleString()})`);
    } else {
      results.push(`BLOG: ₩0 (수익 없음)`);
    }
  } else {
    results.push(`BLOG: 실패 - ${blogResult.error}`);
  }

  return results.join("\n");
}

// Get current status from all sources (without saving)
export async function getRevenueStatusAll(): Promise<string> {
  const lines: string[] = ["📊 수익 현황:"];

  // COIN
  const coinResult = await fetchCoinRevenue();
  if (coinResult.success) {
    lines.push(`- COIN: ₩${(coinResult.amount || 0).toLocaleString()}`);
  } else {
    lines.push(`- COIN: 오류 (${coinResult.error})`);
  }

  // BLOG
  const blogResult = await fetchBlogRevenue();
  if (blogResult.success) {
    lines.push(`- BLOG: ₩${(blogResult.amount || 0).toLocaleString()}`);
  } else {
    lines.push(`- BLOG: 오류 (${blogResult.error})`);
  }

  // Total
  if (coinResult.success && blogResult.success) {
    const total = (coinResult.amount || 0) + (blogResult.amount || 0);
    lines.push(`\n📈 총계: ₩${total.toLocaleString()}`);
  }

  return lines.join("\n");
}

// Check for goal alerts - returns alert message if action needed
export interface GoalAlert {
  needsAttention: boolean;
  message: string;
}

export async function checkGoalAlerts(): Promise<GoalAlert> {
  const data = await loadRevenue();

  if (data.monthlyTarget <= 0) {
    return { needsAttention: false, message: "" };
  }

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthRecords = data.records.filter((r) => r.date.startsWith(currentMonth));
  const monthCosts = data.costs.filter((c) => c.date.startsWith(currentMonth));

  const currentRevenue = monthRecords.reduce((sum, r) => sum + r.amount, 0);
  const currentCost = monthCosts.reduce((sum, c) => sum + c.amount, 0);
  const netIncome = currentRevenue - currentCost;

  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDays = daysInMonth - today;

  // Calculate moving average for projection
  const dailyRevenueValues = data.records.map((r) => r.amount);
  const ma7Revenue = calculateMovingAverage(dailyRevenueValues, 7);
  const projectedRevenue = Math.round(ma7Revenue * daysInMonth);
  const projectedProfit = projectedRevenue - currentCost;

  const lines: string[] = [];
  const target = data.monthlyTarget;

  // Calculate required daily average
  const needed = target - netIncome;
  const dailyNeeded = remainingDays > 0 ? Math.ceil(needed / remainingDays) : needed;

  // Check various alert conditions
  if (projectedProfit < target * 0.5) {
    // Critical: less than 50% of target projected
    lines.push("🚨 경고: 월 목표의 50% 미만 달성 예상");
    lines.push(`  현재: ₩${netIncome.toLocaleString()} (${Math.round((netIncome / target) * 100)}%)`);
    lines.push(`  예측: ₩${projectedProfit.toLocaleString()} (${Math.round((projectedProfit / target) * 100)}%)`);
    lines.push(`  ⚠️ 남은 ${remainingDays}일에 하루 ₩${dailyNeeded.toLocaleString()}씩 필요 (불가능에 가까움)`);
  } else if (projectedProfit < target) {
    // Warning: target not projected to be met
    lines.push("⚠️ 주의: 월 목표 미달성 예상");
    lines.push(`  현재: ₩${netIncome.toLocaleString()} (${Math.round((netIncome / target) * 100)}%)`);
    lines.push(`  예측: ₩${projectedProfit.toLocaleString()} (${Math.round((projectedProfit / target) * 100)}%)`);
    lines.push(`  💡 남은 ${remainingDays}일에 하루 ₩${dailyNeeded.toLocaleString()}씩 필요`);
  } else if (netIncome >= target) {
    // Goal achieved!
    lines.push("🎉 월 목표 달성!");
    lines.push(`  현재: ₩${netIncome.toLocaleString()} (${Math.round((netIncome / target) * 100)}%)`);
  } else {
    // On track
    lines.push("✅ 계획대로 진행 중");
    lines.push(`  현재: ₩${netIncome.toLocaleString()} (${Math.round((netIncome / target) * 100)}%)`);
    lines.push(`  예측: ₩${projectedProfit.toLocaleString()} (${Math.round((projectedProfit / target) * 100)}%)`);
  }

  return {
    needsAttention: projectedProfit < target && netIncome < target,
    message: lines.join("\n"),
  };
}

// --- Auto Reporting ---

export interface DailyReport {
  date: string;
  summary: string;
  needsAttention: boolean;
  alertMessage?: string;
  forecast: string;
  goalStatus: string;
}

export async function generateDailyReport(): Promise<DailyReport> {
  const data = await loadRevenue();
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const monthRecords = data.records.filter((r) => r.date.startsWith(currentMonth));
  const monthCosts = data.costs.filter((c) => c.date.startsWith(currentMonth));
  const currentRevenue = monthRecords.reduce((sum, r) => sum + r.amount, 0);
  const currentCost = monthCosts.reduce((sum, c) => sum + c.amount, 0);
  const netIncome = currentRevenue - currentCost;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = now.getDate();
  const remainingDays = daysInMonth - today;

  // Get forecast
  const forecast = await getRevenueForecast();

  // Check goal alerts
  const goalAlert = await checkGoalAlerts();

  // Build summary
  const lines: string[] = [];
  lines.push(`📊 ${currentMonth} 수익 보고 (${today}/${daysInMonth})`);
  lines.push(`─`.repeat(25));

  if (data.monthlyTarget > 0) {
    const percent = Math.round((netIncome / data.monthlyTarget) * 100);
    lines.push(`순수입: ₩${netIncome.toLocaleString()} / ₩${data.monthlyTarget.toLocaleString()} (${percent}%)`);

    // Progress bar
    const barLength = 10;
    const filled = Math.min(Math.round((percent / 100) * barLength), barLength);
    const bar = "▓".repeat(filled) + "░".repeat(barLength - filled);
    lines.push(`[${bar}]`);

    if (netIncome >= data.monthlyTarget) {
      lines.push(`🎉 월 목표 달성!`);
    } else {
      const remaining = data.monthlyTarget - netIncome;
      const dailyNeeded = remainingDays > 0 ? Math.ceil(remaining / remainingDays) : remaining;
      lines.push(`남은 ${remainingDays}일에 하루 ₩${dailyNeeded.toLocaleString()} 필요`);
    }
  } else {
    lines.push(`순수입: ₩${netIncome.toLocaleString()}`);
    lines.push(`(월 목표 미설정)`);
  }

  // Source breakdown for today
  const todayRecords = data.records.filter((r) => r.date === date);
  if (todayRecords.length > 0) {
    lines.push(`\n오늘 추가:`);
    for (const r of todayRecords) {
      lines.push(`+ ₩${r.amount.toLocaleString()} (${r.source})`);
    }
  }

  return {
    date,
    summary: lines.join("\n"),
    needsAttention: goalAlert.needsAttention,
    alertMessage: goalAlert.message,
    forecast,
    goalStatus: goalAlert.message,
  };
}

// Format report for Telegram
export async function getFormattedDailyReport(): Promise<string> {
  const report = await generateDailyReport();

  const lines: string[] = [report.summary];

  if (report.needsAttention && report.alertMessage) {
    lines.push(`\n⚠️${report.alertMessage.split("\n").join("\n⚠️ ")}`);
  }

  return lines.join("\n");
}
