import type { TaskStore } from "./tasks";
import { isValidCron } from "./cron";

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

export interface MemoryStore {
  facts: MemoryFact[];
  goals: MemoryGoal[];
}

export interface TagProcessResult {
  cleanText: string;
  memoryChanged: boolean;
  tasksCreated: string[];
  tasksCancelled: string[];
}

/**
 * Process all tags from Claude's response:
 * - [REMEMBER: ...], [GOAL: ...], [DONE: ...]
 * - [TASK: title | CRON: expr | PROMPT: text]
 * - [TASK: title | AT: datetime | PROMPT: text]
 * - [CANCEL_TASK: search text]
 * - [PROGRESS: ...]
 */
export function processTags(
  response: string,
  memory: MemoryStore,
  taskStore?: TaskStore
): TagProcessResult {
  let clean = response;
  let memoryChanged = false;
  const tasksCreated: string[] = [];
  const tasksCancelled: string[] = [];

  // [REMEMBER: fact to store]
  for (const match of response.matchAll(/\[REMEMBER:\s*(.+?)\]/gi)) {
    memory.facts.push({
      id: crypto.randomUUID(),
      content: match[1].trim(),
      createdAt: new Date().toISOString(),
    });
    clean = clean.replace(match[0], "");
    memoryChanged = true;
  }

  // [GOAL: text] or [GOAL: text | DEADLINE: date]
  for (const match of response.matchAll(
    /\[GOAL:\s*(.+?)(?:\s*\|\s*DEADLINE:\s*(.+?))?\]/gi
  )) {
    memory.goals.push({
      id: crypto.randomUUID(),
      content: match[1].trim(),
      deadline: match[2]?.trim() || null,
      status: "active",
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
    clean = clean.replace(match[0], "");
    memoryChanged = true;
  }

  // [DONE: search text for completed goal]
  for (const match of response.matchAll(/\[DONE:\s*(.+?)\]/gi)) {
    const searchText = match[1].trim().toLowerCase();
    const goal = memory.goals.find(
      (g) => g.status === "active" && g.content.toLowerCase().includes(searchText)
    );
    if (goal) {
      goal.status = "completed";
      goal.completedAt = new Date().toISOString();
    }
    clean = clean.replace(match[0], "");
    memoryChanged = true;
  }

  // [TASK: title | CRON: expr | PROMPT: text]
  for (const match of response.matchAll(
    /\[TASK:\s*(.+?)\s*\|\s*CRON:\s*(.+?)\s*\|\s*PROMPT:\s*(.+?)\]/gi
  )) {
    if (taskStore && isValidCron(match[2].trim())) {
      const task = taskStore.createTask({
        title: match[1].trim(),
        prompt: match[3].trim(),
        type: "recurring",
        scheduleCron: match[2].trim(),
      });
      tasksCreated.push(task.title);
    }
    clean = clean.replace(match[0], "");
  }

  // [TASK: title | AT: datetime | PROMPT: text]
  for (const match of response.matchAll(
    /\[TASK:\s*(.+?)\s*\|\s*AT:\s*(.+?)\s*\|\s*PROMPT:\s*(.+?)\]/gi
  )) {
    if (taskStore) {
      const task = taskStore.createTask({
        title: match[1].trim(),
        prompt: match[3].trim(),
        type: "one-time",
        scheduleAt: match[2].trim(),
      });
      tasksCreated.push(task.title);
    }
    clean = clean.replace(match[0], "");
  }

  // [CANCEL_TASK: search text]
  for (const match of response.matchAll(/\[CANCEL_TASK:\s*(.+?)\]/gi)) {
    if (taskStore) {
      const task = taskStore.findByTitle(match[1].trim());
      if (task && taskStore.cancelTask(task.id)) {
        tasksCancelled.push(task.title);
      }
    }
    clean = clean.replace(match[0], "");
  }

  // Strip [PROGRESS: ...] tags (already sent as real-time updates)
  clean = clean.replace(/\[PROGRESS:\s*.+?\]/gi, "");

  return {
    cleanText: clean.trim(),
    memoryChanged,
    tasksCreated,
    tasksCancelled,
  };
}
