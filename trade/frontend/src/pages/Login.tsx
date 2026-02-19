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
      setError(err.response?.data?.detail || '로그인 실패');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117]">
      <div className="w-full max-w-md p-8 bg-[#161b22] rounded-xl border border-[#30363d] shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            <span className="text-[#58a6ff]">TRADE</span>
            <span className="text-[#8b949e] text-sm ml-1">Pro</span>
          </h1>
          <p className="text-sm text-[#8b949e] mt-2">주식 거래 플랫폼에 로그인하세요</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#f85149]/10 border border-[#f85149]/20 text-[#f85149] rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm text-[#8b949e] mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              placeholder="사용자 이름을 입력하세요"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[#8b949e] mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="비밀번호를 입력하세요"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full py-3"
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#8b949e]">
          계정이 없나요?{' '}
          <Link to="/register" className="text-[#58a6ff] hover:underline">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
