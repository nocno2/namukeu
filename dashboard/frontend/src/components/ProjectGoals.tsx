import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Plus,
  Star,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { api, type AgentGoal } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

const PROJECTS = ["COIN", "BLOG", "DASH", "TRAIN", "TGBOT", "DCBOT"];
const PRIORITY_ICON: Record<string, React.ReactNode> = {
  high: <Star size={10} className="text-warning" />,
  medium: <Circle size={10} className="fill-primary text-primary" />,
  low: <Circle size={10} className="text-text-muted" />,
};

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

  const borderClass = pinned ? "border-primary/50" : "border-border/60";

  if (collapsed) {
    return (
      <div className={`bg-surface border ${borderClass} rounded-2xl p-3 flex items-center justify-between card-glow card-transition`}>
        <div className="flex items-center gap-2">
          <Target size={14} className="text-primary" />
          <span className="text-sm font-medium text-text">Goals</span>
          <span className="text-xs text-text-muted">
            {activeGoals.length} active{proposedGoals.length > 0 && <span className="text-warning"> · {proposedGoals.length} proposed</span>}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onTogglePin}
            className={`p-1.5 rounded-lg transition-colors ${
              pinned ? "text-primary bg-primary/10" : "text-text-muted/40 hover:text-text-muted hover:bg-surface-hover"
            }`}
          >
            {pinned ? <Star size={14} /> : <Circle size={14} />}
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-text-muted/40 hover:text-text-muted hover:bg-surface-hover rounded-lg transition-colors"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-surface border ${borderClass} rounded-2xl p-5 card-glow card-transition`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-primary" />
          <h3 className="font-semibold text-sm text-text">Project Goals</h3>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowForm(!showForm)}
            className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors cursor-pointer"
          >
            {showForm ? <X size={14} /> : <Plus size={14} />}
          </button>
          <button
            onClick={onTogglePin}
            className={`p-1.5 rounded-lg transition-colors ${
              pinned ? "text-primary bg-primary/10" : "text-text-muted/40 hover:text-text-muted hover:bg-surface-hover"
            }`}
          >
            {pinned ? <Star size={14} /> : <Circle size={14} />}
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-text-muted/40 hover:text-text-muted hover:bg-surface-hover rounded-lg transition-colors"
          >
            <ChevronUp size={14} />
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-surface-hover border border-border/50 rounded-xl p-3 mb-4 space-y-2">
          <input
            className="w-full bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none text-text"
            placeholder="Goal title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            className="w-full bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none text-text"
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex flex-wrap gap-1">
            {PROJECTS.map((p) => (
              <button
                key={p}
                onClick={() => toggleProject(p)}
                className={`text-xs px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                  form.projects.includes(p) ? "bg-primary/20 border-primary text-primary" : "border-border/50 text-text-muted hover:bg-surface-hover"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <select
              className="bg-surface border border-border/50 rounded-lg px-2 py-2 text-sm text-text"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <input
              type="date"
              className="bg-surface border border-border/50 rounded-lg px-2 py-2 text-sm flex-1 focus:border-primary outline-none text-text"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
            <button
              onClick={createGoal}
              className="text-xs bg-primary hover:bg-primary/80 text-white rounded-lg px-4 py-2 cursor-pointer font-medium"
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
              <div className="text-xs font-medium text-warning mb-1.5 flex items-center gap-1">
                <Star size={10} />
                Proposed by Evolution
              </div>
              <div className="space-y-1.5">
                {proposedGoals.map((g) => (
                  <div key={g.id} className="bg-warning/5 border border-warning/20 rounded-xl px-3 py-2.5">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {PRIORITY_ICON[g.priority]}
                          <span className="text-sm font-medium text-text">{g.title}</span>
                          <span className="text-[10px] text-text-muted">{g.projects.join(", ")}</span>
                        </div>
                        {g.description && g.description !== g.title && (
                          <div className="text-xs text-text-muted mt-1">{g.description}</div>
                        )}
                      </div>
                      <div className="flex gap-1.5 ml-2 shrink-0">
                        <button onClick={() => approveGoal(g.id)} className="text-[10px] bg-success/20 text-success hover:bg-success/30 rounded-lg px-2 py-1 cursor-pointer">Approve</button>
                        <button onClick={() => deleteGoal(g.id)} className="text-[10px] bg-danger/20 text-danger hover:bg-danger/30 rounded-lg px-2 py-1 cursor-pointer">Reject</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeGoals.length === 0 && proposedGoals.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">No active goals</p>
          ) : (
            Object.entries(grouped).sort().map(([project, projectGoals]) => (
              <div key={project}>
                <div className="text-xs font-medium text-text-muted mb-1.5 flex items-center gap-1">
                  <Target size={10} />
                  {project}
                </div>
                <div className="space-y-1.5">
                  {projectGoals.map((g) => (
                    <div key={`${project}-${g.id}`} className="bg-surface-hover/50 border border-border/50 rounded-xl px-3 py-2.5 group">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-1.5 min-w-0">
                          <span className={`mt-0.5`}>{PRIORITY_ICON[g.priority]}</span>
                          <div className="min-w-0">
                            <div className="text-sm truncate text-text">{g.title}</div>
                            {g.projects.length > 1 && (
                              <div className="text-[10px] text-text-muted">shared: {g.projects.join(", ")}</div>
                            )}
                            {g.progress && <div className="text-xs text-text-muted mt-0.5">{g.progress}</div>}
                            {g.deadline && <div className="text-[10px] text-text-muted">by {g.deadline}</div>}
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => completeGoal(g.id)} className="text-[10px] text-success hover:text-success/80 cursor-pointer">Done</button>
                          <button onClick={() => deleteGoal(g.id)} className="text-[10px] text-danger hover:text-danger/80 cursor-pointer"><Trash2 size={10} /></button>
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
