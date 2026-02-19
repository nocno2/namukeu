import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, RefreshCw, Server, Zap } from "lucide-react";
import { api, type CardPreference, type ServiceStatus } from "../lib/api";
import { AutomationHub } from "./AutomationHub";
import { BlogTraffic } from "./BlogTraffic";
import { ClaudeUsage } from "./ClaudeUsage";
import { CoinBacktestStatus } from "./CoinBacktestStatus";
import { CommitPanel } from "./CommitPanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { Header } from "./Header";
import { LogViewer } from "./LogViewer";
import { N8nStatus } from "./N8nStatus";
import { RevenueDashboard } from "./RevenueDashboard";
import { ServiceCard } from "./ServiceCard";
import { SystemResources } from "./SystemResources";
import { TrainStatus } from "./TrainStatus";

interface Props {
  username: string;
  onLogout: () => void;
}

const POLL_INTERVAL_DEFAULT = 30_000;
const POLL_INTERVAL_RUNNING = 60_000;
const POLL_INTERVAL_DOWN = 10_000;

// 서비스 상태에 따른 적응형 폴링 간격 계산
function calculatePollInterval(services: ServiceStatus[]): number {
  if (services.length === 0) return POLL_INTERVAL_DEFAULT;

  const downCount = services.filter((s) => s.status === "down").length;
  const runningCount = services.filter((s) => s.status === "running").length;

  // down 서비스가 있으면 빠른 폴링
  if (downCount > 0) return POLL_INTERVAL_DOWN;

  // running 서비스가大多数면 느린 폴링
  if (runningCount > services.length / 2) return POLL_INTERVAL_RUNNING;

  return POLL_INTERVAL_DEFAULT;
}

type TabType = "all" | "services" | "tools";

type CardItem =
  | { type: "service"; id: string; service: ServiceStatus }
  | { type: "claude"; id: string }
  | { type: "system"; id: string }
  | { type: "blog"; id: string }
  | { type: "train"; id: string }
  | { type: "automation"; id: string }
  | { type: "n8n"; id: string }
  | { type: "coin"; id: string }
  | { type: "revenue"; id: string };

export function Dashboard({ username, onLogout }: Props) {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [error, setError] = useState("");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [logService, setLogService] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Record<string, CardPreference>>({});
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [servicesLoading, setServicesLoading] = useState(true);

  const fetchServices = useCallback(async () => {
    try {
      const data = await api.services();
      setServices(data.services);
      setError("");
    } catch {
      setError("서비스 상태를 불러올 수 없습니다.");
    } finally {
      setServicesLoading(false);
    }
  }, []);

  const fetchPrefs = useCallback(async () => {
    try {
      const data = await api.cardPreferences();
      setPrefs(data.preferences);
    } catch { /* ignore */ }
  }, []);

  // 적응형 폴링 간격
  const pollInterval = calculatePollInterval(services);

  useEffect(() => {
    fetchServices();
    fetchPrefs();
  }, [fetchServices, fetchPrefs]);

  useEffect(() => {
    const interval = setInterval(fetchServices, pollInterval);
    return () => { clearInterval(interval); };
  }, [fetchServices, pollInterval]);

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
    { type: "coin", id: "coin-backtest" },
    { type: "blog", id: "blog-traffic" },
    { type: "revenue", id: "revenue-dashboard" },
    { type: "claude", id: "claude-usage" },
    { type: "n8n", id: "n8n-status" },
    { type: "automation", id: "automation-hub" },
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

  const cardProps = (id: string) => ({
    collapsed: isCollapsed(id),
    pinned: isPinned(id),
    onToggleCollapse: () => toggleCollapse(id),
    onTogglePin: () => togglePin(id),
    onRefresh: fetchServices,
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
              <div className="flex items-center gap-2 text-xs text-text-muted/60">
                <span className="font-mono">{pollInterval / 1000}s</span>
                <span className="text-[10px]">폴링 간격</span>
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

        {servicesLoading && sortedCards.length === 0 ? (
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
                      onClick={() => setSelectedService(card.id)}
                      onRefresh={fetchServices}
                      onShowLogs={() => setLogService(card.id)}
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
                case "coin":
                  content = <CoinBacktestStatus {...cardProps(card.id)} />;
                  break;
                case "revenue":
                  content = <RevenueDashboard {...cardProps(card.id)} />;
                  break;
                case "n8n":
                  content = <N8nStatus {...cardProps(card.id)} />;
                  break;
                case "automation":
                  content = <AutomationHub {...cardProps(card.id)} />;
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
    </div>
  );
}
