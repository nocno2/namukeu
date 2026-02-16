import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Draft, SeoScore, ReadabilityScore, AiReview } from "../lib/api";
import { StatusBadge } from "../components/StatusBadge";

const TABS = [
  { value: "", label: "All" },
  { value: "reviewed", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
  { value: "rejected", label: "Rejected" },
];

export function PipelinePage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [tab, setTab] = useState("");
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerKeyword, setTriggerKeyword] = useState("");
  const [triggerDirection, setTriggerDirection] = useState("");

  const load = useCallback(() => {
    api.getDrafts(tab || undefined).then((d) => setDrafts(d.drafts)).catch(() => {});
  }, [tab]);

  useEffect(load, [load]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await api.triggerPipeline(triggerKeyword || undefined, triggerDirection || undefined);
      setTriggerKeyword("");
      setTriggerDirection("");
      setTimeout(load, 2000);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Pipeline</h2>
        <div className="flex items-center gap-2">
          <input
            value={triggerKeyword}
            onChange={(e) => setTriggerKeyword(e.target.value)}
            placeholder="Keyword (optional)"
            className="bg-bg border border-border rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:border-primary"
          />
          <input
            value={triggerDirection}
            onChange={(e) => setTriggerDirection(e.target.value)}
            placeholder="Direction (optional)"
            className="bg-bg border border-border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            {triggering ? "..." : "Run Pipeline"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-px">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-2 text-sm transition-colors cursor-pointer border-b-2 -mb-px ${
              tab === t.value
                ? "border-primary text-primary font-medium"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Draft List */}
      {drafts.length === 0 ? (
        <p className="text-sm text-text-muted">No drafts found.</p>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onClick={() => setSelectedDraft(draft)}
            />
          ))}
        </div>
      )}

      {/* Draft Detail Modal */}
      {selectedDraft && (
        <DraftDetailModal
          draft={selectedDraft}
          onClose={() => setSelectedDraft(null)}
          onAction={load}
        />
      )}
    </div>
  );
}

function DraftCard({ draft, onClick }: { draft: Draft; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-surface border border-border rounded-xl p-4 hover:bg-surface-hover transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={draft.status} />
            <span className="text-xs text-text-muted">{draft.keyword}</span>
            {draft.reviewScore != null && (
              <span className={`text-xs font-medium ${draft.reviewScore >= 70 ? "text-success" : draft.reviewScore >= 50 ? "text-warning" : "text-danger"}`}>
                SEO: {draft.reviewScore}
              </span>
            )}
          </div>
          <h3 className="text-sm font-medium truncate">{draft.title || "Untitled"}</h3>
          {draft.excerpt && (
            <p className="text-xs text-text-muted mt-1 line-clamp-2">{draft.excerpt}</p>
          )}
        </div>
        <span className="text-xs text-text-muted ml-4 shrink-0">
          {new Date(draft.createdAt).toLocaleDateString("ko-KR")}
        </span>
      </div>
    </button>
  );
}

