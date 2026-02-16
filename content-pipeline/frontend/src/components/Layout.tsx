import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

interface Props {
  username: string;
  onLogout: () => void;
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
  { to: "/tasks", label: "Tasks" },
  { to: "/pipeline", label: "Pipeline" },
  { to: "/history", label: "History" },
];

export function Layout({ username, onLogout, children }: Props) {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold tracking-tight">Content Pipeline</h1>
            <nav className="flex gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-text-muted hover:text-text hover:bg-surface-hover"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-text-muted">{username}</span>
            <button
              onClick={onLogout}
              className="text-sm text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
