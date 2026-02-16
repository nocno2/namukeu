import { useCallback, useEffect, useState } from "react";
import { api, type AgentGoal } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

const PROJECTS = ["COIN", "BLOG", "DASH", "TRAIN", "TGBOT", "DCBOT"];
const PRIORITY_ICON: Record<string, string> = { high: "\u2605", medium: "\u25CF", low: "\u25CB" };
const PRIORITY_COLOR: Record<string, string> = { high: "text-warning", medium: "text-primary", low: "text-text-muted" };

export function ProjectGoals({ collapsed, pinned, onToggleCollapse, onTogglePin }: Props) {
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [error, setError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", projects: [] as string[], priority: "medium", deadline: "" });

  const fetchGoals = useCallback(async () => {
    try {
      const data = await api.agentGoals();
      setGoals(Array.isArray(data) ? data : []);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
    const interval = setInterval(fetchGoals, 30_000);
    return () => clearInterval(interval);
  }, [fetchGoals]);

  const createGoal = async () => {
    if (!form.title || form.projects.length === 0) return;
    try {
      await api.agentCreateGoal({
        title: form.title,
        description: form.description || form.title,
        projects: form.projects,
        priority: form.priority,
        deadline: form.deadline || undefined,
      });
      setForm({ title: "", description: "", projects: [], priority: "medium", deadline: "" });
      setShowForm(false);
      fetchGoals();
    } catch { /* ignore */ }
  };

  const deleteGoal = async (id: string) => {
    try {
      await api.agentDeleteGoal(id);
      fetchGoals();
    } catch { /* ignore */ }
  };

  const completeGoal = async (id: string) => {
    try {
      await api.agentUpdateGoal(id, { status: "completed" } as any);
      fetchGoals();
    } catch { /* ignore */ }
  };

  const approveGoal = async (id: string) => {
    try {
      await api.agentApproveGoal(id);
      fetchGoals();
    } catch { /* ignore */ }
  };

  const toggleProject = (p: string) => {
    setForm((f) => ({
      ...f,
      projects: f.projects.includes(p) ? f.projects.filter((x) => x !== p) : [...f.projects, p],
    }));
  };

  // Separate proposed and active goals
  const proposedGoals = goals.filter((g) => g.status === "proposed");
  const activeGoals = goals.filter((g) => g.status === "active");
  const grouped: Record<string, AgentGoal[]> = {};
  for (const g of activeGoals) {
    for (const p of g.projects) {
      if (!grouped[p]) grouped[p] = [];
      if (!grouped[p].find((x) => x.id === g.id)) grouped[p].push(g);
    }
  }

  const borderClass = pinned ? "border-primary/40" : "border-border";

  if (collapsed) {
    return (
      <div className={`bg-surface border ${borderClass} rounded-xl p-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Goals</span>
          <span className="text-xs text-text-muted">
            {activeGoals.length} active{proposedGoals.length > 0 && <span className="text-warning"> · {proposedGoals.length} proposed</span>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onTogglePin} className="text-text-muted hover:text-text text-xs cursor-pointer">{pinned ? "\u{1F4CC}" : "\u{1F4CD}"}</button>
          <button onClick={onToggleCollapse} className="text-text-muted hover:text-text text-xs cursor-pointer">+</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-surface border ${borderClass} rounded-xl p-5`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">Project Goals</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs text-primary hover:text-primary/80 cursor-pointer"
          >
            {showForm ? "Cancel" : "+ Add"}
          </button>
          <button onClick={onTogglePin} className="text-text-muted hover:text-text text-xs cursor-pointer">{pinned ? "\u{1F4CC}" : "\u{1F4CD}"}</button>
          <button onClick={onToggleCollapse} className="text-text-muted hover:text-text text-xs cursor-pointer">{"\u2212"}</button>
        </div>
      </div>

      {showForm && (
        <div className="bg-bg border border-border rounded-lg p-3 mb-4 space-y-2">
          <input
            className="w-full bg-surface border border-border rounded px-2 py-1 text-sm focus:border-primary outline-none"
            placeholder="Goal title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            className="w-full bg-surface border border-border rounded px-2 py-1 text-sm focus:border-primary outline-none"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex flex-wrap gap-1">
            {PROJECTS.map((p) => (
              <button
                key={p}
                onClick={() => toggleProject(p)}
                className={`text-xs px-2 py-0.5 rounded border cursor-pointer ${
                  form.projects.includes(p) ? "bg-primary/20 border-primary text-primary" : "border-border text-text-muted"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <select
              className="bg-surface border border-border rounded px-2 py-1 text-sm"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <input
              type="date"
              className="bg-surface border border-border rounded px-2 py-1 text-sm flex-1 focus:border-primary outline-none"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
            <button
              onClick={createGoal}
              className="text-xs bg-primary hover:bg-primary/80 text-white rounded px-3 py-1 cursor-pointer"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p className="text-sm text-danger">Agent API unavailable</p>
      ) : (
        <div className="space-y-3">
          {proposedGoals.length > 0 && (
            <div>
              <div className="text-xs font-medium text-warning mb-1.5">Proposed by Evolution</div>
              <div className="space-y-1.5">
                {proposedGoals.map((g) => (
                  <div key={g.id} className="bg-warning/5 border border-warning/20 rounded-lg px-3 py-2">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`${PRIORITY_COLOR[g.priority]} text-xs`}>{PRIORITY_ICON[g.priority]}</span>
                          <span className="text-sm font-medium">{g.title}</span>
                          <span className="text-[10px] text-text-muted">{g.projects.join(", ")}</span>
                        </div>
                        {g.description && g.description !== g.title && (
                          <div className="text-xs text-text-muted mt-1">{g.description}</div>
                        )}
                      </div>
                      <div className="flex gap-1.5 ml-2 shrink-0">
                        <button onClick={() => approveGoal(g.id)} className="text-[10px] bg-success/20 text-success hover:bg-success/30 rounded px-2 py-0.5 cursor-pointer">Approve</button>
                        <button onClick={() => deleteGoal(g.id)} className="text-[10px] bg-danger/20 text-danger hover:bg-danger/30 rounded px-2 py-0.5 cursor-pointer">Reject</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeGoals.length === 0 && proposedGoals.length === 0 ? (
            <p className="text-sm text-text-muted">No active goals</p>
          ) : (
            Object.entries(grouped).sort().map(([project, projectGoals]) => (
              <div key={project}>
                <div className="text-xs font-medium text-text-muted mb-1">{project}</div>
                <div className="space-y-1.5">
                  {projectGoals.map((g) => (
                    <div key={`${project}-${g.id}`} className="bg-bg/50 border border-border rounded-lg px-3 py-2 group">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-1.5 min-w-0">
                          <span className={`${PRIORITY_COLOR[g.priority]} text-xs mt-0.5`}>{PRIORITY_ICON[g.priority]}</span>
                          <div className="min-w-0">
                            <div className="text-sm truncate">{g.title}</div>
                            {g.projects.length > 1 && (
                              <div className="text-[10px] text-text-muted">shared: {g.projects.join(", ")}</div>
                            )}
                            {g.progress && <div className="text-xs text-text-muted mt-0.5">{g.progress}</div>}
                            {g.deadline && <div className="text-[10px] text-text-muted">by {g.deadline}</div>}
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => completeGoal(g.id)} className="text-[10px] text-success hover:text-success/80 cursor-pointer">Done</button>
                          <button onClick={() => deleteGoal(g.id)} className="text-[10px] text-danger hover:text-danger/80 cursor-pointer">Del</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
