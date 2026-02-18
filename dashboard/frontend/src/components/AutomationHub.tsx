import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Clock,
  Pin,
  PinOff,
  Target,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  RefreshCw,
  Play,
  Star,
} from "lucide-react";
import { api, type AgentStatus, type AgentTask, type AgentGoal, type ScheduledTask } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

interface TodayTask {
  id: string;
  title: string;
  project: string;
  type: "one-time" | "recurring" | "event";
  status: "pending" | "running" | "completed" | "failed" | "paused";
  executedAt: string | null;
  requiresApproval: boolean;
  duration: number | null;
  cost: number | null;
}

function formatTime(isoString: string | null): string {
  if (!isoString) return "-";
  return new Date(isoString).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  const remainSec = sec % 60;
  if (min < 60) return `${min}분 ${remainSec}초`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return `${hr}시간 ${remainMin}분`;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  recurring: <RefreshCw size={10} className="rotate-180" />,
  "one-time": <Zap size={10} />,
  event: <Play size={10} />,
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warning/15 text-warning border-warning/20",
  running: "bg-primary/15 text-primary border-primary/20",
  completed: "bg-success/15 text-success border-success/20",
  failed: "bg-danger/15 text-danger border-danger/20",
  paused: "bg-text-muted/15 text-text-muted border-border",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "대기",
  running: "실행 중",
  completed: "완료",
  failed: "실패",
  paused: "일시정지",
};

