import { Database } from "bun:sqlite";
import type { Goal, ProjectCode } from "./types";

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS agent_goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  projects TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','completed','paused')),
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
  deadline TEXT,
  progress TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

export class GoalStore {
  private db: Database;
  constructor(db: Database) {
    this.db = db;
    this.db.run(CREATE_TABLE);
  }

  createGoal(params: { title: string; description: string; projects: ProjectCode[]; priority?: "high"|"medium"|"low"; deadline?: string }): Goal {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const goal: Goal = {
      id, title: params.title, description: params.description,
      projects: params.projects, status: "active",
      priority: params.priority || "medium",
      deadline: params.deadline || null, progress: null,
      created_at: now, updated_at: now,
    };
    this.db.run(
      `INSERT INTO agent_goals (id,title,description,projects,status,priority,deadline,progress,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [goal.id, goal.title, goal.description, JSON.stringify(goal.projects), goal.status, goal.priority, goal.deadline, goal.progress, goal.created_at, goal.updated_at]
    );
    return goal;
  }

  getAll(): Goal[] {
    return (this.db.query("SELECT * FROM agent_goals ORDER BY created_at DESC").all() as any[]).map(rowToGoal);
  }

  getActive(): Goal[] {
    return (this.db.query("SELECT * FROM agent_goals WHERE status = 'active' ORDER BY priority ASC, created_at DESC").all() as any[]).map(rowToGoal);
  }

  getByProject(project: ProjectCode): Goal[] {
    // projects is a JSON array, use LIKE to find goals that include this project
    return (this.db.query("SELECT * FROM agent_goals WHERE status = 'active' AND projects LIKE ? ORDER BY priority ASC").all(`%"${project}"%`) as any[]).map(rowToGoal);
  }

  getById(id: string): Goal | null {
    const row = this.db.query("SELECT * FROM agent_goals WHERE id = ?").get(id) as any;
    return row ? rowToGoal(row) : null;
  }

  updateGoal(id: string, updates: Partial<Pick<Goal, "title"|"description"|"projects"|"priority"|"deadline"|"progress"|"status">>): Goal | null {
    const goal = this.getById(id);
    if (!goal) return null;
    const now = new Date().toISOString();
    if (updates.title !== undefined) goal.title = updates.title;
    if (updates.description !== undefined) goal.description = updates.description;
    if (updates.projects !== undefined) goal.projects = updates.projects;
    if (updates.priority !== undefined) goal.priority = updates.priority;
    if (updates.deadline !== undefined) goal.deadline = updates.deadline;
    if (updates.progress !== undefined) goal.progress = updates.progress;
    if (updates.status !== undefined) goal.status = updates.status;
    goal.updated_at = now;
    this.db.run(
      `UPDATE agent_goals SET title=?,description=?,projects=?,priority=?,deadline=?,progress=?,status=?,updated_at=? WHERE id=?`,
      [goal.title, goal.description, JSON.stringify(goal.projects), goal.priority, goal.deadline, goal.progress, goal.status, goal.updated_at, id]
    );
    return goal;
  }

  deleteGoal(id: string): boolean {
    const result = this.db.run("DELETE FROM agent_goals WHERE id = ?", [id]);
    return result.changes > 0;
  }
}

function rowToGoal(row: any): Goal {
  return {
    ...row,
    projects: JSON.parse(row.projects),
  };
}
