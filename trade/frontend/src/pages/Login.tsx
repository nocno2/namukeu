import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[--bg-primary]">
      <div className="w-full max-w-md p-8 bg-[--bg-card] rounded-xl border border-[--border]">
        <h1 className="text-2xl font-bold text-center mb-6">
          <span className="text-[--accent]">TRADE</span> 로그인
        </h1>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[--text-secondary] mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[--text-secondary] mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-[--bg-secondary] border border-[--border] rounded-lg text-white focus:outline-none focus:border-[--accent]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-[--accent] hover:bg-[--accent-hover] text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[--text-secondary]">
          계정이 없나요?{' '}
          <Link to="/register" className="text-[--accent] hover:underline">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
