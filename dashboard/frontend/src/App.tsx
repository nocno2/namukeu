import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./components/LoginPage";
import { Dashboard } from "./components/Dashboard";

export function App() {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-text-muted">Loading...</div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <LoginPage onLogin={auth.login} />;
  }

  return <Dashboard username={auth.username!} onLogout={auth.logout} />;
}
