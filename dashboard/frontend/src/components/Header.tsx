import { LayoutDashboard, LogOut, User } from "lucide-react";

interface Props {
  username: string;
  onLogout: () => void;
}

export function Header({ username, onLogout }: Props) {
  return (
    <header className="border-b border-border/60 px-6 py-4 flex items-center justify-between bg-surface/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
          <LayoutDashboard size={18} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-text">namukeu</h1>
          <span className="text-[10px] text-text-muted -mt-0.5 block">dashboard</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-text-muted bg-surface-hover px-3 py-1.5 rounded-lg border border-border/50">
          <User size={14} />
          <span>{username}</span>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-text-muted hover:text-text transition-colors cursor-pointer flex items-center gap-1.5 hover:bg-surface-hover px-2.5 py-1.5 rounded-lg"
        >
          <LogOut size={14} />
          로그아웃
        </button>
      </div>
    </header>
  );
}
