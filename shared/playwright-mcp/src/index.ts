import { spawn, type Subprocess } from "bun";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

const PORT = parseInt(process.env.PLAYWRIGHT_MCP_PORT || "8931", 10);
const HOST = "localhost";
const MCP_URL = `http://${HOST}:${PORT}/mcp`;
const BUNX_PATH = process.env.BUNX_PATH || `${process.env.HOME}/.local/bin/bunx`;
const MCP_VERSION = "0.0.41";

let serverProcess: Subprocess | null = null;

export async function startPlaywrightMCP(): Promise<void> {
  if (await isHealthy()) {
    console.log(`[playwright-mcp] Already running on port ${PORT}`);
    return;
  }

  console.log(`[playwright-mcp] Starting on port ${PORT}...`);

  serverProcess = spawn([
    BUNX_PATH,
    `@playwright/mcp@${MCP_VERSION}`,
    "--port", String(PORT),
    "--headless",
    "--viewport-size", "1280x720",
  ], {
    stdout: "ignore",
    stderr: "pipe",
  });

  // Wait for server to be ready
  for (let i = 0; i < 30; i++) {
    await Bun.sleep(500);
    if (await isHealthy()) {
      console.log(`[playwright-mcp] Ready on port ${PORT}`);
      return;
    }
  }

  // If we got here, startup failed — check stderr
  if (serverProcess.stderr) {
    const errText = await new Response(serverProcess.stderr as any).text();
    if (errText) console.error(`[playwright-mcp] stderr: ${errText.slice(0, 300)}`);
  }
  throw new Error(`Playwright MCP failed to start within 15 seconds`);
}

export async function stopPlaywrightMCP(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
    console.log("[playwright-mcp] Stopped");
  }
}

export async function isHealthy(): Promise<boolean> {
  try {
    const resp = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "healthcheck", version: "1.0.0" } } }),
      signal: AbortSignal.timeout(2000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Read base MCP config, merge in playwright HTTP entry, write to outputPath.
 */
export async function writeMergedMcpConfig(
  basePath: string,
  outputPath: string
): Promise<void> {
  let base: any = { mcpServers: {} };
  try {
    base = JSON.parse(await readFile(basePath, "utf-8"));
  } catch {
    // No base config, start fresh
  }

  // Remove existing stdio-based playwright entry (now registered via claude mcp add)
  const { playwright, ...otherServers } = base.mcpServers || {};
  const merged = {
    mcpServers: otherServers,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(merged, null, 2));
  console.log(`[playwright-mcp] MCP config written to ${outputPath}`);
}
