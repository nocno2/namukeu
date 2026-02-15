import { useEffect, useState } from "react";
import { api, type Commit } from "../lib/api";

interface Props {
  serviceName: string;
  onClose: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR");
}

export function CommitPanel({ serviceName, onClose }: Props) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .commits(serviceName)
      .then((data) => setCommits(data.commits))
      .catch(() => setError("커밋 정보를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, [serviceName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">
            {serviceName}{" "}
            <span className="text-text-muted font-normal">최근 커밋</span>
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-lg leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 py-3 flex-1">
          {loading && (
            <div className="text-text-muted text-sm py-8 text-center">
              Loading...
            </div>
          )}

          {error && (
            <div className="text-danger text-sm py-8 text-center">{error}</div>
          )}

          {!loading && !error && commits.length === 0 && (
            <div className="text-text-muted text-sm py-8 text-center">
              커밋 기록이 없습니다.
            </div>
          )}

          <div className="space-y-0">
            {commits.map((commit) => (
              <div
                key={commit.hash}
                className="py-3 border-b border-border last:border-0"
              >
                <div className="flex items-start gap-3">
                  <code className="text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                    {commit.short_hash}
                  </code>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug break-words">
                      {commit.message}
                    </p>
                    <div className="flex gap-2 mt-1 text-[11px] text-text-muted">
                      <span>{commit.author}</span>
                      <span>·</span>
                      <span>{timeAgo(commit.date)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
