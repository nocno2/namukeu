import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary
      name="App"
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center p-6">
            <div className="text-lg font-semibold text-danger mb-2">
              앱 오류 발생
            </div>
            <div className="text-sm text-text-muted mb-4">
              예기치 않은 오류가 발생했습니다.
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm"
            >
              새로고침
            </button>
          </div>
        </div>
      }
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
