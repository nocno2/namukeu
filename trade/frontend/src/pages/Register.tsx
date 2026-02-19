import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const { register, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다');
      return;
    }

    try {
      await register(username, email, password);
      navigate('/');
    } catch (err: any) {
      const msg = err.response?.data?.detail;
      if (Array.isArray(msg)) {
        setError(msg.map((m: any) => m.msg || JSON.stringify(m)).join(', '));
      } else {
        setError(msg || '회원가입 실패');
      }
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
          <p className="text-sm text-[#8b949e] mt-2">새 계정을 만들어 시작하세요</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#f85149]/10 border border-[#f85149]/20 text-[#f85149] rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="이메일 주소를 입력하세요"
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

          <div>
            <label className="block text-sm text-[#8b949e] mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
              placeholder="비밀번호를 다시 입력하세요"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full py-3 mt-2"
          >
            {isLoading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#8b949e]">
          이미 계정이 있나요?{' '}
          <Link to="/login" className="text-[#58a6ff] hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
