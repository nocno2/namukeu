import { useCallback, useEffect, useState } from "react";
import { api, type AgentTask } from "../lib/api";

interface Props {
  onClose: () => void;
}

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

const TYPE_LABELS: Record<string, string> = {
  "one-time": "1회",
  recurring: "반복",
  event: "이벤트",
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "없음";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR");
}

function TaskDetail({
  task,
  onBack,
  onApprove,
  onCancel,
  actionLoading,
}: {
  task: AgentTask;
  onBack: () => void;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
  actionLoading: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="text-text-muted hover:text-text text-sm cursor-pointer"
          >
            ← 목록
          </button>
          <span className="text-text-muted/30">|</span>
          <h2 className="font-semibold text-sm truncate">{task.title}</h2>
        </div>
        <button
          onClick={onBack}
          className="text-text-muted hover:text-text text-lg leading-none cursor-pointer shrink-0"
        >
          ×
        </button>
      </div>

      <div className="overflow-y-auto px-5 py-4 flex-1 space-y-4">
        {/* Badges */}
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
          {task.requires_approval && (
            <span className="text-[10px] bg-warning/15 text-warning px-1.5 py-0.5 rounded border border-warning/20">
              승인 필요
            </span>
          )}
        </div>

        {/* Prompt */}
        <div>
          <span className="text-xs text-text-muted block mb-1.5">프롬프트</span>
          <div className="bg-bg border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
            <pre className="text-xs whitespace-pre-wrap break-words leading-relaxed">{task.prompt}</pre>
          </div>
        </div>

        {/* Last Result */}
        {task.last_result && (
          <div>
            <span className="text-xs text-text-muted block mb-1.5">마지막 결과</span>
            <div className="bg-bg border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap break-words leading-relaxed">{task.last_result}</pre>
            </div>
          </div>
        )}

        {/* Meta */}
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">실행 횟수</span>
            <span>{task.run_count}{task.max_runs ? ` / ${task.max_runs}` : ""}</span>
          </div>
          {task.schedule_cron && (
            <div className="flex justify-between">
              <span className="text-text-muted">스케줄</span>
              <span className="font-mono">{task.schedule_cron}</span>
            </div>
          )}
          {task.schedule_next && (
            <div className="flex justify-between">
              <span className="text-text-muted">다음 실행</span>
              <span>{timeAgo(task.schedule_next)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-text-muted">마지막 실행</span>
            <span>{timeAgo(task.last_run_at)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">생성</span>
            <span>{timeAgo(task.created_at)}</span>
          </div>
        </div>

        {/* Actions */}
        {task.requires_approval && (task.status === "pending" || task.status === "paused") && (
          <div className="flex gap-2 pt-2 border-t border-border">
            <button
              onClick={() => onApprove(task.id)}
              disabled={actionLoading}
              className="flex-1 text-sm text-success bg-success/10 hover:bg-success/20 disabled:opacity-50 border border-success/20 rounded-lg py-2 transition-colors cursor-pointer"
            >
              승인
            </button>
            <button
              onClick={() => onCancel(task.id)}
              disabled={actionLoading}
              className="flex-1 text-sm text-danger bg-danger/10 hover:bg-danger/20 disabled:opacity-50 border border-danger/20 rounded-lg py-2 transition-colors cursor-pointer"
            >
              반려
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export function AgentTasksPanel({ onClose }: Props) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const data = await api.agentTasks(true);
      setTasks(data);
      setError("");
    } catch {
      setError("에이전트 태스크를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 15_000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const approvalPending = tasks.filter((t) => t.requires_approval);

  const handleApprove = async (taskId: string) => {
    setActionLoading(true);
    try {
      await api.agentApproveTask(taskId);
      setSelectedTask(null);
      fetchTasks();
    } catch { /* ignore */ }
    finally { setActionLoading(false); }
  };

  const handleCancel = async (taskId: string) => {
    setActionLoading(true);
    try {
      await api.agentCancelTask(taskId);
      setSelectedTask(null);
      fetchTasks();
    } catch { /* ignore */ }
    finally { setActionLoading(false); }
  };

  const handleApproveAll = async () => {
    setActionLoading(true);
    try {
      await api.agentApproveAllTasks();
      fetchTasks();
    } catch { /* ignore */ }
    finally { setActionLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {selectedTask ? (
          <TaskDetail
            task={selectedTask}
            onBack={() => setSelectedTask(null)}
            onApprove={handleApprove}
            onCancel={handleCancel}
            actionLoading={actionLoading}
          />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm">에이전트 태스크</h2>
                <span className="text-[10px] text-text-muted bg-bg px-1.5 py-0.5 rounded border border-border">
                  {tasks.length}건
                </span>
              </div>
              <div className="flex items-center gap-2">
                {approvalPending.length > 0 && (
                  <button
                    onClick={handleApproveAll}
                    disabled={actionLoading}
                    className="text-[11px] text-success bg-success/10 hover:bg-success/20 disabled:opacity-50 border border-success/20 rounded-lg px-2.5 py-1 transition-colors cursor-pointer"
                  >
                    전체 승인 ({approvalPending.length})
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

            {/* Content */}
            <div className="overflow-y-auto px-5 py-3 flex-1">
              {loading && (
                <div className="text-text-muted text-sm py-8 text-center">Loading...</div>
              )}

              {error && (
                <div className="text-danger text-sm py-8 text-center">{error}</div>
              )}

              {!loading && !error && tasks.length === 0 && (
                <div className="text-text-muted text-sm py-8 text-center">
                  대기 중인 태스크가 없습니다.
                </div>
              )}

              {/* Approval banner */}
              {approvalPending.length > 0 && (
                <div className="bg-warning/10 border border-warning/20 rounded-lg px-3 py-2 mb-3 text-xs text-warning">
                  승인 대기 {approvalPending.length}건
                </div>
              )}

              <div className="space-y-0">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="py-3 border-b border-border last:border-0 cursor-pointer hover:bg-surface-hover -mx-2 px-2 rounded transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">
                          {task.project}
                        </span>
                        <span className="text-sm truncate">{task.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {task.requires_approval && (
                          <span className="text-[10px] bg-warning/15 text-warning px-1.5 py-0.5 rounded border border-warning/20">
                            승인
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[task.status] || ""}`}>
                          {STATUS_LABELS[task.status] || task.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-1 text-[10px] text-text-muted ml-0">
                      <span>{TYPE_LABELS[task.type] || task.type}</span>
                      <span>·</span>
                      <span>{timeAgo(task.created_at)}</span>
                      {task.last_run_at && (
                        <>
                          <span>·</span>
                          <span>마지막 실행 {timeAgo(task.last_run_at)}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
