import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { processTags, type MemoryStore } from "@namukeu/agent-core";

const DATA_DIR = process.env.DATA_DIR || join(import.meta.dir, "..", "data");
const MEMORY_FILE = join(DATA_DIR, "memory.json");

export async function loadMemory(): Promise<MemoryStore> {
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
 * Parse memory tags from Claude's response (REMEMBER, GOAL, DONE).
 * Task tags (TASK, CHAIN, CANCEL_TASK) are now handled by content-pipeline's heartbeat,
 * so we pass no taskStore here — they'll be stripped but not processed.
 */
export async function processMemoryTags(response: string): Promise<string> {
  const store = await loadMemory();
  // No taskStore — task tags are processed by content-pipeline
  const result = processTags(response, store, undefined, undefined);

  if (result.memoryChanged) {
    await saveMemory(store);
  }

  return result.cleanText;
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
