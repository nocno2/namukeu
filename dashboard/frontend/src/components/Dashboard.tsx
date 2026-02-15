import { useCallback, useEffect, useState } from "react";
import { api, type CardPreference, type ServiceStatus } from "../lib/api";
import { AgentControl } from "./AgentControl";
import { BlogTraffic } from "./BlogTraffic";
import { ClaudeUsage } from "./ClaudeUsage";
import { CommitPanel } from "./CommitPanel";
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

  useEffect(() => {
    fetchServices();
    fetchPrefs();
    const interval = setInterval(fetchServices, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchServices, fetchPrefs]);

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

  const sortedCards = [...allCards].sort((a, b) => {
    const aPinned = isPinned(a.id);
    const bPinned = isPinned(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    if (aPinned && bPinned) {
      return (prefs[a.id]?.pin_order ?? 0) - (prefs[b.id]?.pin_order ?? 0);
    }
    return 0;
  });

  const runningCount = services.filter((s) => s.status === "running").length;
  const totalCount = services.length;

  const cardProps = (id: string) => ({
    collapsed: isCollapsed(id),
    pinned: isPinned(id),
    onToggleCollapse: () => toggleCollapse(id),
    onTogglePin: () => togglePin(id),
  });

  return (
    <div className="min-h-screen">
      <Header username={username} onLogout={onLogout} />

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Services</h2>
            <p className="text-sm text-text-muted">
              {runningCount}/{totalCount} running
            </p>
          </div>
          <button
            onClick={fetchServices}
            className="text-sm text-text-muted hover:text-text border border-border rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
          >
            새로고침
          </button>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/20 text-danger rounded-lg px-4 py-3 text-sm mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-text-muted py-12">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedCards.map((card) => {
              switch (card.type) {
                case "service":
                  return (
                    <ServiceCard
                      key={card.id}
                      service={card.service}
                      {...cardProps(card.id)}
                      onClick={() => setSelectedService(card.id)}
                      onRefresh={fetchServices}
                      onShowLogs={() => setLogService(card.id)}
                    />
                  );
                case "system":
                  return <SystemResources key={card.id} {...cardProps(card.id)} />;
                case "claude":
                  return <ClaudeUsage key={card.id} {...cardProps(card.id)} />;
                case "blog":
                  return <BlogTraffic key={card.id} {...cardProps(card.id)} />;
                case "train":
                  return <TrainStatus key={card.id} {...cardProps(card.id)} />;
                case "launchagents":
                  return <LaunchAgents key={card.id} {...cardProps(card.id)} />;
                case "agent":
                  return <AgentControl key={card.id} {...cardProps(card.id)} />;
                case "goals":
                  return <ProjectGoals key={card.id} {...cardProps(card.id)} />;
                default:
                  return null;
              }
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
