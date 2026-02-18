import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, RefreshCw, Server, Zap } from "lucide-react";
import { api, type AgentTask, type CardPreference, type ServiceStatus } from "../lib/api";
import { AgentControl } from "./AgentControl";
import { AgentTasksPanel } from "./AgentTasksPanel";
import { BlogTraffic } from "./BlogTraffic";
import { ClaudeUsage } from "./ClaudeUsage";
import { CommitPanel } from "./CommitPanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { Header } from "./Header";
import { LaunchAgents } from "./LaunchAgents";
import { LogViewer } from "./LogViewer";
import { ProjectGoals } from "./ProjectGoals";
import { ServiceCard } from "./ServiceCard";
import { SystemResources } from "./SystemResources";
import { TrainStatus } from "./TrainStatus";

interface Props {
  username: string;
  onLogout: () => void;
}

const POLL_INTERVAL = 30_000;

type TabType = "all" | "services" | "tools";

type CardItem =
  | { type: "service"; id: string; service: ServiceStatus }
  | { type: "claude"; id: string }
  | { type: "system"; id: string }
  | { type: "blog"; id: string }
  | { type: "train"; id: string }
  | { type: "launchagents"; id: string }
  | { type: "agent"; id: string }
  | { type: "goals"; id: string };

export function Dashboard({ username, onLogout }: Props) {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [logService, setLogService] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Record<string, CardPreference>>({});
  const [showAgentTasks, setShowAgentTasks] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>("all");

  const fetchServices = useCallback(async () => {
    try {
      const data = await api.services();
      setServices(data.services);
      setError("");
    } catch {
      setError("서비스 상태를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPrefs = useCallback(async () => {
    try {
      const data = await api.cardPreferences();
      setPrefs(data.preferences);
    } catch { /* ignore */ }
  }, []);

  const fetchPendingApprovals = useCallback(async () => {
    try {
      const tasks: AgentTask[] = await api.agentTasks(true);
      setPendingApprovals(tasks.filter((t) => t.requires_approval).length);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchServices();
    fetchPrefs();
    fetchPendingApprovals();
    const interval = setInterval(fetchServices, POLL_INTERVAL);
    const approvalInterval = setInterval(fetchPendingApprovals, POLL_INTERVAL);
    return () => { clearInterval(interval); clearInterval(approvalInterval); };
  }, [fetchServices, fetchPrefs, fetchPendingApprovals]);

  const isCollapsed = (cardId: string) => !!prefs[cardId]?.collapsed;
  const isPinned = (cardId: string) => !!prefs[cardId]?.pinned;

  const toggleCollapse = async (cardId: string) => {
    const current = isCollapsed(cardId);
    setPrefs((p) => ({
      ...p,
      [cardId]: { ...p[cardId], card_id: cardId, collapsed: current ? 0 : 1, pinned: p[cardId]?.pinned ?? 0, pin_order: p[cardId]?.pin_order ?? 0 },
    }));
    await api.updateCardPreference(cardId, { collapsed: !current });
  };

  const togglePin = async (cardId: string) => {
    const current = isPinned(cardId);
    const newPinOrder = current ? 0 : Date.now();
    setPrefs((p) => ({
      ...p,
      [cardId]: { ...p[cardId], card_id: cardId, pinned: current ? 0 : 1, pin_order: current ? 0 : newPinOrder, collapsed: p[cardId]?.collapsed ?? 0 },
    }));
    await api.updateCardPreference(cardId, { pinned: !current, pin_order: current ? 0 : newPinOrder });
  };

  const allCards: CardItem[] = [
    { type: "system", id: "system-resources" },
    ...services.map((svc): CardItem => ({ type: "service", id: svc.name, service: svc })),
    { type: "train", id: "train-status" },
    { type: "blog", id: "blog-traffic" },
    { type: "claude", id: "claude-usage" },
    { type: "agent", id: "agent-control" },
    { type: "goals", id: "project-goals" },
    { type: "launchagents", id: "launchagents" },
  ];

  // 탭별 필터링
  const filteredCards = allCards.filter((card) => {
    if (activeTab === "all") return true;
    if (activeTab === "services") return card.type === "service";
    if (activeTab === "tools") return card.type !== "service";
    return true;
  });

  // pinned 카드 먼저, 그 다음 나머지
  const sortedCards = [...filteredCards].sort((a, b) => {
    const aPinned = isPinned(a.id);
    const bPinned = isPinned(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    if (aPinned && bPinned) {
      return (prefs[a.id]?.pin_order ?? 0) - (prefs[b.id]?.pin_order ?? 0);
    }
    return 0;
  });

  // 서비스 상태 요약
  const runningCount = services.filter((s) => s.status === "running").length;
  const downCount = services.filter((s) => s.status === "down").length;
  const stoppedCount = services.length - runningCount - downCount;

  const cardProps = (id: string) => ({
    collapsed: isCollapsed(id),
    pinned: isPinned(id),
    onToggleCollapse: () => toggleCollapse(id),
    onTogglePin: () => togglePin(id),
  });

  const tabs = [
    { id: "all" as TabType, label: "전체", icon: <LayoutGrid size={14} /> },
    { id: "services" as TabType, label: "서비스", icon: <Server size={14} /> },
    { id: "tools" as TabType, label: "도구", icon: <Zap size={14} /> },
  ];

  return (
    <div className="min-h-screen">
      <Header username={username} onLogout={onLogout} />

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* 상단 요약 바 */}
        <div className="bg-surface border border-border rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-success status-pulse" />
                <span className="text-sm text-text-muted">Running</span>
                <span className="text-lg font-bold text-success">{runningCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-danger" />
                <span className="text-sm text-text-muted">Down</span>
                <span className="text-lg font-bold text-danger">{downCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-text-muted/40" />
                <span className="text-sm text-text-muted">Stopped</span>
                <span className="text-lg font-bold text-text-muted">{stoppedCount}</span>
              </div>
            </div>
            <button
              onClick={fetchServices}
              className="text-sm text-text-muted hover:text-text border border-border rounded-lg px-3 py-1.5 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw size={14} />
              새로고침
            </button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex items-center gap-1 mb-6 bg-surface p-1 rounded-xl border border-border w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-white"
                  : "text-text-muted hover:text-text hover:bg-surface-hover"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/20 text-danger rounded-lg px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-text-muted py-12">Loading...</div>
        ) : sortedCards.length === 0 ? (
          <div className="text-center text-text-muted py-12">
            {activeTab === "services" ? "서비스가 없습니다" : activeTab === "tools" ? "도구가 없습니다" : "표시할 항목이 없습니다"}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedCards.map((card) => {
              let content: React.ReactNode;
              switch (card.type) {
                case "service":
                  content = (
                    <ServiceCard
                      service={card.service}
                      {...cardProps(card.id)}
                      onClick={() => {
                        if (card.id === "content-pipeline") {
                          setShowAgentTasks(true);
                        } else {
                          setSelectedService(card.id);
                        }
                      }}
                      onRefresh={fetchServices}
                      onShowLogs={() => setLogService(card.id)}
                      badge={card.id === "content-pipeline" && pendingApprovals > 0
                        ? { count: pendingApprovals, label: "승인 대기" }
                        : undefined}
                    />
                  );
                  break;
                case "system":
                  content = <SystemResources {...cardProps(card.id)} />;
                  break;
                case "claude":
                  content = <ClaudeUsage {...cardProps(card.id)} />;
                  break;
                case "blog":
                  content = <BlogTraffic {...cardProps(card.id)} />;
                  break;
                case "train":
                  content = <TrainStatus {...cardProps(card.id)} />;
                  break;
                case "launchagents":
                  content = <LaunchAgents {...cardProps(card.id)} />;
                  break;
                case "agent":
                  content = <AgentControl {...cardProps(card.id)} />;
                  break;
                case "goals":
                  content = <ProjectGoals {...cardProps(card.id)} />;
                  break;
                default:
                  content = null;
              }
              return (
                <ErrorBoundary key={card.id} name={card.id}>
                  {content}
                </ErrorBoundary>
              );
            })}
          </div>
        )}
      </main>

      {selectedService && (
        <CommitPanel
          serviceName={selectedService}
          onClose={() => setSelectedService(null)}
        />
      )}

      {logService && (
        <LogViewer
          serviceName={logService}
          onClose={() => setLogService(null)}
        />
      )}

      {showAgentTasks && (
        <AgentTasksPanel
          onClose={() => { setShowAgentTasks(false); fetchPendingApprovals(); }}
        />
      )}
    </div>
  );
}
