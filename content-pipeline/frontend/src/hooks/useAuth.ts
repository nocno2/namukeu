import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

export function useAuth() {
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((data) => setUsername(data.username))
      .catch(() => setUsername(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (user: string, password: string) => {
    const data = await api.login(user, password);
    setUsername(data.username);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUsername(null);
  }, []);

  return { username, loading, login, logout, isAuthenticated: !!username };
}
