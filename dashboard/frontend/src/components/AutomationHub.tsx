import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Pin,
  PinOff,
  RefreshCw,
  Target,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  Star,
  Plus,
  Pause,
  Play,
  Trash2,
  X,
  Clock,
} from "lucide-react";
import { api, type AgentStatus, type AgentTask, type AgentGoal, type ScheduledTask } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
  onRefresh?: () => void;
}

interface TaskItem {
  id: string;
  title: string;
  project: string;
  type: string;
  status: string;
  prompt?: string;
  scheduleCron?: string;
  scheduleNext?: string;
  eventTrigger?: string;
  lastRunAt?: string;
  lastResult?: string;
  runCount: number;
  maxRuns?: number;
  requiresApproval: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  recurring: <Zap size={12} />,
  one_time: <Clock size={12} />,
  event: <AlertCircle size={12} />,
};

const STATUS_STYLES: Record<string, string> = {
  running: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  paused: "bg-text-muted/10 text-text-muted border-text-muted/20",
  completed: "bg-primary/10 text-primary border-primary/20",
  failed: "bg-danger/10 text-danger border-danger/20",
};

const STATUS_LABELS: Record<string, string> = {
  running: "실행중",
  pending: "대기중",
  paused: "일시중단",
  completed: "완료",
  failed: "실패",
};

const TYPE_LABELS: Record<string, string> = {
  recurring: "주기적",
  one_time: "一次性",
  event: "이벤트",
};

