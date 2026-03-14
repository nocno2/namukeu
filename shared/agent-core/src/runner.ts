import { spawn } from "bun";
import type { AgentEngine, AgentRunnerOptions, AgentRunnerResult } from "./types";

const HOME = process.env.HOME || "";
const DEFAULT_MODEL = "claude-opus-4-6";
const GEMINI_DEFAULT_MODEL = "gemini-3.1-pro-preview";
const INITIAL_FEEDBACK_MS = 15_000;

let activeChildPid: number | null = null;

export function killActiveChild(): void {
  if (activeChildPid) {
    try {
      process.kill(activeChildPid, "SIGTERM");
      console.log(`[runner] Killed active child: ${activeChildPid}`);
    } catch {
      // already dead
    }
    activeChildPid = null;
  }
}

export async function callAgent(
  prompt: string,
  options: AgentRunnerOptions
): Promise<AgentRunnerResult> {
  if (options.engine === "gemini") {
    return callGemini(prompt, options);
  }
  return callClaude(prompt, options);
}

// ─── Claude Implementation ───

async function callClaude(
  prompt: string,
  options: AgentRunnerOptions
): Promise<AgentRunnerResult> {
  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  const claudePath = process.env.CLAUDE_PATH || "claude";
  const projectDir = process.env.PROJECT_DIR || undefined;

  const args = [
    claudePath,
    "-p",
    prompt,
    "--verbose",
    "--output-format",
    "stream-json",
    "--dangerously-skip-permissions",
  ];

  if (options.isNewSession) {
    args.push("--session-id", options.sessionId);
  } else {
    args.push("--resume", options.sessionId);
  }

  if (options.systemPrompt) {
    args.push("--append-system-prompt", options.systemPrompt);
  }

  if (model) {
    args.push("--model", model);
  }

  try {
    const proc = spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: options.cwd || projectDir || undefined,
      env: createEnv(),
    });

    activeChildPid = proc.pid;
    const result = await parseStream(proc.stdout, options.onProgress);
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    activeChildPid = null;

    if (exitCode !== 0 && !result.result) {
      if (!options.isNewSession && isSessionNotFound(stderr)) {
        return callClaude(prompt, { ...options, isNewSession: true });
      }
      return {
        success: false,
        result: "",
        sessionId: options.sessionId,
        error: (stderr || `Claude exited with code ${exitCode}`).slice(0, 500),
      };
    }

    return {
      success: true,
      result: result.result,
      sessionId: result.sessionId || options.sessionId,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
    };
  } catch (err) {
    activeChildPid = null;
    return {
      success: false,
      result: "",
      sessionId: options.sessionId,
      error: `Could not run Claude CLI: ${err}`,
    };
  }
}

// ─── Gemini Implementation ───

async function callGemini(
  prompt: string,
  options: AgentRunnerOptions
): Promise<AgentRunnerResult> {
  const model = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
  const geminiPath = "gemini"; // Assumes gemini CLI is in PATH
  const projectDir = process.env.PROJECT_DIR || undefined;

  const args = [
    geminiPath,
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--model",
    model,
  ];

  if (options.isNewSession) {
    // Gemini creates a new session automatically.
    // The generated session ID will be captured from the first output chunk.
  } else if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }

  if (options.systemPrompt) {
    // Gemini doesn't have --append-system-prompt
    // Prepend to prompt instead
    prompt = `${options.systemPrompt}\n\n${prompt}`;
  }

  try {
    const proc = spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: options.cwd || projectDir || undefined,
      env: createEnv(),
    });

    activeChildPid = proc.pid;
    const result = await parseGeminiStream(proc.stdout, options.onProgress);
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    activeChildPid = null;

    if (exitCode !== 0 && !result.result) {
      return {
        success: false,
        result: "",
        sessionId: result.sessionId || options.sessionId,
        error: (stderr || `Gemini exited with code ${exitCode}`).slice(0, 500),
      };
    }

    return {
      success: true,
      result: result.result,
      sessionId: result.sessionId || options.sessionId,
      tokens: result.tokens,
      durationMs: result.durationMs,
    };
  } catch (err) {
    activeChildPid = null;
    return {
      success: false,
      result: "",
      sessionId: options.sessionId,
      error: `Could not run Gemini CLI: ${err}`,
    };
  }
}

// ─── Stream Parsing ───

function createEnv() {
  const { CLAUDECODE, ...rest } = process.env;
  return {
    ...rest,
    PATH: `${HOME}/.local/bin:${HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}`,
  };
}

interface StreamResult {
  result: string;
  sessionId?: string;
  costUsd?: number;
  tokens?: number;
  durationMs?: number;
}

