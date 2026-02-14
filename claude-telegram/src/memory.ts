import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
const MEMORY_FILE = join(DATA_DIR, "memory.json");

interface MemoryFact {
  id: string;
  content: string;
  createdAt: string;
}

interface MemoryGoal {
  id: string;
  content: string;
  deadline: string | null;
  status: "active" | "completed";
  createdAt: string;
  completedAt: string | null;
}

interface MemoryStore {
  facts: MemoryFact[];
  goals: MemoryGoal[];
}

async function loadMemory(): Promise<MemoryStore> {
  try {
    const raw = await readFile(MEMORY_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { facts: [], goals: [] };
  }
}

async function saveMemory(store: MemoryStore): Promise<void> {
  await writeFile(MEMORY_FILE, JSON.stringify(store, null, 2));
}

/**
 * Parse REMEMBER/GOAL/DONE tags from Claude's response,
 * store them in local JSON, and return the cleaned response.
 */
export async function processMemoryTags(response: string): Promise<string> {
  const store = await loadMemory();
  let clean = response;
  let changed = false;

  // [REMEMBER: fact to store]
  for (const match of response.matchAll(/\[REMEMBER:\s*(.+?)\]/gi)) {
    store.facts.push({
      id: crypto.randomUUID(),
      content: match[1].trim(),
      createdAt: new Date().toISOString(),
    });
    clean = clean.replace(match[0], "");
    changed = true;
  }

  // [GOAL: text] or [GOAL: text | DEADLINE: date]
  for (const match of response.matchAll(
    /\[GOAL:\s*(.+?)(?:\s*\|\s*DEADLINE:\s*(.+?))?\]/gi
  )) {
    store.goals.push({
      id: crypto.randomUUID(),
      content: match[1].trim(),
      deadline: match[2]?.trim() || null,
      status: "active",
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
    clean = clean.replace(match[0], "");
    changed = true;
  }

  // [DONE: search text for completed goal]
  for (const match of response.matchAll(/\[DONE:\s*(.+?)\]/gi)) {
    const searchText = match[1].trim().toLowerCase();
    const goal = store.goals.find(
      (g) =>
        g.status === "active" && g.content.toLowerCase().includes(searchText)
    );
    if (goal) {
      goal.status = "completed";
      goal.completedAt = new Date().toISOString();
    }
    clean = clean.replace(match[0], "");
    changed = true;
  }

  if (changed) {
    await saveMemory(store);
  }

  return clean.trim();
}

/**
 * Build a text block of facts and active goals for system prompt injection.
 */
export async function getMemoryContext(): Promise<string> {
  const store = await loadMemory();
  const parts: string[] = [];

  if (store.facts.length > 0) {
    parts.push("REMEMBERED FACTS:");
    for (const fact of store.facts) {
      parts.push(`- ${fact.content}`);
    }
  }

  const activeGoals = store.goals.filter((g) => g.status === "active");
  if (activeGoals.length > 0) {
    parts.push("\nACTIVE GOALS:");
    for (const goal of activeGoals) {
      const deadline = goal.deadline ? ` (by ${goal.deadline})` : "";
      parts.push(`- ${goal.content}${deadline}`);
    }
  }

  return parts.join("\n");
}

export async function getMemorySummary(): Promise<string> {
  const store = await loadMemory();
  const active = store.goals.filter((g) => g.status === "active").length;
  const completed = store.goals.filter((g) => g.status === "completed").length;
  return `${store.facts.length} facts, ${active} active goals, ${completed} completed goals`;
}

export async function clearMemory(): Promise<void> {
  await saveMemory({ facts: [], goals: [] });
}

export async function getMemoryDetail(): Promise<string> {
  const store = await loadMemory();

  if (store.facts.length === 0 && store.goals.length === 0) {
    return "No memories stored yet.";
  }

  return getMemoryContext();
}
