import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

const navItems = [
  { path: '/', label: '대시보드', icon: '◈' },
  { path: '/portfolio', label: '포트폴리오', icon: '◉' },
  { path: '/chart', label: '차트', icon: '📈' },
  { path: '/stocks', label: '종목', icon: '📊' },
  { path: '/trading', label: '주문', icon: '💳' },
  { path: '/strategies', label: '전략', icon: '⚡' },
  { path: '/news', label: '뉴스', icon: '📰' },
  { path: '/alerts', label: '알림', icon: '🔔' },
  { path: '/watchlist', label: '관심종목', icon: '★' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-[#0d1117]">
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-[#161b22] rounded-lg border border-[#30363d]"
      >
        <span className="text-xl">{sidebarOpen ? '✕' : '☰'}</span>
      </button>

      {/* Sidebar - desktop always visible, mobile overlay */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40 w-64 bg-[#161b22] border-r border-[#30363d] flex flex-col transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-5 border-b border-[#30363d]">
          <h1 className="text-xl font-bold">
            <span className="text-[#58a6ff]">TRADE</span>
            <span className="text-[#8b949e] text-sm ml-1">Pro</span>
          </h1>
          <p className="text-xs text-[#6e7681] mt-1">Stock Trading Platform</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-[#21262d] text-[#f0f6fc] shadow-sm'
                    : 'text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-[#30363d]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#58a6ff] to-[#a371f7] flex items-center justify-center text-white text-sm font-bold">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#f0f6fc] truncate">{user?.username}</div>
              <div className="text-xs text-[#6e7681]">Premium</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-sm text-[#8b949e] hover:text-[#f0f6fc] transition-colors py-2"
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-[#0d1117] lg:ml-0">
        {/* Mobile menu button spacer */}
        <div className="lg:hidden" style={{ height: '56px' }} />
        <Outlet />
      </main>
    </div>
  );
}
