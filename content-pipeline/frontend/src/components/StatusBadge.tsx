interface Props {
  status: string;
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  success: "bg-success/15 text-success",
  running: "bg-primary/15 text-primary",
  failed: "bg-danger/15 text-danger",
  pending: "bg-text-muted/15 text-text-muted",
  // Pipeline statuses
  keyword_collecting: "bg-warning/15 text-warning",
  generating: "bg-primary/15 text-primary",
  reviewing: "bg-warning/15 text-warning",
  completed: "bg-success/15 text-success",
  // Draft statuses
  researched: "bg-text-muted/15 text-text-muted",
  written: "bg-primary/15 text-primary",
  reviewed: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  published: "bg-success/15 text-success",
  rejected: "bg-danger/15 text-danger",
};

const STATUS_LABELS: Record<string, string> = {
  success: "Success",
  running: "Running",
  failed: "Failed",
  pending: "Pending",
  keyword_collecting: "Collecting",
  generating: "Generating",
  reviewing: "Reviewing",
  completed: "Completed",
  researched: "Researched",
  written: "Written",
  reviewed: "Reviewed",
  approved: "Approved",
  published: "Published",
  rejected: "Rejected",
};

export function StatusBadge({ status, className = "" }: Props) {
  const color = STATUS_COLORS[status] || "bg-text-muted/15 text-text-muted";
  const label = STATUS_LABELS[status] || status;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${color} ${className}`}>
      {label}
    </span>
  );
}
