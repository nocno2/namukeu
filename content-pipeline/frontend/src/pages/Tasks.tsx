import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Task, TaskCreate } from "../lib/api";


const HANDLERS = [
  { value: "pipeline.full", label: "Full Pipeline (keyword → draft → review)" },
  { value: "pipeline.keyword", label: "Keyword Collection Only" },
  { value: "custom", label: "Custom Handler" },
];

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const load = useCallback(() => {
    api.getTasks().then((d) => setTasks(d.tasks)).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const handleToggle = async (task: Task) => {
    await api.updateTask(task.id, { enabled: !task.enabled });
    load();
  };

  const handleRun = async (task: Task) => {
    await api.runTask(task.id);
    load();
  };

  const handleDelete = async (task: Task) => {
    if (!confirm(`Delete "${task.name}"?`)) return;
    await api.deleteTask(task.id);
    load();
  };

  const handleSave = async (data: TaskCreate) => {
    if (editingTask) {
      await api.updateTask(editingTask.id, data);
    } else {
      await api.createTask(data);
    }
    setShowForm(false);
    setEditingTask(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Tasks</h2>
        <button
          onClick={() => { setEditingTask(null); setShowForm(true); }}
          className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          + New Task
        </button>
      </div>

      {/* Task List */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {tasks.length === 0 ? (
          <p className="text-sm text-text-muted p-5">No tasks yet. Create one to get started.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Schedule</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium">{task.name}</span>
                      {task.description && (
                        <p className="text-xs text-text-muted mt-0.5">{task.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{task.task_type}</td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{task.cron_expr || "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(task)}
                      className={`text-xs px-2 py-1 rounded cursor-pointer ${
                        task.enabled
                          ? "bg-success/15 text-success"
                          : "bg-text-muted/15 text-text-muted"
                      }`}
                    >
                      {task.enabled ? "Enabled" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleRun(task)}
                        className="text-xs text-primary hover:text-primary-hover cursor-pointer"
                      >
                        Run
                      </button>
                      <button
                        onClick={() => { setEditingTask(task); setShowForm(true); }}
                        className="text-xs text-text-muted hover:text-text cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(task)}
                        className="text-xs text-danger hover:text-danger/80 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Task Form Modal */}
      {showForm && (
        <TaskFormModal
          task={editingTask}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingTask(null); }}
        />
      )}
    </div>
  );
}

function TaskFormModal({
  task,
  onSave,
  onClose,
}: {
  task: Task | null;
  onSave: (data: TaskCreate) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(task?.name ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [taskType, setTaskType] = useState(task?.task_type ?? "cron");
  const [handler, setHandler] = useState(task?.handler ?? "pipeline.full");
  const [cronExpr, setCronExpr] = useState(task?.cron_expr ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name,
        description: description || undefined,
        task_type: taskType,
        handler,
        cron_expr: cronExpr || undefined,
        enabled: true,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-border rounded-xl p-6 w-full max-w-md space-y-4"
      >
        <h3 className="text-lg font-semibold">{task ? "Edit Task" : "New Task"}</h3>

        <div>
          <label className="block text-sm text-text-muted mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-text-muted mb-1">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-text-muted mb-1">Type</label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="cron">Cron</option>
              <option value="one-time">One-time</option>
              <option value="pipeline">Pipeline</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Handler</label>
            <select
              value={handler}
              onChange={(e) => setHandler(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm"
            >
              {HANDLERS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-text-muted mb-1">Cron Expression</label>
          <input
            value={cronExpr}
            onChange={(e) => setCronExpr(e.target.value)}
            placeholder="0 9 * * * (매일 9시)"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted hover:text-text cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
          >
            {saving ? "..." : task ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