function DraftDetailModal({
  draft,
  onClose,
  onAction,
}: {
  draft: Draft;
  onClose: () => void;
  onAction: () => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reviewResult, setReviewResult] = useState<{ seo: SeoScore; readability: ReadabilityScore; ai_review?: AiReview } | null>(null);

  const handleReview = async () => {
    setReviewing(true);
    try {
      const result = await api.reviewDraft(draft.id);
      setReviewResult(result);
      onAction();
    } finally {
      setReviewing(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await api.approveDraft(draft.id);
      onAction();
      onClose();
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      await api.rejectDraft(draft.id, rejectReason);
      onAction();
      onClose();
    } finally {
      setRejecting(false);
    }
  };

  // Parse review feedback
  let feedback: { seo?: SeoScore; readability?: ReadabilityScore; ai_review?: AiReview } = {};
  if (draft.reviewFeedback) {
    try { feedback = JSON.parse(draft.reviewFeedback); } catch { /* ignore */ }
  }
  const seo = reviewResult?.seo || feedback.seo;
  const readability = reviewResult?.readability || feedback.readability;
  const aiReview = reviewResult?.ai_review || feedback.ai_review;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-surface border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusBadge status={draft.status} />
            <span className="text-sm text-text-muted">{draft.keyword}</span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text text-lg cursor-pointer">X</button>
        </div>

        <div className="p-5 space-y-5">
          <h2 className="text-lg font-semibold">{draft.title || "Untitled"}</h2>

          {/* Review Scores */}
          {seo && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-bg border border-border rounded-lg p-3">
                <p className="text-xs text-text-muted mb-1">SEO Score</p>
                <p className={`text-2xl font-bold ${seo.score >= 7 ? "text-success" : seo.score >= 5 ? "text-warning" : "text-danger"}`}>
                  {seo.score}/10
                </p>
                <div className="mt-2 space-y-1">
                  {Object.entries(seo.checks).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <span>{v ? "O" : "X"}</span>
                      <span className="text-text-muted">{k.replace(/_/g, " ")}</span>
                    </div>
                  ))}
                </div>
              </div>
              {readability && (
                <div className="bg-bg border border-border rounded-lg p-3">
                  <p className="text-xs text-text-muted mb-1">Readability</p>
                  <p className={`text-2xl font-bold ${readability.score >= 7 ? "text-success" : "text-warning"}`}>
                    {readability.score}/10
                  </p>
                  <div className="mt-2 space-y-1 text-xs text-text-muted">
                    <p>Sentences: {readability.sentence_count}</p>
                    <p>Avg sentence: {readability.avg_sentence_length} words</p>
                    <p>Paragraphs: {readability.paragraph_count}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Content Review */}
          {aiReview && (
            <div className="bg-bg border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">AI Content Review</p>
                <span className={`text-lg font-bold ${aiReview.overall >= 7 ? "text-success" : aiReview.overall >= 5 ? "text-warning" : "text-danger"}`}>
                  {aiReview.overall}/10
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(aiReview.scores).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between bg-surface rounded px-2 py-1">
                    <span className="text-text-muted">
                      {k === "analogy_appropriateness" ? "비유 적정성" :
                       k === "technical_depth" ? "기술적 깊이" :
                       k === "target_consistency" ? "타겟 일관성" :
                       k === "conclusion_effectiveness" ? "결론 실효성" : k}
                    </span>
                    <span className={`font-medium ${v >= 7 ? "text-success" : v >= 5 ? "text-warning" : "text-danger"}`}>{v}</span>
                  </div>
                ))}
              </div>
              {aiReview.sharp_criticisms.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-danger mb-1">날카로운 비판</p>
                  <ul className="text-xs text-text-muted space-y-1">
                    {aiReview.sharp_criticisms.map((c, i) => <li key={i}>• {c}</li>)}
                  </ul>
                </div>
              )}
              {aiReview.technical_suggestions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-primary mb-1">기술적 보강 제안</p>
                  <ul className="text-xs text-text-muted space-y-1">
                    {aiReview.technical_suggestions.map((s, i) => <li key={i}>• {s}</li>)}
                  </ul>
                </div>
              )}
              <p className="text-xs italic text-text-muted border-t border-border pt-2">
                "{aiReview.one_liner}"
              </p>
            </div>
          )}

          {/* Content Preview */}
          <div className="bg-bg border border-border rounded-lg p-4 max-h-96 overflow-y-auto">
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
              {draft.revisedContent || draft.content || "No content"}
            </pre>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            {draft.status === "written" && (
              <button
                onClick={handleReview}
                disabled={reviewing}
                className="bg-warning/15 text-warning px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50"
              >
                {reviewing ? "Reviewing..." : "Run Review"}
              </button>
            )}
            {(draft.status === "reviewed" || draft.status === "written") && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className="bg-success/15 text-success px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50"
                >
                  {approving ? "..." : "Approve & Publish"}
                </button>
                {!showRejectForm ? (
                  <button
                    onClick={() => setShowRejectForm(true)}
                    className="bg-danger/15 text-danger px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                  >
                    Reject
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Reason..."
                      className="bg-bg border border-border rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      onClick={handleReject}
                      disabled={rejecting}
                      className="bg-danger text-white px-3 py-2 rounded-lg text-sm cursor-pointer disabled:opacity-50"
                    >
                      {rejecting ? "..." : "Confirm"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
