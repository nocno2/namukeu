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

// --- Revenue Insights Generator ---

export interface RevenueInsight {
  category: "growth" | "cost" | "opportunity" | "warning";
  title: string;
  description: string;
  action?: string;
  actionType?: InsightActionType;
}

export type InsightActionType =
  | "sync"           // Sync revenue data
  | "target"         // Set/adjust monthly target
  | "diversify"      // Add new revenue source
  | "cost_optimize"  // Review costs
  | "write_blog"     // Trigger blog automation
  | "review_coin"    // Review COIN strategy
  | "none";          // No action available

export async function getRevenueInsights(): Promise<RevenueInsight[]> {
  const data = await loadRevenue();
  const insights: RevenueInsight[] = [];

  if (data.records.length < 3) {
    return [{
      category: "opportunity",
      title: "데이터 부족",
      description: "더 정확한 인사이트를 위해 최소 3건 이상의 수익 기록이 필요합니다.",
    }];
  }

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;
  const twoMonthsAgo = `${now.getFullYear()}-${String(now.getMonth() - 1).padStart(2, "0")}`;

  // Get monthly totals
  const monthTotals: Record<string, number> = {};
  for (const r of data.records) {
    const month = r.date.substring(0, 7);
    monthTotals[month] = (monthTotals[month] || 0) + r.amount;
  }

  // Get cost monthly totals
  const costMonthTotals: Record<string, number> = {};
  for (const c of data.costs) {
    const month = c.date.substring(0, 7);
    costMonthTotals[month] = (costMonthTotals[month] || 0) + c.amount;
  }

  // Growth analysis
  const months = Object.keys(monthTotals).sort();
  if (months.length >= 2) {
    const current = monthTotals[currentMonth] || 0;
    const previous = monthTotals[lastMonth] || 0;
    const growth = previous > 0 ? ((current - previous) / previous) * 100 : 0;

    if (growth > 20) {
      insights.push({
        category: "growth",
        title: "🚀 급성장",
        description: `이번 달 수익이 지난달 대비 ${Math.round(growth)}% 증가했습니다.`,
        action: "성장 요인을 분석하고 유지 전략을 수립하세요.",
        actionType: "review_coin",
      });
    } else if (growth < -20) {
      insights.push({
        category: "warning",
        title: "⚠️ 수익 감소",
        description: `이번 달 수익이 지난달 대비 ${Math.round(Math.abs(growth))}% 감소했습니다.`,
        action: "원인을 분석하고 회복 전략이 필요합니다.",
        actionType: "review_coin",
      });
    }
  }

  // Cost analysis
  const currentCosts = costMonthTotals[currentMonth] || 0;
  const currentRevenue = monthTotals[currentMonth] || 0;
  if (currentRevenue > 0) {
    const costRatio = (currentCosts / currentRevenue) * 100;
    if (costRatio > 50) {
      insights.push({
        category: "cost",
        title: "💰 높은 비용 비율",
        description: `비용이 수익의 ${Math.round(costRatio)}%를 차지합니다. (목표: 30% 이하)`,
        action: "비용 최적화 기회를 검토하세요.",
        actionType: "cost_optimize",
      });
    } else if (costRatio < 20) {
      insights.push({
        category: "growth",
        title: "✅ 건강한 비용 구조",
        description: `비용이 수익의 ${Math.round(costRatio)}%로 효율적입니다.`,
      });
    }
  }

  // Revenue source diversity
  const sourceTotals: Record<string, number> = {};
  for (const r of data.records) {
    sourceTotals[r.source] = (sourceTotals[r.source] || 0) + r.amount;
  }
  const sources = Object.keys(sourceTotals);
  if (sources.length === 1) {
    insights.push({
      category: "opportunity",
      title: "🎯 수익원 다각화 필요",
      description: `현재 ${sources[0]}에만 의존하고 있습니다. 수익원을 다양화하면 리스크를 줄일 수 있습니다.`,
      action: "새로운 수익 채널을探索해보세요.",
      actionType: "diversify",
    });
  } else if (sources.length >= 3) {
    const topSource = Object.entries(sourceTotals).sort((a, b) => b[1] - a[1])[0];
    const topRatio = (topSource[1] / Object.values(sourceTotals).reduce((a, b) => a + b, 0)) * 100;
    if (topRatio > 70) {
      insights.push({
        category: "opportunity",
        title: "📊 주요 수익원 집중",
        description: `${topSource[0]}가 전체 수익의 ${Math.round(topRatio)}%를 차지합니다.`,
        action: "비중을 줄이고 다른 수익원을 강화해보세요.",
        actionType: "diversify",
      });
    }
  }

  // Monthly target progress
  if (data.monthlyTarget > 0 && monthTotals[currentMonth]) {
    const progress = (monthTotals[currentMonth] / data.monthlyTarget) * 100;
    if (progress < 50 && now.getDate() > 15) {
      insights.push({
        category: "warning",
        title: "🚨 목표 이탈 위험",
        description: `이번 달 목표 달성률이 ${Math.round(progress)}%입니다.`,
        action: "남은 기간 동안 일일 수익 목표를 달성해야 합니다.",
        actionType: "sync",
      });
    } else if (progress >= 100) {
      insights.push({
        category: "growth",
        title: "🎉 목표 달성",
        description: `이번 달 목표를 달성했습니다!`,
        action: "다음 달 목표를 상향 조정해보세요.",
        actionType: "target",
      });
    }
  }

  // Seasonal pattern (simple)
  if (months.length >= 6) {
    const recentMonths = months.slice(-3);
    const olderMonths = months.slice(-6, -3);
    const recentAvg = recentMonths.reduce((sum, m) => sum + (monthTotals[m] || 0), 0) / 3;
    const olderAvg = olderMonths.reduce((sum, m) => sum + (monthTotals[m] || 0), 0) / 3;
    if (olderAvg > 0) {
      const trend = ((recentAvg - olderAvg) / olderAvg) * 100;
      if (trend > 30) {
        insights.push({
          category: "growth",
          title: "📈 장기 성장 추세",
          description: "최근 3개월이 이전 3개월 대비 증가 추세입니다.",
        });
      } else if (trend < -30) {
        insights.push({
          category: "warning",
          title: "📉 장기 하락 추세",
          description: "최근 3개월이 이전 3개월 대비 감소 추세입니다.",
          action: " strategis한 재검토가 필요합니다.",
        });
      }
    }
  }

  return insights;
}

