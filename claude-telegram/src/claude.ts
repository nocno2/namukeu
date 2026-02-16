import { spawn } from "bun";

const HOME = process.env.HOME || "";
const CLAUDE_PATH = process.env.CLAUDE_PATH || "claude";
const PROJECT_DIR = process.env.PROJECT_DIR || undefined;
const MODEL = process.env.MODEL || undefined;
const PROGRESS_INTERVAL_MS = 180_000; // 3 minutes

export interface ClaudeOptions {
  sessionId: string;
  isNewSession: boolean;
  systemPrompt?: string;
  cwd?: string;
  onProgress?: (message: string) => void;
}

export interface ClaudeResult {
  success: boolean;
  result: string;
  sessionId: string;
  error?: string;
  costUsd?: number;
  durationMs?: number;
}

function buildArgs(prompt: string, options: ClaudeOptions): string[] {
  const args = [
    CLAUDE_PATH,
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

  if (MODEL) {
    args.push("--model", MODEL);
  }

  return args;
}

export async function callClaude(
  prompt: string,
  options: ClaudeOptions
): Promise<ClaudeResult> {
  const args = buildArgs(prompt, options);

  try {
    const proc = spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: options.cwd || PROJECT_DIR || undefined,
      env: {
        ...process.env,
        CLAUDECODE: undefined,
        PATH: `${HOME}/.local/bin:${HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}`,
      },
    });

    // Parse streaming output
    const result = await parseStream(proc.stdout, options.onProgress);

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0 && !result.result) {
      console.error(
        `Claude CLI exited with code ${exitCode}` +
          (stderr ? `: ${stderr.slice(0, 200)}` : "")
      );

      if (!options.isNewSession && isSessionNotFound(stderr)) {
        console.log(
          `Session ${options.sessionId} not found, creating new session.`
        );
        return callClaude(prompt, { ...options, isNewSession: true });
      }

      if (isSessionInUse(stderr)) {
        console.warn(
          `Session ${options.sessionId} is already in use, retrying as new session.`
        );
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
    return {
      success: false,
      result: "",
      sessionId: options.sessionId,
      error: `Could not run Claude CLI: ${err}`,
    };
  }
}

interface StreamResult {
  result: string;
  sessionId?: string;
  costUsd?: number;
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

  // Collect text blocks as fallback when result is empty
  const textBlocks: string[] = [];

  // Progress tracking
  let lastProgressTime = Date.now();
  let recentActivities: string[] = [];
  let buffer = "";

  function checkProgress() {
    if (!onProgress) return;
    const now = Date.now();
    if (now - lastProgressTime >= PROGRESS_INTERVAL_MS && recentActivities.length > 0) {
      const summary = recentActivities.slice(-3).join(" → ");
      onProgress(`⏳ ${summary}`);
      recentActivities = [];
      lastProgressTime = now;
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);
          processEvent(event);
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim());
        processEvent(event);
      } catch {
        // ignore
      }
    }
  } finally {
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
          const activity = describeToolUse(block.name, block.input);
          recentActivities.push(activity);
          checkProgress();
        }
        if (block.type === "text" && block.text) {
          textBlocks.push(block.text);
          // Check for [PROGRESS: ...] tags from Claude
          const progressMatches = block.text.matchAll(
            /\[PROGRESS:\s*(.+?)\]/gi
          );
          for (const match of progressMatches) {
            if (onProgress) {
              onProgress(`⏳ ${match[1]}`);
              lastProgressTime = Date.now();
            }
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

  // Use finalResult from result event; fall back to collected text blocks
  const result = finalResult || textBlocks.join("\n\n") || "";

  return {
    result,
    sessionId,
    costUsd,
    durationMs,
  };
}

function describeToolUse(name: string, input: any): string {
  switch (name) {
    case "Bash":
      return `Running: ${(input?.command || "").slice(0, 60)}`;
    case "Read":
      return `Reading: ${shortPath(input?.file_path)}`;
    case "Edit":
      return `Editing: ${shortPath(input?.file_path)}`;
    case "Write":
      return `Writing: ${shortPath(input?.file_path)}`;
    case "Glob":
      return `Searching: ${input?.pattern || "files"}`;
    case "Grep":
      return `Searching: ${(input?.pattern || "").slice(0, 40)}`;
    case "WebSearch":
      return `Searching web: ${(input?.query || "").slice(0, 40)}`;
    case "WebFetch":
      return `Fetching: ${(input?.url || "").slice(0, 50)}`;
    case "Task":
      return `Running sub-task: ${(input?.description || "").slice(0, 40)}`;
    default:
      return `Using ${name}`;
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

function isSessionInUse(stderr: string): boolean {
  return stderr.includes("is already in use");
}
