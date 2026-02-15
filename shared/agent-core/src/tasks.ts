import { Database } from "bun:sqlite";
import { getNextCronTime } from "./cron";
import type { AgentTask, ProjectCode, TaskStatus, TaskType } from "./types";

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS agent_tasks (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('one-time', 'recurring', 'event')),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending', 'running', 'completed', 'failed', 'paused')),
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    project TEXT NOT NULL DEFAULT 'GENERAL',
    schedule_cron TEXT,
    schedule_next TEXT,
    event_trigger TEXT,
    last_run_at TEXT,
    last_result TEXT,
    run_count INTEGER DEFAULT 0,
    max_runs INTEGER,
    notify_user INTEGER DEFAULT 1,
    requires_approval INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const CREATE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_tasks_next
  ON agent_tasks(schedule_next)
  WHERE status IN ('pending', 'running')
`;

export class TaskStore {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.db.run(CREATE_TABLE_SQL);
    this.db.run(CREATE_INDEX_SQL);
  }

  createTask(params: {
    title: string;
    prompt: string;
    type: TaskType;
    project?: ProjectCode;
    scheduleCron?: string;
    scheduleAt?: string;
    eventTrigger?: string;
    notifyUser?: boolean;
    requiresApproval?: boolean;
    maxRuns?: number;
  }): AgentTask {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    let scheduleNext: string | null = null;
    if (params.scheduleCron) {
      scheduleNext = getNextCronTime(params.scheduleCron).toISOString();
    } else if (params.scheduleAt) {
      scheduleNext = new Date(params.scheduleAt).toISOString();
    }

    const task: AgentTask = {
      id,
      type: params.type,
      status: "pending",
      title: params.title,
      prompt: params.prompt,
      project: params.project || "GENERAL",
      schedule_cron: params.scheduleCron || null,
      schedule_next: scheduleNext,
      event_trigger: params.eventTrigger || null,
      last_run_at: null,
      last_result: null,
      run_count: 0,
      max_runs: params.maxRuns ?? (params.type === "one-time" ? 1 : null),
      notify_user: params.notifyUser ?? true,
      requires_approval: params.requiresApproval ?? false,
      created_at: now,
      updated_at: now,
    };

    this.db.run(
      `INSERT INTO agent_tasks (id, type, status, title, prompt, project, schedule_cron, schedule_next,
        event_trigger, last_run_at, last_result, run_count, max_runs, notify_user,
        requires_approval, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id, task.type, task.status, task.title, task.prompt, task.project,
        task.schedule_cron, task.schedule_next, task.event_trigger,
        task.last_run_at, task.last_result, task.run_count, task.max_runs,
        task.notify_user ? 1 : 0, task.requires_approval ? 1 : 0,
        task.created_at, task.updated_at,
      ]
    );

    return task;
  }

  getDueTasks(now: Date = new Date()): AgentTask[] {
    const rows = this.db
      .query(
        `SELECT * FROM agent_tasks
         WHERE status = 'pending'
         AND schedule_next IS NOT NULL
         AND schedule_next <= ?
         ORDER BY schedule_next ASC`
      )
      .all(now.toISOString()) as any[];

    return rows.map(rowToTask);
  }

  getEventTasks(eventName: string): AgentTask[] {
    const rows = this.db
      .query(
        `SELECT * FROM agent_tasks
         WHERE status = 'pending'
         AND type = 'event'
         AND event_trigger = ?`
      )
      .all(eventName) as any[];

    return rows.map(rowToTask);
  }

  getAll(): AgentTask[] {
    const rows = this.db
      .query(`SELECT * FROM agent_tasks ORDER BY created_at DESC`)
      .all() as any[];

    return rows.map(rowToTask);
  }

  getActive(): AgentTask[] {
    const rows = this.db
      .query(
        `SELECT * FROM agent_tasks
         WHERE status IN ('pending', 'running')
         ORDER BY schedule_next ASC`
      )
      .all() as any[];

    return rows.map(rowToTask);
  }

  getById(id: string): AgentTask | null {
    const row = this.db
      .query(`SELECT * FROM agent_tasks WHERE id = ?`)
      .get(id) as any;

    return row ? rowToTask(row) : null;
  }

  updateStatus(id: string, status: TaskStatus): void {
    this.db.run(
      `UPDATE agent_tasks SET status = ?, updated_at = ? WHERE id = ?`,
      [status, new Date().toISOString(), id]
    );
  }

  completeRun(id: string, result: string, costUsd?: number): void {
    const task = this.getById(id);
    if (!task) return;

    const now = new Date();
    const newRunCount = task.run_count + 1;

    // Determine next status
    let nextStatus: TaskStatus;
    let nextSchedule: string | null = null;

    if (task.max_runs && newRunCount >= task.max_runs) {
      nextStatus = "completed";
    } else if (task.type === "recurring" && task.schedule_cron) {
      nextStatus = "pending";
      nextSchedule = getNextCronTime(task.schedule_cron, now).toISOString();
    } else if (task.type === "event") {
      nextStatus = "pending"; // Re-arm for next event
    } else {
      nextStatus = "completed";
    }

    this.db.run(
      `UPDATE agent_tasks SET
        status = ?, run_count = ?, last_run_at = ?,
        last_result = ?, schedule_next = ?, updated_at = ?
       WHERE id = ?`,
      [
        nextStatus, newRunCount, now.toISOString(),
        result.slice(0, 2000), nextSchedule, now.toISOString(), id,
      ]
    );
  }

  cancelTask(id: string): boolean {
    const task = this.getById(id);
    if (!task || task.status === "completed") return false;

    this.db.run(
      `UPDATE agent_tasks SET status = 'completed', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    return true;
  }

  pauseTask(id: string): void {
    this.updateStatus(id, "paused");
  }

  resumeTask(id: string): void {
    this.updateStatus(id, "pending");
  }

  deleteTask(id: string): void {
    this.db.run(`DELETE FROM agent_tasks WHERE id = ?`, [id]);
  }

  /** Search tasks by title */
  findByTitle(search: string): AgentTask | null {
    const row = this.db
      .query(
        `SELECT * FROM agent_tasks
         WHERE title LIKE ? AND status IN ('pending', 'running', 'paused')
         LIMIT 1`
      )
      .get(`%${search}%`) as any;

    return row ? rowToTask(row) : null;
  }
}

function rowToTask(row: any): AgentTask {
  return {
    ...row,
    notify_user: !!row.notify_user,
    requires_approval: !!row.requires_approval,
  };
}