// 상세 모달 컴포넌트
function TodayTasksModal({
  tasks,
  onClose,
  onApprove,
  onCancel,
  actionLoading,
}: {
  tasks: TodayTask[];
  onClose: () => void;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
  actionLoading: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "completed" | "failed" | "running">("all");

  const filteredTasks = tasks.filter((t) => {
    if (filter === "all") return true;
    if (filter === "completed") return t.status === "completed";
    if (filter === "failed") return t.status === "failed";
    if (filter === "running") return t.status === "running";
    return true;
  });

  const byType = {
    recurring: tasks.filter((t) => t.type === "recurring").length,
    oneTime: tasks.filter((t) => t.type === "one-time").length,
    event: tasks.filter((t) => t.type === "event").length,
  };

  const pendingTasks = tasks.filter((t) => t.status === "pending");

  const handleApproveAll = async () => {
    for (const t of pendingTasks) {
      await onApprove(t.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm">오늘의 작업</h2>
            <span className="text-[10px] text-text-muted bg-bg px-1.5 py-0.5 rounded border border-border">
              {tasks.length}건
            </span>
          </div>
          <div className="flex items-center gap-2">
            {pendingTasks.length > 0 && (
              <button
                onClick={handleApproveAll}
                disabled={actionLoading}
                className="text-[11px] text-success bg-success/10 hover:bg-success/20 disabled:opacity-50 border border-success/20 rounded-lg px-2.5 py-1 transition-colors cursor-pointer"
              >
                전체 승인 ({pendingTasks.length})
              </button>
            )}
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text text-lg leading-none cursor-pointer"
            >
              ×
            </button>
          </div>
        </div>

        {/* 타입별 요약 */}
        <div className="px-5 py-3 border-b border-border">
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5">
              <RefreshCw size={12} className="rotate-180 text-primary" />
              <span className="text-xs text-text-muted">반복</span>
              <span className="text-sm font-medium text-text">{byType.recurring}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap size={12} className="text-warning" />
              <span className="text-xs text-text-muted">1회</span>
              <span className="text-sm font-medium text-text">{byType.oneTime}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Play size={12} className="text-success" />
              <span className="text-xs text-text-muted">이벤트</span>
              <span className="text-sm font-medium text-text">{byType.event}</span>
            </div>
          </div>
        </div>

        {/* 필터 */}
        <div className="px-5 py-2 border-b border-border flex gap-2">
          {(["all", "completed", "failed", "running"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                filter === f
                  ? "bg-primary text-white"
                  : "text-text-muted hover:text-text hover:bg-surface-hover"
              }`}
            >
              {f === "all" ? "전체" : f === "completed" ? "완료" : f === "failed" ? "실패" : "진행중"}
            </button>
          ))}
        </div>

        {/* 목록 */}
        <div className="overflow-y-auto px-5 py-3 flex-1">
          {filteredTasks.length === 0 ? (
            <div className="text-center text-text-muted py-8 text-sm">작업이 없습니다</div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="bg-surface-hover/50 border border-border/50 rounded-xl p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">
                        {task.project}
                      </span>
                      <span className="text-xs text-text-muted shrink-0">
                        {TYPE_ICONS[task.type]}
                      </span>
                      <span className="text-sm truncate">{task.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {task.requiresApproval && task.status === "pending" && (
                        <>
                          <button
                            onClick={() => onApprove(task.id)}
                            disabled={actionLoading}
                            className="text-[10px] text-success hover:text-success/80 cursor-pointer"
                          >
                            승인
                          </button>
                          <button
                            onClick={() => onCancel(task.id)}
                            disabled={actionLoading}
                            className="text-[10px] text-danger hover:text-danger/80 cursor-pointer"
                          >
                            거부
                          </button>
                        </>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[task.status] || ""}`}>
                        {STATUS_LABELS[task.status] || task.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-1.5 text-[10px] text-text-muted">
                    <span>{formatTime(task.executedAt)}</span>
                    {task.duration !== null && <span>소요: {formatDuration(task.duration)}</span>}
                    {task.cost !== null && <span>${task.cost.toFixed(2)}</span>}
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

export function AutomationHub({ collapsed, pinned, onToggleCollapse, onTogglePin }: Props) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [pendingTasks, setPendingTasks] = useState<AgentTask[]>([]);
  const [todayTasks, setTodayTasks] = useState<TodayTask[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ title: "", description: "", projects: [] as string[], priority: "medium" as string, deadline: "" });
  const [error, setError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [statusData, tasksData, goalsData, allTasks] = await Promise.all([
        api.agentStatus(),
        api.scheduledTasks(),
        api.agentGoals(),
        api.agentTasks(false), // 전체 태스크
      ]);

      setAgentStatus(statusData);
      setScheduledTasks(tasksData.tasks);
      setGoals(Array.isArray(goalsData) ? goalsData : []);
      setPendingTasks(allTasks.filter((t) => t.requires_approval && (t.status === "pending" || t.status === "paused")));

      // 오늘 실행된 또는 생성된 태스크 필터링
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStart = today.toISOString();

      // todayTaskCount와 일치시키기 위해 last_run_at 또는 created_at이 오늘인 작업 모두 포함
      const executed: TodayTask[] = allTasks
        .filter((t) => {
          const lastRun = t.last_run_at ? new Date(t.last_run_at) : null;
          const created = new Date(t.created_at);
          const todayDate = new Date(todayStart);
          return (lastRun && lastRun >= todayDate) || created >= todayDate;
        })
        .map((t) => ({
          id: t.id,
          title: t.title,
          project: t.project,
          type: t.type,
          status: t.status,
          executedAt: t.last_run_at,
          requiresApproval: t.requires_approval,
          duration: null,
          cost: null,
        }));

      // last_result에서 비용 추출 시도
      for (const t of allTasks.filter((t) => t.last_run_at && t.last_run_at >= todayStart && t.last_result)) {
        const costMatch = t.last_result?.match(/\$?([\d.]+)/);
        if (costMatch) {
          const task = executed.find((e) => e.id === t.id);
          if (task) {
            task.cost = parseFloat(costMatch[1]);
          }
        }
      }

      setTodayTasks(executed);
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

  const handleToggleScheduled = async (taskId: string, enabled: boolean) => {
    setToggling(taskId);
    try {
      await api.toggleScheduledTask(taskId, enabled);
      await fetchAll();
    } finally {
      setToggling(null);
    }
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

  const handleCreateGoal = async () => {
    if (!goalForm.title || goalForm.projects.length === 0) return;
    setActionLoading(true);
    try {
      await api.agentCreateGoal({
        title: goalForm.title,
        description: goalForm.description || goalForm.title,
        projects: goalForm.projects,
        priority: goalForm.priority,
        deadline: goalForm.deadline || undefined,
      });
      setGoalForm({ title: "", description: "", projects: [], priority: "medium", deadline: "" });
      setShowGoalForm(false);
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteGoal = async (id: string) => {
    setActionLoading(true);
    try {
      await api.agentUpdateGoal(id, { status: "completed" } as any);
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteGoal = async (id: string) => {
    setActionLoading(true);
    try {
      await api.agentDeleteGoal(id);
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveGoal = async (id: string) => {
    setActionLoading(true);
    try {
      await api.agentApproveGoal(id);
      fetchAll();
    } finally {
      setActionLoading(false);
    }
  };

  const toggleGoalProject = (p: string) => {
    setGoalForm((f) => ({
      ...f,
      projects: f.projects.includes(p) ? f.projects.filter((x) => x !== p) : [...f.projects, p],
    }));
  };

  const isExecuting = (agentStatus?.runningTasks?.length ?? 0) > 0;

  // Goals 분리
  const proposedGoals = goals.filter((g) => g.status === "proposed");
  const activeGoals = goals.filter((g) => g.status === "active");

  // 오늘 작업 통계
  const todayCompleted = todayTasks.filter((t) => t.status === "completed").length;
  const todayFailed = todayTasks.filter((t) => t.status === "failed").length;

  const borderClass = pinned ? "border-primary/50" : "border-border/60";

  if (collapsed) {
    return (
      <div
        className={`bg-surface border ${borderClass} rounded-2xl p-3 flex items-center justify-between card-glow card-transition`}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isExecuting ? "bg-warning animate-pulse" : agentStatus?.running ? "bg-success" : error ? "bg-danger" : "bg-text-muted"}`} />
          <Bot size={14} className="text-primary" />
          <span className="text-sm font-medium text-text">Automation</span>
          {agentStatus && (
            <span className="text-[10px] text-text-muted">
              {isExecuting
                ? `실행 중 ${agentStatus.runningTasks.length}건`
                : `idle · 오늘 ${agentStatus.todayTaskCount}건 · $${agentStatus.todayCost.toFixed(2)}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {pendingTasks.length > 0 && (
            <span className="text-[10px] bg-warning/15 text-warning px-1.5 py-0.5 rounded border border-warning/20 mr-1">
              {pendingTasks.length}
            </span>
          )}
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
            <ChevronDown size={14} />
          </button>
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
        ) : !agentStatus ? (
          <p className="text-sm text-text-muted">Loading...</p>
        ) : (
          <div className="space-y-4">
            {/* 상태 요약 - 클릭 가능 */}
            <div
              onClick={() => setShowModal(true)}
              className="bg-surface-hover/50 border border-border/50 rounded-xl p-4 cursor-pointer hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isExecuting ? "bg-warning animate-pulse" : agentStatus.running ? "bg-success" : "bg-text-muted"}`} />
                  <span className="text-sm font-medium text-text">
                    {isExecuting ? `${agentStatus.runningTasks.length}건 실행 중` : agentStatus.running ? "대기 중" : "중지됨"}
                  </span>
                </div>
                <span className="text-[10px] text-text-muted">자세히 →</span>
              </div>

              {/* 오늘 통계 */}
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-lg font-bold text-text">{agentStatus.todayTaskCount}</span>
                  <span className="text-xs text-text-muted ml-1">건</span>
                </div>
                <div>
                  <span className="text-lg font-bold text-success">${agentStatus.todayCost.toFixed(2)}</span>
                </div>
                {todayCompleted > 0 && (
                  <div className="flex items-center gap-1 text-xs text-success">
                    <CheckCircle size={10} />
                    {todayCompleted}
                  </div>
                )}
                {todayFailed > 0 && (
                  <div className="flex items-center gap-1 text-xs text-danger">
                    <XCircle size={10} />
                    {todayFailed}
                  </div>
                )}
              </div>

              {/* 실행 중 작업 */}
              {agentStatus.runningTasks.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/30">
                  <div className="flex gap-2 overflow-x-auto">
                    {agentStatus.runningTasks.map((task, i) => (
                      <div key={i} className="bg-warning/10 border border-warning/20 rounded-lg px-2 py-1 shrink-0">
                        <span className="text-[10px] text-warning">{task.project}</span>
                        <span className="text-[10px] text-text-muted ml-1 truncate max-w-[100px]">{task.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 승인 대기 배너 */}
            {pendingTasks.length > 0 && (
              <div
                onClick={() => setShowModal(true)}
                className="bg-warning/10 border border-warning/20 rounded-xl px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-warning/15 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-warning" />
                  <span className="text-sm text-warning">승인 대기 {pendingTasks.length}건</span>
                </div>
                <span className="text-[10px] text-warning">보기 →</span>
              </div>
            )}

            {/* 예약 작업 */}
            <div>
              <div className="flex items-center gap-1 mb-2">
                <Clock size={12} className="text-primary" />
                <span className="text-xs font-medium text-text-muted">예약 작업 ({scheduledTasks.length}개)</span>
              </div>
              <div className="space-y-1.5">
                {scheduledTasks.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center justify-between bg-surface-hover/30 border border-border/30 rounded-lg px-2.5 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => handleToggleScheduled(t.id, !t.enabled)}
                        disabled={toggling === t.id}
                        className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors shrink-0 ${
                          t.enabled ? "bg-primary" : "bg-border"
                        } ${toggling === t.id ? "opacity-50" : ""}`}
                      >
                        <span
                          className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                            t.enabled ? "translate-x-3" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                      <span className={`text-xs truncate ${!t.enabled ? "text-text-muted" : "text-text"}`}>
                        {t.display_name}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-text-muted shrink-0 ml-2">{t.schedule}</span>
                  </div>
                ))}
                {scheduledTasks.length > 3 && (
                  <div className="text-[10px] text-text-muted text-center">+{scheduledTasks.length - 3}개 더보기</div>
                )}
              </div>
            </div>

            {/* Goals */}
            <div>
              <div className="flex items-center gap-1 mb-2">
                <Target size={12} className="text-primary" />
                <span className="text-xs font-medium text-text-muted">
                  Goals ({activeGoals.length} active{proposedGoals.length > 0 && ` · ${proposedGoals.length} proposed`})
                </span>
              </div>
              {proposedGoals.length > 0 && (
                <div className="space-y-1 mb-2">
                  {proposedGoals.slice(0, 2).map((g) => (
                    <div key={g.id} className="bg-warning/5 border border-warning/20 rounded-lg px-2.5 py-2 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-xs truncate block">{g.title}</span>
                        <span className="text-[10px] text-text-muted">{g.projects.join(", ")}</span>
                      </div>
                      <div className="flex gap-1 shrink-0 ml-2">
                        <button
                          onClick={() => {
                            api.agentApproveGoal(g.id).then(fetchAll);
                          }}
                          className="text-[10px] bg-success/20 text-success hover:bg-success/30 rounded px-1.5 py-0.5 cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            api.agentDeleteGoal(g.id).then(fetchAll);
                          }}
                          className="text-[10px] bg-danger/20 text-danger hover:bg-danger/30 rounded px-1.5 py-0.5 cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {activeGoals.length > 0 && (
                <div className="space-y-1">
                  {activeGoals.slice(0, 2).map((g) => (
                    <div key={g.id} className="bg-surface-hover/30 border border-border/30 rounded-lg px-2.5 py-2 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-xs truncate block">{g.title}</span>
                        <span className="text-[10px] text-text-muted">{g.projects.join(", ")}</span>
                      </div>
                      {g.priority === "high" && <Star size={10} className="text-warning shrink-0" />}
                    </div>
                  ))}
                </div>
              )}
              {goals.length === 0 && (
                <div className="text-xs text-text-muted text-center py-2">No active goals</div>
              )}
              {/* 더보기 버튼 */}
              <button
                onClick={() => setShowGoalsModal(true)}
                className="w-full mt-2 text-xs text-primary hover:text-primary/80 text-center py-1.5 cursor-pointer"
              >
                전체 보기 →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {showModal && (
        <TodayTasksModal
          tasks={todayTasks}
          onClose={() => setShowModal(false)}
          onApprove={handleApproveTask}
          onCancel={handleCancelTask}
          actionLoading={actionLoading}
        />
      )}

      {/* Goals 모달 */}
      {showGoalsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowGoalsModal(false)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Target size={16} className="text-primary" />
                <h2 className="font-semibold text-sm">Project Goals</h2>
                <span className="text-[10px] text-text-muted bg-bg px-1.5 py-0.5 rounded border border-border">
                  {goals.length}개
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGoalForm(!showGoalForm)}
                  className="text-[11px] text-primary hover:bg-primary/10 border border-primary/20 rounded-lg px-2.5 py-1 transition-colors cursor-pointer"
                >
                  {showGoalForm ? "취소" : "+ 추가"}
                </button>
                <button
                  onClick={() => setShowGoalsModal(false)}
                  className="text-text-muted hover:text-text text-lg leading-none cursor-pointer"
                >
                  ×
                </button>
              </div>
            </div>

            {/* 추가 formulário */}
            {showGoalForm && (
              <div className="px-5 py-3 border-b border-border bg-surface-hover/30">
                <div className="space-y-2">
                  <input
                    className="w-full bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none text-text"
                    placeholder="Goal title"
                    value={goalForm.title}
                    onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                  />
                  <input
                    className="w-full bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none text-text"
                    placeholder="Description (optional)"
                    value={goalForm.description}
                    onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-1">
                    {["COIN", "BLOG", "DASH", "TRAIN", "TGBOT", "DCBOT"].map((p) => (
                      <button
                        key={p}
                        onClick={() => toggleGoalProject(p)}
                        className={`text-xs px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                          goalForm.projects.includes(p) ? "bg-primary/20 border-primary text-primary" : "border-border/50 text-text-muted hover:bg-surface-hover"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <select
                      className="bg-surface border border-border/50 rounded-lg px-2 py-2 text-sm text-text"
                      value={goalForm.priority}
                      onChange={(e) => setGoalForm({ ...goalForm, priority: e.target.value })}
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <input
                      type="date"
                      className="bg-surface border border-border/50 rounded-lg px-2 py-2 text-sm flex-1 focus:border-primary outline-none text-text"
                      value={goalForm.deadline}
                      onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })}
                    />
                    <button
                      onClick={handleCreateGoal}
                      disabled={actionLoading || !goalForm.title || goalForm.projects.length === 0}
                      className="text-xs bg-primary hover:bg-primary/80 disabled:opacity-50 text-white rounded-lg px-4 py-2 cursor-pointer font-medium"
                    >
                      생성
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Goals 목록 */}
            <div className="overflow-y-auto px-5 py-3 flex-1">
              {/* Proposed Goals */}
              {proposedGoals.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium text-warning mb-2 flex items-center gap-1">
                    <AlertCircle size={10} />
                    Proposed ({proposedGoals.length})
                  </div>
                  <div className="space-y-2">
                    {proposedGoals.map((g) => (
                      <div key={g.id} className="bg-warning/5 border border-warning/20 rounded-xl px-3 py-2.5">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {g.priority === "high" && <Star size={10} className="text-warning" />}
                              <span className="text-sm font-medium text-text">{g.title}</span>
                            </div>
                            {g.description && g.description !== g.title && (
                              <div className="text-xs text-text-muted mt-1">{g.description}</div>
                            )}
                            <div className="text-[10px] text-text-muted mt-1">{g.projects.join(", ")}</div>
                          </div>
                          <div className="flex gap-1.5 ml-2 shrink-0">
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
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Goals */}
              <div>
                <div className="text-xs font-medium text-text-muted mb-2 flex items-center gap-1">
                  <Target size={10} />
                  Active ({activeGoals.length})
                </div>
                {activeGoals.length === 0 ? (
                  <div className="text-center text-text-muted py-8 text-sm">No active goals</div>
                ) : (
                  <div className="space-y-2">
                    {activeGoals.map((g) => (
                      <div key={g.id} className="bg-surface-hover/50 border border-border/50 rounded-xl px-3 py-2.5 group">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {g.priority === "high" && <Star size={10} className="text-warning" />}
                              <span className="text-sm truncate text-text">{g.title}</span>
                            </div>
                            {g.description && g.description !== g.title && (
                              <div className="text-xs text-text-muted mt-1">{g.description}</div>
                            )}
                            <div className="text-[10px] text-text-muted mt-1 flex gap-2">
                              <span>{g.projects.join(", ")}</span>
                              {g.deadline && <span>by {g.deadline}</span>}
                            </div>
                            {g.progress && <div className="text-xs text-text-muted mt-1">{g.progress}</div>}
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
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
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

