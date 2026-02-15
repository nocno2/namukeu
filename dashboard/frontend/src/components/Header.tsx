interface Props {
  username: string;
  onLogout: () => void;
}

export function Header({ username, onLogout }: Props) {
  return (
    <header className="border-b border-border px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">namukeu.com</h1>
        <span className="text-xs text-text-muted bg-surface px-2 py-0.5 rounded-full border border-border">
          dashboard
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-text-muted">{username}</span>
        <button
          onClick={onLogout}
          className="text-sm text-text-muted hover:text-text transition-colors cursor-pointer"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
