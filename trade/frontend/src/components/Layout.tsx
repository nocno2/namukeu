import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

const navItems = [
  { path: '/', label: '대시보드', icon: '📊' },
  { path: '/portfolio', label: '포트폴리오', icon: '💼' },
  { path: '/chart', label: '차트', icon: '📈' },
  { path: '/trading', label: '주문', icon: '💰' },
  { path: '/strategies', label: '전략', icon: '🤖' },
  { path: '/news', label: '뉴스', icon: '📰' },
  { path: '/alerts', label: '알림', icon: '🔔' },
  { path: '/watchlist', label: '관심종목', icon: '⭐' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-[--bg-primary]">
      {/* Sidebar */}
      <aside className="w-56 bg-[--bg-secondary] border-r border-[--border] flex flex-col">
        <div className="p-4 border-b border-[--border]">
          <h1 className="text-xl font-bold text-[--accent]">TRADE</h1>
          <p className="text-xs text-[--text-secondary]">Stock Trading Platform</p>
        </div>

        <nav className="flex-1 p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                  isActive
                    ? 'bg-[--accent] text-white'
                    : 'text-[--text-secondary] hover:bg-[--bg-card] hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-[--border]">
          <div className="text-sm text-[--text-secondary] mb-2">
            {user?.username}
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-sm text-[--text-secondary] hover:text-white transition-colors"
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
