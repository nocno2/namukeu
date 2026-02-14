import { spawn } from "bun";

const HOME = process.env.HOME || "";
const CLAUDE_PATH = process.env.CLAUDE_PATH || "claude";
const PROJECT_DIR = process.env.PROJECT_DIR || undefined;
const MODEL = process.env.MODEL || undefined;
const CLAUDE_TIMEOUT_MS = parseInt(
  process.env.CLAUDE_TIMEOUT_MS || "300000",
  10
);

export interface ClaudeOptions {
  sessionId: string;
  isNewSession: boolean;
  systemPrompt?: string;
  cwd?: string;
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
    "--output-format",
    "json",
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
        CLAUDECODE: undefined, // Prevent nested session detection
        PATH: `${HOME}/.local/bin:${HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}`,
      },
    });

    // Timeout handling
    const timeoutId = setTimeout(() => {
      proc.kill();
    }, CLAUDE_TIMEOUT_MS);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    clearTimeout(timeoutId);

    if (exitCode !== 0) {
      // Auto-fallback: if --resume fails because session doesn't exist,
      // retry with --session-id to create a new session
      if (!options.isNewSession && isSessionNotFound(stderr)) {
        console.log(
          `Session ${options.sessionId} not found, creating new session.`
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

    // Parse JSON output
    try {
      const json = JSON.parse(stdout);
      return {
        success: true,
        result: json.result || "",
        sessionId: json.session_id || options.sessionId,
        costUsd: json.cost_usd,
        durationMs: json.duration_ms,
      };
    } catch {
      // JSON parse failed — use stdout as plain text
      return {
        success: true,
        result: stdout.trim(),
        sessionId: options.sessionId,
      };
    }
  } catch (err) {
    return {
      success: false,
      result: "",
      sessionId: options.sessionId,
      error: `Could not run Claude CLI: ${err}`,
    };
  }
}

function isSessionNotFound(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("no conversation found") ||
    lower.includes("session not found") ||
    lower.includes("could not find session")
  );
}
