import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
const REVENUE_FILE = join(DATA_DIR, "revenue.json");

export interface RevenueRecord {
  date: string; // YYYY-MM-DD
  amount: number;
  source: string;
}

export interface RevenueData {
  monthlyTarget: number;
  records: RevenueRecord[];
}

async function loadRevenue(): Promise<RevenueData> {
  try {
    const raw = await readFile(REVENUE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { monthlyTarget: 0, records: [] };
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
  const currentRevenue = monthRecords.reduce((sum, r) => sum + r.amount, 0);

  const lines: string[] = [];

  if (data.monthlyTarget > 0) {
    const percent = Math.round((currentRevenue / data.monthlyTarget) * 100);
    const bar = "█".repeat(Math.min(percent, 50)) + "░".repeat(50 - Math.min(percent, 50));
    lines.push(`월 목표: ₩${data.monthlyTarget.toLocaleString()}`);
    lines.push(`현재: ₩${currentRevenue.toLocaleString()} (${percent}%)`);
    lines.push(`${bar.slice(0, 25)}`);

    if (currentRevenue >= data.monthlyTarget) {
      lines.push("\n🎉 월 목표 달성!");
    } else {
      const remaining = data.monthlyTarget - currentRevenue;
      lines.push(`\n남은 금액: ₩${remaining.toLocaleString()}`);
    }
  } else {
    lines.push("월 목표가 설정되지 않았습니다.");
    lines.push(`현재까지 수익: ₩${currentRevenue.toLocaleString()}`);
  }

  // recent records (last 5)
  if (data.records.length > 0) {
    lines.push("\n최근 기록:");
    const recent = data.records.slice(-5).reverse();
    for (const r of recent) {
      lines.push(`- ${r.date}: ₩${r.amount.toLocaleString()} (${r.source})`);
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
