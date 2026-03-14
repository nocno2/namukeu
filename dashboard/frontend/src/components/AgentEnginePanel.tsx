import { useCallback, useEffect, useState } from "react";
import { Bot, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { api } from "../lib/api";

interface Props {
  collapsed: boolean;
  pinned: boolean;
  onToggleCollapse: () => void;
  onTogglePin: () => void;
}

interface DcBotSettings {
  channels: Record<string, { engine: string }>;
  defaultEngine: string;
}

interface ChannelInfo {
  channel_id: string;
  last_message_at: string | null;
}

interface AgentEngineSettings {
  dcbot: DcBotSettings;
  contentPipeline: { engine: string };
}

interface UsageStats {
  claude: { costUsd: number; requests: number };
  gemini: { tokens: number; requests: number };
  lastUpdated: string;
}

const DEFAULT_SETTINGS: AgentEngineSettings = {
  dcbot: { channels: {}, defaultEngine: "claude" },
  contentPipeline: { engine: "claude" },
};

const DEFAULT_USAGE: UsageStats = {
  claude: { costUsd: 0, requests: 0 },
  gemini: { tokens: 0, requests: 0 },
  lastUpdated: "",
};

export function AgentEnginePanel({
  collapsed,
  pinned,
  onToggleCollapse,
  onTogglePin,
}: Props) {
  const [settings, setSettings] = useState<AgentEngineSettings>(DEFAULT_SETTINGS);
  const [usage, setUsage] = useState<UsageStats>(DEFAULT_USAGE);
  const [knownChannels, setKnownChannels] = useState<ChannelInfo[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dcbot, agentEngine, dcbotUsage, channels] = await Promise.all([
        api.dcbotSettings().catch(() => DEFAULT_SETTINGS.dcbot),
        api.agentEngine().catch(() => ({ engine: "claude" })),
        api.dcbotUsage().catch(() => DEFAULT_USAGE),
        api.dcbotChannels().catch(() => ({ channels: [] })),
      ]);
      setSettings({
        dcbot,
        contentPipeline: { engine: agentEngine.engine },
      });
      setUsage(dcbotUsage);
      setKnownChannels(channels.channels || []);
      // Auto-select first channel if none selected
      if (!selectedChannel && channels.channels && channels.channels.length > 0) {
        setSelectedChannel(channels.channels[0].channel_id);
      }
    } catch (err) {
      setError("설정을 불러오는데 실패했습니다");
    } finally {
      setLoading(false);
    }
  }, [selectedChannel]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleDcbotDefaultChange = async (engine: "claude" | "gemini") => {
    setSaving("dcbot-default");
    try {
      await api.setDcbotDefaultEngine(engine);
      setSettings((prev) => ({
        ...prev,
        dcbot: { ...prev.dcbot, defaultEngine: engine },
      }));
    } catch (err) {
      setError("기본 엔진 변경에 실패했습니다");
    } finally {
      setSaving(null);
    }
  };

  const handleChannelEngineChange = async (channelId: string, engine: "claude" | "gemini") => {
    setSaving(`channel-${channelId}`);
    try {
      await api.setDcbotChannelEngine(channelId, engine);
      setSettings((prev) => ({
        ...prev,
        dcbot: {
          ...prev.dcbot,
          channels: { ...prev.dcbot.channels, [channelId]: { engine } },
        },
      }));
    } catch (err) {
      setError("채널 엔진 변경에 실패했습니다");
    } finally {
      setSaving(null);
    }
  };

  const handleContentPipelineChange = async (engine: "claude" | "gemini") => {
    setSaving("content-pipeline");
    try {
      await api.setAgentEngine(engine);
      setSettings((prev) => ({
        ...prev,
        contentPipeline: { engine },
      }));
    } catch (err) {
      setError("Agent 엔진 변경에 실패했습니다");
    } finally {
      setSaving(null);
    }
  };

  const renderEngineSelect = (
    value: string,
    onChange: (v: "claude" | "gemini") => void,
    disabled: boolean
  ) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as "claude" | "gemini")}
      disabled={disabled}
      className={`px-2 py-1 rounded border text-sm bg-bg text-text border-border ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <option value="claude">Claude</option>
      <option value="gemini">Gemini</option>
    </select>
  );

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <h2 className="text-text font-semibold">Agent Engine</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={loadSettings}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onTogglePin}
            className={`p-1.5 rounded-lg ${pinned ? "text-warning" : "text-text-muted hover:text-text"}`}
            title={pinned ? "고정 해제" : "고정"}
          >
            {pinned ? "📌" : "📍"}
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted"
          >
            {collapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-2 text-sm text-danger bg-danger/10 rounded-lg border border-danger/20">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-4 text-text-muted">로딩 중...</div>
          ) : (
            <>
              {/* Content-Pipeline Agent */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-text">Content-Pipeline</div>
                  <div className="text-xs text-text-muted">자동화 작업 에이전트</div>
                </div>
                {renderEngineSelect(
                  settings.contentPipeline.engine,
                  handleContentPipelineChange,
                  saving === "content-pipeline"
                )}
              </div>

              {/* DCBOT Default */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-text">DCBOT (기본)</div>
                  <div className="text-xs text-text-muted">디코봇 기본 엔진</div>
                </div>
                {renderEngineSelect(
                  settings.dcbot.defaultEngine,
                  handleDcbotDefaultChange,
                  saving === "dcbot-default"
                )}
              </div>

              {/* DCBOT Channels */}
              <div className="border-t border-border pt-4 mt-4">
                <div className="text-sm font-medium text-text mb-2">DCBOT 채널별 설정</div>

                {/* Channel selector */}
                {knownChannels.length > 0 ? (
                  <div className="flex gap-2 mb-3">
                    <select
                      value={selectedChannel}
                      onChange={(e) => setSelectedChannel(e.target.value)}
                      className="flex-1 px-2 py-1.5 text-sm bg-bg border border-border rounded-lg text-text"
                    >
                      <option value="">채널 선택...</option>
                      {knownChannels.map((ch) => (
                        <option key={ch.channel_id} value={ch.channel_id}>
                          #{ch.channel_id}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="text-xs text-text-muted mb-3">대화 기록이 있는 채널이 없습니다</div>
                )}

                {/* Selected channel engine control */}
                {selectedChannel && (
                  <div className="flex items-center justify-between text-sm bg-bg rounded-lg px-3 py-2 border border-border">
                    <span className="text-text">#{selectedChannel}</span>
                    {renderEngineSelect(
                      settings.dcbot.channels[selectedChannel]?.engine || settings.dcbot.defaultEngine,
                      (e) => handleChannelEngineChange(selectedChannel, e),
                      saving === `channel-${selectedChannel}`
                    )}
                  </div>
                )}
              </div>

              {/* Usage Stats */}
              <div className="border-t border-border pt-4 mt-4">
                <div className="text-sm font-medium text-text mb-3">오늘의 사용량</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-bg rounded-lg p-3 border border-border">
                    <div className="text-xs text-text-muted mb-1">Claude</div>
                    <div className="text-lg font-semibold text-primary">
                      ${usage.claude.costUsd.toFixed(4)}
                    </div>
                    <div className="text-xs text-text-muted">{usage.claude.requests}회</div>
                  </div>
                  <div className="bg-bg rounded-lg p-3 border border-border">
                    <div className="text-xs text-text-muted mb-1">Gemini</div>
                    <div className="text-lg font-semibold text-purple-500">
                      {usage.gemini.tokens.toLocaleString()}
                    </div>
                    <div className="text-xs text-text-muted">{usage.gemini.requests}회</div>
                  </div>
                </div>
              </div>

              <div className="text-xs text-text-muted pt-2">
                Claude: session 유지, Gemini: 빠른 응답 (session 미지원)
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
