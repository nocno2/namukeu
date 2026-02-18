import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

interface Props {
  serviceName: string;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function colorize(line: string): string {
  if (/\bERROR\b/i.test(line) || /\bException\b/.test(line) || /\bTraceback\b/.test(line)) return "text-danger";
  if (/\bWARN(ING)?\b/i.test(line)) return "text-warning";
  if (/\bINFO\b/i.test(line)) return "text-text-muted";
  return "";
}

export function LogViewer({ serviceName, onClose }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lineCount, setLineCount] = useState(50);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    api.serviceLogs(serviceName, lineCount).then((data) => {
      setLines(data.lines);
      setTotalSize(data.total_size);
      setLoading(false);
    }).catch(() => {
      setLines(["로그를 불러올 수 없습니다."]);
      setLoading(false);
    });
  }, [serviceName, lineCount]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, refreshKey]);

  useEffect(() => {
    const el = document.getElementById("log-bottom");
    el?.scrollIntoView();
  }, [lines]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div>
            <h3 className="font-semibold text-sm">{serviceName} — Error Log</h3>
            <span className="text-[10px] text-text-muted">{formatSize(totalSize)}</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={lineCount}
              onChange={(e) => setLineCount(Number(e.target.value))}
              className="text-xs bg-bg border border-border rounded px-2 py-1 text-text"
            >
              <option value={50}>50줄</option>
              <option value={100}>100줄</option>
              <option value={200}>200줄</option>
            </select>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="text-xs text-text-muted hover:text-text border border-border rounded px-2 py-1"
            >
              새로고침
            </button>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text p-1"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Log content */}
        <div className="flex-1 overflow-auto p-4 bg-bg/50">
          {loading ? (
            <div className="text-text-muted text-sm text-center py-8">Loading...</div>
          ) : lines.length === 0 ? (
            <div className="text-text-muted text-sm text-center py-8">로그가 비어있습니다.</div>
          ) : (
            <pre className="text-[11px] font-mono leading-5 whitespace-pre-wrap break-all">
              {lines.map((line, i) => (
                <div key={i} className={colorize(line)}>{line}</div>
              ))}
              <div id="log-bottom" />
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