async function parseStream(
  stdout: ReadableStream<Uint8Array>,
  onProgress?: (message: string) => void
): Promise<StreamResult> {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();

  let sessionId: string | undefined;
  let finalResult: string | undefined;
  let costUsd: number | undefined;
  let durationMs: number | undefined;
  const textBlocks: string[] = [];
  let recentActivities: string[] = [];
  let lastActivity = "";
  let buffer = "";
  let lastDataTime = Date.now();
  let completed = false;

  // 단계별 경고: 3분, 5분, 10분에 각 1회만 발송 (스팸 방지)
  const WARN_THRESHOLDS_MS = [3 * 60_000, 5 * 60_000, 10 * 60_000];
  let nextWarnIndex = 0;

  const initialTimer = onProgress
    ? setTimeout(() => {
        if (!completed) onProgress("⏳ 처리 중입니다...");
      }, INITIAL_FEEDBACK_MS)
    : null;

  const watchdogInterval = onProgress
    ? setInterval(() => {
        if (completed || nextWarnIndex >= WARN_THRESHOLDS_MS.length) return;
        const elapsed = Date.now() - lastDataTime;
        if (elapsed >= WARN_THRESHOLDS_MS[nextWarnIndex]) {
          const mins = Math.floor(elapsed / 60000);
          const ctx = lastActivity ? ` (마지막: ${lastActivity})` : "";
          onProgress(`⏳ 작업 중...${ctx} — ${mins}분 경과`);
          nextWarnIndex++;
        }
      }, 30_000)
    : null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lastDataTime = Date.now();
      nextWarnIndex = 0; // 데이터 수신 시 경고 단계 리셋
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);
          processEvent(event);
        } catch {
          // skip
        }
      }
    }

    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim());
        processEvent(event);
      } catch {
        // ignore
      }
    }
  } finally {
    completed = true;
    if (initialTimer) clearTimeout(initialTimer);
    if (watchdogInterval) clearInterval(watchdogInterval);
    reader.releaseLock();
  }

  function processEvent(event: any) {
    if (event.type === "system" && event.subtype === "init") {
      sessionId = event.session_id;
      return;
    }

    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "tool_use") {
          lastActivity = describeToolUse(block.name, block.input);
          recentActivities.push(lastActivity);
        }
        if (block.type === "text" && block.text) {
          textBlocks.push(block.text);
          const progressMatches = block.text.matchAll(/\[PROGRESS:\s*(.+?)\]/gi);
          for (const match of progressMatches) {
            if (onProgress) onProgress(`⏳ ${match[1]}`);
          }
        }
      }
    }

    if (event.type === "result") {
      finalResult = event.result || "";
      sessionId = event.session_id || sessionId;
      costUsd = event.total_cost_usd;
      durationMs = event.duration_ms;
    }
  }

  return {
    result: finalResult || textBlocks.join("\n\n") || "",
    sessionId,
    costUsd,
    durationMs,
  };
}

async function parseGeminiStream(
  stdout: ReadableStream<Uint8Array>,
  onProgress?: (message: string) => void
): Promise<StreamResult> {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();

  let sessionId: string | undefined;
  let finalResult: string | undefined;
  let tokens: number | undefined;
  let durationMs: number | undefined;
  const textBlocks: string[] = [];
  let lastActivity = "";
  let buffer = "";
  let lastDataTime = Date.now();
  let completed = false;

  // 단계별 경고: 3분, 5분, 10분에 각 1회만 발송 (스팸 방지)
  const WARN_THRESHOLDS_MS = [3 * 60_000, 5 * 60_000, 10 * 60_000];
  let nextWarnIndex = 0;

  const initialTimer = onProgress
    ? setTimeout(() => {
        if (!completed) onProgress("⏳ 처리 중입니다...");
      }, INITIAL_FEEDBACK_MS)
    : null;

  const watchdogInterval = onProgress
    ? setInterval(() => {
        if (completed || nextWarnIndex >= WARN_THRESHOLDS_MS.length) return;
        const elapsed = Date.now() - lastDataTime;
        if (elapsed >= WARN_THRESHOLDS_MS[nextWarnIndex]) {
          const mins = Math.floor(elapsed / 60000);
          const ctx = lastActivity ? ` (마지막: ${lastActivity})` : "";
          onProgress(`⏳ 작업 중...${ctx} — ${mins}분 경과`);
          nextWarnIndex++;
        }
      }, 30_000)
    : null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lastDataTime = Date.now();
      nextWarnIndex = 0; // 데이터 수신 시 경고 단계 리셋
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);
          processEvent(event);
        } catch {
          // skip
        }
      }
    }

    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim());
        processEvent(event);
      } catch {
        // ignore
      }
    }
  } finally {
    completed = true;
    if (initialTimer) clearTimeout(initialTimer);
    if (watchdogInterval) clearInterval(watchdogInterval);
    reader.releaseLock();
  }

  function processEvent(event: any) {
    if (event.type === "init") {
      sessionId = event.session_id;
      return;
    }

    if (event.type === "message" && event.content) {
      if (event.delta) {
        // streaming text
        textBlocks.push(event.content);
      }
    }

    if (event.type === "result") {
      finalResult = event.result || "";
      sessionId = event.session_id || sessionId;
      if (event.stats) {
        tokens = event.stats.total_tokens;
        durationMs = event.stats.duration_ms;
      }
    }
  }

  return {
    result: finalResult || textBlocks.join("") || "",
    sessionId,
    tokens,
    durationMs,
  };
}

function describeToolUse(name: string, input: any): string {
  switch (name) {
    case "Bash":
      return `실행: ${(input?.command || "").slice(0, 50)}`;
    case "Read":
      return `읽기: ${shortPath(input?.file_path)}`;
    case "Edit":
      return `수정: ${shortPath(input?.file_path)}`;
    case "Write":
      return `작성: ${shortPath(input?.file_path)}`;
    case "Glob":
      return `검색: ${input?.pattern || "files"}`;
    case "Grep":
      return `검색: ${(input?.pattern || "").slice(0, 30)}`;
    case "WebSearch":
      return `웹 검색: ${(input?.query || "").slice(0, 30)}`;
    case "WebFetch":
      return `가져오기: ${(input?.url || "").slice(0, 40)}`;
    case "Agent":
      return `서브태스크: ${(input?.description || "").slice(0, 30)}`;
    default:
      return name;
  }
}

function shortPath(path?: string): string {
  if (!path) return "file";
  const parts = path.split("/");
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : path;
}

function isSessionNotFound(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("no conversation found") ||
    lower.includes("session not found") ||
    lower.includes("could not find session")
  );
}
