"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 에러 로깅
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4">
          <div className="max-w-md w-full text-center">
            <div className="mb-6">
              <span className="text-6xl">⚠️</span>
            </div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3">
              문제가 발생했습니다
            </h2>
            <p className="text-[var(--text-tertiary)] mb-6">
              서비스를 이용 중에 예상치 못한 오류가 발생했습니다.
              잠시 후 다시 시도해 주세요.
            </p>
            {error.digest && (
              <p className="text-xs text-[var(--text-muted)] mb-4 font-mono">
                오류 코드: {error.digest}
              </p>
            )}
            <button
              onClick={() => reset()}
              className="px-6 py-3 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition"
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