function TaskDetail({
  task,
  onBack,
  onApprove,
  onCancel,
  onUpdate,
  onPause,
  onResume,
  onDelete,
  actionLoading,
}: {
  task: TaskItem;
  onBack: () => void;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
  onUpdate: (id: string, updates: { title?: string; prompt?: string; project?: string; schedule_cron?: string }) => Promise<void>;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  actionLoading: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editProject, setEditProject] = useState(task.project);
  const [editPrompt, setEditPrompt] = useState(task.prompt || "");
  const [editScheduleCron, setEditScheduleCron] = useState(task.scheduleCron || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(task.id, {
        title: editTitle,
        project: editProject,
        prompt: editPrompt,
        schedule_cron: editScheduleCron,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-text-muted hover:text-text text-sm">← 목록</button>
          <span className="text-text-muted/30">|</span>
          <h2 className="font-semibold text-sm truncate">{task.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-[11px] text-primary hover:text-primary/80">편집</button>
          )}
          <button onClick={onBack} className="text-text-muted hover:text-text text-lg">×</button>
        </div>
      </div>

      <div className="overflow-y-auto px-5 py-4 flex-1 space-y-4">
        {/* 배지 */}
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
            {task.project}
          </span>
          <span className="text-[10px] bg-bg text-text-muted px-1.5 py-0.5 rounded border border-border">
            {TYPE_LABELS[task.type] || task.type}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[task.status] || ""}`}>
            {STATUS_LABELS[task.status] || task.status}
          </span>
          {task.requiresApproval && (
            <span className="text-[10px] bg-warning/15 text-warning px-1.5 py-0.5 rounded border border-warning/20">
              승인 필요
            </span>
          )}
        </div>

        {/* 편집 폼 */}
        {editing ? (
          <div className="space-y-3">
            <div>
              <span className="text-xs text-text-muted block mb-1.5">제목</span>
              <input
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div>
              <span className="text-xs text-text-muted block mb-1.5">프로젝트</span>
              <input
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text"
                value={editProject}
                onChange={(e) => setEditProject(e.target.value)}
              />
            </div>
            {task.type === "recurring" && (
              <div>
                <span className="text-xs text-text-muted block mb-1.5">Cron</span>
                <input
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text font-mono"
                  value={editScheduleCron}
                  onChange={(e) => setEditScheduleCron(e.target.value)}
                />
              </div>
            )}
            <div>
              <span className="text-xs text-text-muted block mb-1.5">프롬프트</span>
              <textarea
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={8}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 text-sm text-white bg-primary hover:bg-primary/80 disabled:opacity-50 rounded-lg py-2"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-sm text-text-muted hover:text-text border border-border rounded-lg px-4 py-2"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 프롬프트 */}
            <div>
              <span className="text-xs text-text-muted block mb-1.5">프롬프트</span>
              <div className="text-xs text-text bg-bg rounded-lg p-3 border border-border whitespace-pre-wrap">
                {task.prompt || "-"}
              </div>
            </div>

            {/* 마지막 결과 */}
            {task.lastResult && (
              <div>
                <span className="text-xs text-text-muted block mb-1.5">마지막 결과</span>
                <div className="text-xs text-text bg-bg rounded-lg p-3 border border-border max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {task.lastResult}
                </div>
              </div>
            )}
          </>
        )}

        {/* 메타 정보 */}
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">실행 횟수</span>
            <span>{task.runCount}{task.maxRuns ? ` / ${task.maxRuns}` : ""}</span>
          </div>
          {task.scheduleCron && (
            <div className="flex justify-between">
              <span className="text-text-muted">스케줄</span>
              <span className="font-mono">{task.scheduleCron}</span>
            </div>
          )}
          {task.scheduleNext && (
            <div className="flex justify-between">
              <span className="text-text-muted">다음 실행</span>
              <span>{new Date(task.scheduleNext).toLocaleString("ko-KR")}</span>
            </div>
          )}
          {task.lastRunAt && (
            <div className="flex justify-between">
              <span className="text-text-muted">마지막 실행</span>
              <span>{new Date(task.lastRunAt).toLocaleString("ko-KR")}</span>
            </div>
          )}
        </div>

        {/* 작업 버튼 */}
        <div className="flex gap-2 pt-2 border-t border-border">
          {task.status === "running" || task.status === "pending" ? (
            <button
              onClick={() => onPause(task.id)}
              disabled={actionLoading}
              className="flex-1 text-sm text-warning bg-warning/10 hover:bg-warning/20 disabled:opacity-50 rounded-lg py-2 flex items-center justify-center gap-1"
            >
              <Pause size={14} /> 일시중단
            </button>
          ) : task.status === "paused" ? (
            <button
              onClick={() => onResume(task.id)}
              disabled={actionLoading}
              className="flex-1 text-sm text-success bg-success/10 hover:bg-success/20 disabled:opacity-50 rounded-lg py-2 flex items-center justify-center gap-1"
            >
              <Play size={14} /> 재개
            </button>
          ) : null}
          {task.requiresApproval && (task.status === "pending" || task.status === "paused") && (
            <>
              <button
                onClick={() => onApprove(task.id)}
                disabled={actionLoading}
                className="flex-1 text-sm text-success bg-success/10 hover:bg-success/20 disabled:opacity-50 rounded-lg py-2"
              >
                승인
              </button>
              <button
                onClick={() => onCancel(task.id)}
                disabled={actionLoading}
                className="flex-1 text-sm text-danger bg-danger/10 hover:bg-danger/20 disabled:opacity-50 rounded-lg py-2"
              >
                거부
              </button>
            </>
          )}
          <button
            onClick={() => onDelete(task.id)}
            disabled={actionLoading}
            className="text-sm text-danger hover:text-danger/80 disabled:opacity-50 rounded-lg py-2 px-3"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// 전체 작업 관리 모달
function AgentTasksModal({
  tasks,
  onClose,
  onApprove,
  onCancel,
  onUpdate,
  onDelete,
  onPause,
  onResume,
  actionLoading,
}: {
  tasks: TaskItem[];
  onClose: () => void;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
  onUpdate: (id: string, updates: { title?: string; prompt?: string; project?: string; schedule_cron?: string }) => Promise<void>;
  onDelete: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  actionLoading: boolean;
}) {
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  if (selectedTask) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-surface rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-border shadow-xl">
          <TaskDetail
            task={selectedTask}
            onBack={() => setSelectedTask(null)}
            onApprove={onApprove}
            onCancel={onCancel}
            onUpdate={onUpdate}
            onPause={onPause}
            onResume={onResume}
            onDelete={onDelete}
            actionLoading={actionLoading}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden border border-border shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-text">전체 에이전트 작업</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto max-h-[calc(80vh-60px)]">
          {tasks.length === 0 ? (
            <div className="text-center text-text-muted py-8">작업이 없습니다</div>
          ) : (
            <div className="divide-y divide-border">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="px-5 py-3 hover:bg-surface-hover cursor-pointer"
                  onClick={() => setSelectedTask(task)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {TYPE_ICONS[task.type]}
                      <span className="text-sm font-medium text-text truncate">{task.title}</span>
                      <span className="text-xs text-text-muted shrink-0">{task.project}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[task.status] || ""}`}>
                        {STATUS_LABELS[task.status] || task.status}
                      </span>
                      {task.scheduleCron && (
                        <span className="text-[10px] text-text-muted font-mono">{task.scheduleCron}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 목표 생성 폼
function GoalForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: { title: string; description: string; priority: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");

  return (
    <div className="bg-bg rounded-xl p-4 border border-border space-y-3">
      <input
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
        placeholder="목표 제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
        placeholder="설명 (선택)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />
      <div className="flex items-center gap-2">
        <select
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="low">낮은 우선순위</option>
          <option value="medium">중간 우선순위</option>
          <option value="high">높은 우선순위</option>
        </select>
        <button
          onClick={() => onSubmit({ title, description, priority })}
          disabled={!title.trim()}
          className="flex-1 text-sm text-white bg-primary hover:bg-primary/80 disabled:opacity-50 rounded-lg py-2"
        >
          추가
        </button>
        <button
          onClick={onCancel}
          className="text-sm text-text-muted hover:text-text border border-border rounded-lg px-3 py-2"
        >
          취소
        </button>
      </div>
    </div>
  );
}

// 작업 생성 폼
function TaskForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: { title: string; prompt: string; project: string; type: "one-time" | "recurring" | "event"; schedule_cron?: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [project, setProject] = useState("");
  const [type, setType] = useState<"one-time" | "recurring" | "event">("one-time");
  const [scheduleCron, setScheduleCron] = useState("");

  const handleSubmit = () => {
    if (!title.trim() || !prompt.trim()) return;
    onSubmit({
      title,
      prompt,
      project: project || "default",
      type,
      schedule_cron: type === "recurring" ? scheduleCron : undefined,
    });
  };

  return (
    <div className="bg-bg rounded-xl p-4 border border-border space-y-3">
      <input
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
        placeholder="작업 제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
        placeholder="프로젝트 (예: COIN, BLOG)"
        value={project}
        onChange={(e) => setProject(e.target.value)}
      />
      <select
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
        value={type}
        onChange={(e) => setType(e.target.value as "one-time" | "recurring" | "event")}
      >
        <option value="one-time">一次性 (One-time)</option>
        <option value="recurring">주기적 (Recurring)</option>
        <option value="event">이벤트 (Event)</option>
      </select>
      {type === "recurring" && (
        <input
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text font-mono"
          placeholder="Cron (예: 0 9 * * *)"
          value={scheduleCron}
          onChange={(e) => setScheduleCron(e.target.value)}
        />
      )}
      <textarea
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text"
        placeholder="프롬프트"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
      />
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !prompt.trim()}
          className="flex-1 text-sm text-white bg-primary hover:bg-primary/80 disabled:opacity-50 rounded-lg py-2"
        >
          추가
        </button>
        <button
          onClick={onCancel}
          className="text-sm text-text-muted hover:text-text border border-border rounded-lg px-3 py-2"
        >
          취소
        </button>
      </div>
    </div>
  );
}

export function AutomationHub({ collapsed, pinned, onToggleCollapse, onTogglePin, onRefresh }: Props) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [pendingTasks, setPendingTasks] = useState<AgentTask[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [goalsFilter, setGoalsFilter] = useState<"all" | "active" | "proposed" | "completed">("active");
  const [error, setError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [statusData, tasksData, goalsData, allTasks] = await Promise.all([
        api.agentStatus(),
        api.scheduledTasks(),
        api.agentGoals(),
        api.agentTasks(false),
      ]);

      setAgentStatus(statusData);
      setScheduledTasks(tasksData.tasks);
      setGoals(Array.isArray(goalsData) ? goalsData : []);
      setPendingTasks(allTasks.filter((t) => t.requires_approval && (t.status === "pending" || t.status === "paused")));

      const taskItems: TaskItem[] = allTasks.map((t) => ({
        id: t.id,
        title: t.title,
        project: t.project,
        type: t.type,
        status: t.status,
        prompt: t.prompt || undefined,
        scheduleCron: t.schedule_cron || undefined,
        scheduleNext: t.schedule_next || undefined,
        eventTrigger: t.event_trigger || undefined,
        lastRunAt: t.last_run_at || undefined,
        lastResult: t.last_result || undefined,
        runCount: t.run_count,
        maxRuns: t.max_runs || undefined,
        requiresApproval: t.requires_approval,
        createdAt: t.created_at,
      }));

      setTasks(taskItems);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
    onRefresh?.();
  };

  const handleApproveTask = async (taskId: string) => {
    setActionLoading(true);
    try {
      await api.agentApproveTask(taskId);
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    setActionLoading(true);
    try {
      await api.agentCancelTask(taskId);
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateTask = async (taskId: string, updates: { title?: string; prompt?: string; project?: string; schedule_cron?: string }) => {
    await api.agentUpdateTask(taskId, updates);
    fetchAll();
  };

  const handlePauseTask = async (taskId: string) => {
    setActionLoading(true);
    try {
      await api.agentUpdateTask(taskId, { status: "paused" });
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const handleResumeTask = async (taskId: string) => {
    setActionLoading(true);
    try {
      await api.agentUpdateTask(taskId, { status: "running" });
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    setActionLoading(true);
    try {
      await api.agentDeleteTask(taskId);
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveGoal = async (goalId: string) => {
    setActionLoading(true);
    try {
      await api.agentUpdateGoal(goalId, { status: "active" });
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteGoal = async (goalId: string) => {
    setActionLoading(true);
    try {
      await api.agentUpdateGoal(goalId, { status: "completed" });
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    setActionLoading(true);
    try {
      await api.agentDeleteGoal(goalId);
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateGoal = async (data: { title: string; description: string; priority: string }) => {
    setActionLoading(true);
    try {
      await api.agentCreateGoal({
        title: data.title,
        description: data.description,
        projects: [],
        priority: data.priority as "low" | "medium" | "high",
      });
      setShowGoalForm(false);
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateTask = async (data: {
    title: string;
    prompt: string;
    project: string;
    type: "one-time" | "recurring" | "event";
    schedule_cron?: string;
  }) => {
    setActionLoading(true);
    try {
      await api.agentCreateTask({
        title: data.title,
        prompt: data.prompt,
        project: data.project,
        type: data.type,
        schedule_cron: data.schedule_cron,
      });
      setShowTaskForm(false);
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  // 통계
  const todayTaskCount = agentStatus?.todayTaskCount || 0;
  const activeGoals = goals.filter((g) => g.status === "active");
  const proposedGoals = goals.filter((g) => g.status === "proposed");
  const completedGoals = goals.filter((g) => g.status === "completed");

  const filteredGoals = goalsFilter === "all" ? goals :
    goalsFilter === "active" ? activeGoals :
    goalsFilter === "proposed" ? proposedGoals : completedGoals;

  const borderClass = pinned ? "border-primary/30" : "border-border";

  if (collapsed) {
    return (
      <div className={`bg-surface border ${borderClass} rounded-2xl p-4 card-transition`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-primary" />
            <span className="font-semibold text-sm text-text">Automation Hub</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleRefresh}
              className={`p-1.5 rounded-lg text-text-muted/40 hover:text-text-muted ${refreshing ? "animate-spin" : ""}`}
              title="새로고침"
            >
              <RefreshCw size={14} />
            </button>
            <button onClick={onTogglePin} className={`p-1.5 rounded-lg ${pinned ? "text-primary" : "text-text-muted/40 hover:text-text-muted"}`}>
              {pinned ? <Pin size={14} /> : <PinOff size={14} />}
            </button>
            <button onClick={onToggleCollapse} className="p-1.5 text-text-muted/40 hover:text-text-muted rounded-lg">
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`bg-surface border ${borderClass} rounded-2xl p-5 card-glow card-transition`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-primary" />
            <h3 className="font-semibold text-sm text-text">Automation Hub</h3>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleRefresh}
              className={`p-1.5 rounded-lg transition-colors text-text-muted/40 hover:text-text-muted hover:bg-surface-hover ${refreshing ? "animate-spin" : ""}`}
              title="새로고침"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={onTogglePin}
              className={`p-1.5 rounded-lg transition-colors ${
                pinned ? "text-primary bg-primary/10" : "text-text-muted/40 hover:text-text-muted hover:bg-surface-hover"
              }`}
            >
              {pinned ? <Pin size={14} /> : <PinOff size={14} />}
            </button>
            <button
              onClick={onToggleCollapse}
              className="p-1.5 text-text-muted/40 hover:text-text-muted hover:bg-surface-hover rounded-lg transition-colors"
            >
              <ChevronUp size={14} />
            </button>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-danger">API 연결 불가</p>
        ) : (
          <div className="space-y-4">
            {/* 에이전트 상태 요약 */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className="bg-bg rounded-xl p-3 border border-border cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setShowModal(true)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={14} className="text-primary" />
                  <span className="text-xs text-text-muted">오늘 작업</span>
                </div>
                <div className="text-xl font-bold text-text">
                  {todayTaskCount}
                  <span className="text-xs font-normal text-text-muted">회</span>
                </div>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] text-text-muted">총 실행</span>
                </div>
              </div>

              <div
                className="bg-bg rounded-xl p-3 border border-border cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setShowGoalsModal(true)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Target size={14} className="text-warning" />
                  <span className="text-xs text-text-muted">진행중 목표</span>
                </div>
                <div className="text-xl font-bold text-text">{activeGoals.length}</div>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] text-text-muted">제안 {proposedGoals.length}</span>
                </div>
              </div>
            </div>

            {/* 작업 추가 버튼 */}
            <button
              onClick={() => setShowTaskForm(true)}
              className="w-full text-sm text-primary border border-primary/30 hover:bg-primary/5 rounded-lg py-2 flex items-center justify-center gap-1"
            >
              <Plus size={14} /> 작업 추가
            </button>

            {/* 작업 추가 폼 */}
            {showTaskForm && (
              <TaskForm
                onSubmit={handleCreateTask}
                onCancel={() => setShowTaskForm(false)}
              />
            )}

            {/* 승인 대기 */}
            {pendingTasks.length > 0 && (
              <div className="bg-warning/5 border border-warning/20 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-warning">승인 대기 ({pendingTasks.length})</span>
                </div>
                <div className="space-y-2">
                  {pendingTasks.slice(0, 3).map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-xs">
                      <span className="text-text truncate">{t.title}</span>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => handleApproveTask(t.id)}
                          disabled={actionLoading}
                          className="text-success hover:text-success/80 disabled:opacity-50"
                        >
                          <CheckCircle size={14} />
                        </button>
                        <button
                          onClick={() => handleCancelTask(t.id)}
                          disabled={actionLoading}
                          className="text-danger hover:text-danger/80 disabled:opacity-50"
                        >
                          <XCircle size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {pendingTasks.length > 3 && (
                    <button
                      onClick={() => setShowModal(true)}
                      className="text-[10px] text-primary hover:text-primary/80"
                    >
                      +{pendingTasks.length - 3}개 더보기
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 실행중 작업 */}
            {agentStatus && agentStatus.runningTasks.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs text-text-muted">실행중</span>
                {agentStatus.runningTasks.slice(0, 3).map((t, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs bg-bg rounded-lg px-3 py-2 border border-border">
                    <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
                    <span className="text-text truncate">{t.title}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 예약 작업 */}
            {scheduledTasks.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs text-text-muted">예약됨 ({scheduledTasks.length})</span>
                {scheduledTasks.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-xs bg-bg rounded-lg px-3 py-2 border border-border">
                    <span className="text-text truncate">{t.display_name}</span>
                    <span className="text-text-muted font-mono shrink-0">{t.schedule}</span>
                  </div>
                ))}
                {scheduledTasks.length > 3 && (
                  <button onClick={() => setShowModal(true)} className="text-[10px] text-primary hover:text-primary/80">
                    +{scheduledTasks.length - 3}개 더보기
                  </button>
                )}
              </div>
            )}

            {/* 최근 목표 */}
            {activeGoals.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">진행중 목표</span>
                  <button onClick={() => setShowGoalsModal(true)} className="text-[10px] text-primary hover:text-primary/80">
                    전체 보기
                  </button>
                </div>
                {activeGoals.slice(0, 2).map((g) => (
                  <div key={g.id} className="flex items-center gap-2 text-xs bg-bg rounded-lg px-3 py-2 border border-border">
                    {g.priority === "high" && <Star size={10} className="text-warning shrink-0" />}
                    <span className="text-text truncate">{g.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 전체 작업 모달 */}
      {showModal && (
        <AgentTasksModal
          tasks={tasks}
          onClose={() => setShowModal(false)}
          onApprove={handleApproveTask}
          onCancel={handleCancelTask}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
          onPause={handlePauseTask}
          onResume={handleResumeTask}
          actionLoading={actionLoading}
        />
      )}

      {/* 목표 모달 */}
      {showGoalsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden border border-border shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-text">프로젝트 목표</h2>
              <button onClick={() => setShowGoalsModal(false)} className="text-text-muted hover:text-text">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 border-b border-border">
              {!showGoalForm ? (
                <button
                  onClick={() => setShowGoalForm(true)}
                  className="w-full text-sm text-primary border border-primary/30 hover:bg-primary/5 rounded-lg py-2 flex items-center justify-center gap-1"
                >
                  <Plus size={14} /> 목표 추가
                </button>
              ) : (
                <GoalForm
                  onSubmit={handleCreateGoal}
                  onCancel={() => setShowGoalForm(false)}
                />
              )}
            </div>

            <div className="overflow-y-auto px-5 py-3 max-h-[50vh]">
              <div className="flex gap-1 mb-3">
                {(["active", "proposed", "completed", "all"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setGoalsFilter(f)}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                      goalsFilter === f
                        ? "bg-primary text-white"
                        : "text-text-muted hover:text-text hover:bg-surface-hover"
                    }`}
                  >
                    {f === "active" ? "진행중" : f === "proposed" ? "제안" : f === "completed" ? "완료" : "전체"}
                    {f === "active" && activeGoals.length > 0 && ` (${activeGoals.length})`}
                    {f === "proposed" && proposedGoals.length > 0 && ` (${proposedGoals.length})`}
                    {f === "completed" && completedGoals.length > 0 && ` (${completedGoals.length})`}
                  </button>
                ))}
              </div>

              {filteredGoals.length === 0 ? (
                <div className="text-center text-text-muted py-8 text-sm">
                  {goalsFilter === "active" && "진행 중인 목표가 없습니다"}
                  {goalsFilter === "proposed" && "제안된 목표가 없습니다"}
                  {goalsFilter === "completed" && "완료된 목표가 없습니다"}
                  {goalsFilter === "all" && "목표가 없습니다"}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredGoals.map((g) => (
                    <div key={g.id} className={`group rounded-xl px-3 py-2.5 ${
                      g.status === "proposed" ? "bg-warning/5 border border-warning/20" :
                      g.status === "completed" ? "bg-success/5 border border-success/20" :
                      "bg-surface-hover/50 border border-border/50"
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {g.priority === "high" && <Star size={10} className="text-warning" />}
                            <span className="text-sm font-medium text-text">{g.title}</span>
                          </div>
                          {g.description && g.description !== g.title && (
                            <div className="text-xs text-text-muted mt-1">{g.description}</div>
                          )}
                          {g.deadline && (
                            <div className="text-xs text-text-muted mt-1">
                              <span>by {g.deadline}</span>
                            </div>
                          )}
                          {g.progress && <div className="text-xs text-text-muted mt-1">{g.progress}</div>}
                        </div>
                        <div className="flex gap-1 ml-2 shrink-0">
                          {g.status === "proposed" && (
                            <>
                              <button
                                onClick={() => handleApproveGoal(g.id)}
                                disabled={actionLoading}
                                className="text-[10px] bg-success/20 text-success hover:bg-success/30 disabled:opacity-50 rounded-lg px-2 py-1 cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleDeleteGoal(g.id)}
                                disabled={actionLoading}
                                className="text-[10px] bg-danger/20 text-danger hover:bg-danger/30 disabled:opacity-50 rounded-lg px-2 py-1 cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {g.status === "active" && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                              <button
                                onClick={() => handleCompleteGoal(g.id)}
                                disabled={actionLoading}
                                className="text-[10px] text-success hover:text-success/80 disabled:opacity-50 cursor-pointer"
                              >
                                Done
                              </button>
                              <button
                                onClick={() => handleDeleteGoal(g.id)}
                                disabled={actionLoading}
                                className="text-[10px] text-danger hover:text-danger/80 disabled:opacity-50 cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                          {g.status === "completed" && (
                            <button
                              onClick={() => handleDeleteGoal(g.id)}
                              disabled={actionLoading}
                              className="text-[10px] text-danger hover:text-danger/80 disabled:opacity-50 cursor-pointer"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