// Format insights for Telegram
export async function getFormattedInsights(): Promise<string> {
  const insights = await getRevenueInsights();

  if (insights.length === 0) {
    return "분석할 데이터가 부족합니다.";
  }

  const lines: string[] = ["💡 수익 인사이트:"];

  for (const insight of insights) {
    const icon = insight.category === "growth" ? "🟢" :
                 insight.category === "warning" ? "🔴" :
                 insight.category === "cost" ? "🟡" : "🔵";
    lines.push(`\n${icon} ${insight.title}`);
    lines.push(`   ${insight.description}`);
    if (insight.action) {
      lines.push(`   → ${insight.action}`);
    }
  }

  return lines.join("\n");
}

// Get insights with action info (for inline buttons)
export async function getInsightsWithActions(): Promise<RevenueInsight[]> {
  return getRevenueInsights();
}

// --- Auto Action System ---

export interface RevenueAutoAction {
  id: string;
  type: "alert" | "sync" | "adjust";
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  triggered: boolean;
  createdAt: string;
}

const AUTO_ACTION_FILE = join(DATA_DIR, "auto_actions.json");

async function loadAutoActions(): Promise<RevenueAutoAction[]> {
  try {
    const raw = await readFile(AUTO_ACTION_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveAutoActions(actions: RevenueAutoAction[]): Promise<void> {
  await writeFile(AUTO_ACTION_FILE, JSON.stringify(actions, null, 2));
}

export async function getAutoActions(): Promise<RevenueAutoAction[]> {
  return loadAutoActions();
}

export async function clearAutoActions(): Promise<void> {
  await saveAutoActions([]);
}

// Generate automatic actions based on insights
export async function generateAutoActions(): Promise<RevenueAutoAction[]> {
  const data = await loadRevenue();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDays = daysInMonth - today;

  // Load existing actions to merge (not replace)
  const existingActions = await loadAutoActions();
  const newActions: RevenueAutoAction[] = [];
  const existingIds = new Set(existingActions.map(a => a.id));

  // Get current month data
  const monthRecords = data.records.filter((r) => r.date.startsWith(currentMonth));
  const monthCosts = data.costs.filter((c) => c.date.startsWith(currentMonth));
  const currentRevenue = monthRecords.reduce((sum, r) => sum + r.amount, 0);
  const currentCost = monthCosts.reduce((sum, c) => sum + c.amount, 0);
  const netIncome = currentRevenue - currentCost;

  // Action 1: Check if goal is achievable
  if (data.monthlyTarget > 0 && netIncome < data.monthlyTarget) {
    const needed = data.monthlyTarget - netIncome;
    const dailyNeeded = remainingDays > 0 ? Math.ceil(needed / remainingDays) : needed;

    // Critical if daily needed is more than 10x average daily revenue
    const avgDailyRevenue = currentRevenue / Math.max(today, 1);
    const priority = dailyNeeded > avgDailyRevenue * 10 ? "critical" :
                     dailyNeeded > avgDailyRevenue * 5 ? "high" : "medium";

    const action: RevenueAutoAction = {
      id: `goal_${currentMonth}`,
      type: "alert",
      priority,
      title: "목표 달성 어려움",
      description: `남은 ${remainingDays}일에 하루 ₩${dailyNeeded.toLocaleString()} 필요 (평균 ₩${Math.round(avgDailyRevenue).toLocaleString()}/일)`,
      triggered: false,
      createdAt: now.toISOString(),
    };
    if (!existingIds.has(action.id)) {
      newActions.push(action);
    }
  }

  // Action 2: Check cost ratio
  if (currentRevenue > 0) {
    const costRatio = (currentCost / currentRevenue) * 100;
    if (costRatio > 50) {
      const action: RevenueAutoAction = {
        id: `cost_${currentMonth}`,
        type: "alert",
        priority: costRatio > 70 ? "high" : "medium",
        title: "비용 비율 과다",
        description: `비용이 수익의 ${Math.round(costRatio)}% (목표: 30% 이하)`,
        triggered: false,
        createdAt: now.toISOString(),
      };
      if (!existingIds.has(action.id)) {
        newActions.push(action);
      }
    }
  }

  // Action 3: Check revenue diversity
  const sourceTotals: Record<string, number> = {};
  for (const r of data.records) {
    sourceTotals[r.source] = (sourceTotals[r.source] || 0) + r.amount;
  }
  if (Object.keys(sourceTotals).length === 1) {
    const action: RevenueAutoAction = {
      id: `diversity_${currentMonth}`,
      type: "adjust",
      priority: "low",
      title: "수익원 다각화 필요",
      description: `${Object.keys(sourceTotals)[0]}에만 의존 중. 새 수익원 추가를検討하세요.`,
      triggered: false,
      createdAt: now.toISOString(),
    };
    if (!existingIds.has(action.id)) {
      newActions.push(action);
    }
  }

  // Action 4: Check for duplicate sync (prevent missed syncs)
  const recentRecords = data.records.filter((r) => {
    const recordDate = new Date(r.date);
    const diffDays = Math.floor((now.getTime() - recordDate.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 3;
  });
  const hasRecentSync = recentRecords.some((r) => r.source === "COIN" || r.source === "BLOG");
  if (!hasRecentSync) {
    const action: RevenueAutoAction = {
      id: `sync_${currentMonth}`,
      type: "sync",
      priority: "medium",
      title: "수익 동기화 필요",
      description: "최근 3일内有功可圖 수익 데이터 없음. /revenue sync 실행 권장",
      triggered: false,
      createdAt: now.toISOString(),
    };
    if (!existingIds.has(action.id)) {
      newActions.push(action);
    }
  }

  // Action 5: Monthly target achieved
  if (data.monthlyTarget > 0 && netIncome >= data.monthlyTarget) {
    const action: RevenueAutoAction = {
      id: `achieved_${currentMonth}`,
      type: "alert",
      priority: "low",
      title: "월 목표 달성!",
      description: `₩${netIncome.toLocaleString()} 달성 (${Math.round((netIncome / data.monthlyTarget) * 100)}%)`,
      triggered: false,
      createdAt: now.toISOString(),
    };
    if (!existingIds.has(action.id)) {
      newActions.push(action);
    }
  }

  // Merge new actions with existing (keep triggered status of existing)
  const mergedActions = [...existingActions, ...newActions];

  // Save merged actions (not replace)
  await saveAutoActions(mergedActions);

  // Return only new actions (for notification)
  return newActions;
}

// Format auto actions for Telegram
export async function getFormattedAutoActions(): Promise<string> {
  // Load all existing actions (not generate new ones)
  const actions = await loadAutoActions();

  if (actions.length === 0) {
    return "실행할 자동 조치가 없습니다.";
  }

  // Sort by priority (critical > high > medium > low)
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const lines: string[] = ["⚡ 자동 조치:"];
  for (const action of actions) {
    const icon = action.priority === "critical" ? "🚨" :
                 action.priority === "high" ? "⚠️" :
                 action.priority === "medium" ? "🔔" : "ℹ️";
    const check = action.triggered ? "✅" : "⬜";
    lines.push(`${check} ${icon} [${action.priority.toUpperCase()}] ${action.title}`);
    lines.push(`   ${action.description}`);
  }

  lines.push("\n💡 `/actions_ack`로 조치 확인 가능");

  return lines.join("\n");
}

// Acknowledge an action (mark as triggered)
export async function acknowledgeAction(actionId: string): Promise<boolean> {
  const actions = await loadAutoActions();
  const action = actions.find(a => a.id === actionId);

  if (!action) {
    return false;
  }

  action.triggered = true;
  await saveAutoActions(actions);
  return true;
}

// Acknowledge all actions
export async function acknowledgeAllActions(): Promise<number> {
  const actions = await loadAutoActions();
  const count = actions.filter(a => !a.triggered).length;

  for (const action of actions) {
    action.triggered = true;
  }

  await saveAutoActions(actions);
  return count;
}

// Get new (untriggered) actions count
export async function getNewActionsCount(): Promise<number> {
  const actions = await loadAutoActions();
  return actions.filter(a => !a.triggered).length;
}

// --- Revenue Source Performance Analysis ---

export interface SourcePerformance {
  source: string;
  totalAmount: number;
  recordCount: number;
  averagePerRecord: number;
  firstRecord: string;
  lastRecord: string;
  daysActive: number;
  monthlyAverages: Record<string, number>;
  trend: "up" | "down" | "stable";
  trendPercentage: number;
}

export async function getSourcePerformance(months: number = 6): Promise<SourcePerformance[]> {
  const data = await loadRevenue();

  if (data.records.length === 0) {
    return [];
  }

  // Group records by source
  const bySource: Record<string, { records: RevenueRecord[]; total: number }> = {};
  for (const r of data.records) {
    if (!bySource[r.source]) {
      bySource[r.source] = { records: [], total: 0 };
    }
    bySource[r.source].records.push(r);
    bySource[r.source].total += r.amount;
  }

  // Get recent months
  const now = new Date();
  const recentMonths: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    recentMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const performances: SourcePerformance[] = [];

  for (const [source, info] of Object.entries(bySource)) {
    const records = info.records;

    // Sort by date
    records.sort((a, b) => a.date.localeCompare(b.date));

    // Get first and last record dates
    const firstRecord = records[0].date;
    const lastRecord = records[records.length - 1].date;

    // Calculate days active
    const firstDate = new Date(firstRecord);
    const lastDate = new Date(lastRecord);
    const daysActive = Math.max(1, Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    // Calculate monthly averages
    const monthlyAverages: Record<string, number> = {};
    const sourceMonthlyTotals: Record<string, number> = {};

    for (const r of records) {
      const month = r.date.substring(0, 7);
      if (recentMonths.includes(month)) {
        sourceMonthlyTotals[month] = (sourceMonthlyTotals[month] || 0) + r.amount;
      }
    }

    // Calculate average for recent months
    const recentMonthsWithData = Object.keys(sourceMonthlyTotals);
    if (recentMonthsWithData.length > 0) {
      const totalRecent = Object.values(sourceMonthlyTotals).reduce((a, b) => a + b, 0);
      const avgRecent = totalRecent / recentMonthsWithData.length;

      for (const month of recentMonthsWithData) {
        monthlyAverages[month] = sourceMonthlyTotals[month];
      }
    }

    // Calculate trend (compare recent 2 months vs previous 2 months)
    let trend: "up" | "down" | "stable" = "stable";
    let trendPercentage = 0;

    const sortedMonths = Object.keys(monthlyAverages).sort();
    if (sortedMonths.length >= 4) {
      const recent2 = sortedMonths.slice(-2);
      const previous2 = sortedMonths.slice(-4, -2);

      const recentAvg = recent2.reduce((sum, m) => sum + (monthlyAverages[m] || 0), 0) / 2;
      const previousAvg = previous2.reduce((sum, m) => sum + (monthlyAverages[m] || 0), 0) / 2;

      if (previousAvg > 0) {
        trendPercentage = ((recentAvg - previousAvg) / previousAvg) * 100;
        if (trendPercentage > 15) {
          trend = "up";
        } else if (trendPercentage < -15) {
          trend = "down";
        } else {
          trend = "stable";
        }
      }
    }

    performances.push({
      source,
      totalAmount: info.total,
      recordCount: records.length,
      averagePerRecord: info.total / records.length,
      firstRecord,
      lastRecord,
      daysActive,
      monthlyAverages,
      trend,
      trendPercentage,
    });
  }

  // Sort by total amount descending
  performances.sort((a, b) => b.totalAmount - a.totalAmount);

  return performances;
}

// Format source performance for Telegram
export async function getFormattedSourcePerformance(months: number = 6): Promise<string> {
  const performances = await getSourcePerformance(months);

  if (performances.length === 0) {
    return "수익 기록이 없습니다.";
  }

  const lines: string[] = ["📊 수익원별 성과 분석:"];

  for (const perf of performances) {
    const trendIcon = perf.trend === "up" ? "📈" : perf.trend === "down" ? "📉" : "➡️";
    const trendText = perf.trend === "up"
      ? `+${Math.round(perf.trendPercentage)}%`
      : perf.trend === "down"
        ? `${Math.round(perf.trendPercentage)}%`
        : "변화 없음";

    lines.push(`\n🏷️ ${perf.source}`);
    lines.push(`   총 수익: ₩${perf.totalAmount.toLocaleString()}`);
    lines.push(`   평균: ₩${Math.round(perf.averagePerRecord).toLocaleString()}/회`);
    lines.push(`   기록 수: ${perf.recordCount}회`);
    lines.push(`   활동 기간: ${perf.daysActive}일`);
    lines.push(`   추세: ${trendIcon} ${trendText}`);

    // Show recent months if available
    const recentMonths = Object.keys(perf.monthlyAverages).sort().slice(-3);
    if (recentMonths.length > 0) {
      lines.push(`   최근:`);
      for (const month of recentMonths) {
        const amount = perf.monthlyAverages[month];
        lines.push(`     ${month}: ₩${amount.toLocaleString()}`);
      }
    }
  }

  // Summary
  const totalRevenue = performances.reduce((sum, p) => sum + p.totalAmount, 0);
  const topSource = performances[0];
  lines.push(`\n📌 요약:`);
  lines.push(`   전체 수익: ₩${totalRevenue.toLocaleString()}`);
  lines.push(`   최고 수익원: ${topSource.source} (₩${topSource.totalAmount.toLocaleString()})`);

  // Recommendations
  if (performances.length > 1) {
    const downSources = performances.filter(p => p.trend === "down");
    if (downSources.length > 0) {
      lines.push(`\n⚠️ 주의:`);
      for (const s of downSources) {
        lines.push(`   - ${s.source}: 하락 추세 (${Math.round(s.trendPercentage)}%)`);
      }
    }
  }

  return lines.join("\n");
}

// --- Auto Sync Scheduler ---

// Start automatic revenue sync scheduler
// Runs daily at specified hour (default: 8 AM KST)
export function startAutoSyncScheduler(
  onSyncComplete?: (result: string) => void,
  hour: number = 8
): void {
  const sync = async () => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const data = await loadRevenue();

    // Check if already synced today
    const alreadySynced = data.records.some(
      (r) => r.date === today && (r.source === "COIN" || r.source === "BLOG")
    );

    if (alreadySynced) {
      console.log(`[auto-sync] Already synced today, skipping`);
      return;
    }

    console.log(`[auto-sync] Starting daily revenue sync...`);
    try {
      const result = await syncAllRevenue();
      console.log(`[auto-sync] Result: ${result.replace(/\n/g, " | ")}`);
      if (onSyncComplete) {
        onSyncComplete(result);
      }
    } catch (err) {
      console.error("[auto-sync] Error:", err);
    }
  };

  // Initial sync (with delay)
  setTimeout(sync, 10000); // Run 10 seconds after start

  // Check every hour
  setInterval(sync, 60 * 60 * 1000);

  // Also trigger at the specific hour
  const scheduleAtHour = () => {
    const now = new Date();
    const targetHour = hour; // KST hour (9 = 9 AM KST = UTC+9, so we use hour directly)

    if (now.getHours() === targetHour) {
      sync();
    }
  };

  // Check every minute during the target hour
  setInterval(scheduleAtHour, 60 * 1000);

  console.log(`[auto-sync] Scheduler started (target: ${hour}:00 KST)`);
}
