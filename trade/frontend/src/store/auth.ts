import { create } from 'zustand';
import { authApi } from '../api/client';

interface User {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isAuthenticated: !!localStorage.getItem('token'),

  login: async (username: string, password: string) => {
    set({ isLoading: true });
    try {
      const response = await authApi.login(username, password);
      const { access_token } = response.data;
      localStorage.setItem('token', access_token);
      set({ isAuthenticated: true, isLoading: false });
      await authApi.me().then((res) => set({ user: res.data }));
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (username: string, email: string, password: string) => {
    set({ isLoading: true });
    try {
      await authApi.register({ username, email, password });
      // Auto login after register
      await authApi.login(username, password).then((res) => {
        const { access_token } = res.data;
        localStorage.setItem('token', access_token);
        set({ isAuthenticated: true, isLoading: false });
      });
      await authApi.me().then((res) => set({ user: res.data }));
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, isAuthenticated: false });
  },

  fetchUser: async () => {
    if (!localStorage.getItem('token')) {
      set({ isAuthenticated: false });
      return;
    }
    try {
      const response = await authApi.me();
      set({ user: response.data, isAuthenticated: true });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, isAuthenticated: false });
    }
  },
}));
