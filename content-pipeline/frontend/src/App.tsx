import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./components/LoginPage";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/Dashboard";
import { TasksPage } from "./pages/Tasks";
import { PipelinePage } from "./pages/Pipeline";
import { HistoryPage } from "./pages/History";

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

  return (
    <BrowserRouter>
      <Layout username={auth.username!} onLogout={auth.logout}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
