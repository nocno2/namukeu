/**
 * HTTP API server for dashboard integration.
 * Runs alongside the Telegram bot on port 8003.
 */
import type { Heartbeat, TaskStore, GoalStore, AuditLog, ForbiddenActions } from "@namukeu/agent-core";

const PORT = parseInt(process.env.AGENT_API_PORT || "8003", 10);
const API_TOKEN = process.env.AGENT_API_TOKEN || "agent-api-token";

interface HttpApiDeps {
  heartbeat: Heartbeat | null;
  taskStore: TaskStore | null;
  goalStore: GoalStore | null;
  auditLog: AuditLog | null;
  forbidden: ForbiddenActions | null;
}

let deps: HttpApiDeps;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorized(): Response {
  return json({ error: "Unauthorized" }, 401);
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("Authorization");
  return auth === `Bearer ${API_TOKEN}`;
}

async function parseBody(req: Request): Promise<Record<string, any>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function handleRequest(req: Request): Promise<Response> {
  if (!checkAuth(req)) return unauthorized();

  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // --- Status ---
  if (path === "/api/status" && method === "GET") {
    const hb = deps.heartbeat;
    const status = hb ? hb.getStatus() : null;
    return json(status || { error: "Heartbeat not initialized" });
  }

  // --- Tasks ---
  if (path === "/api/tasks" && method === "GET") {
    if (!deps.taskStore) return json([]);
    return json(deps.taskStore.getActive());
  }

  // --- Monitors ---
  if (path === "/api/monitors" && method === "GET") {
    const hb = deps.heartbeat;
    if (!hb) return json({ monitors: [] });
    const ms = hb.getMonitorSystem();
    return json(ms ? ms.getStatus() : { monitors: [] });
  }

  // --- Toggles ---
  if (path === "/api/toggle/idle" && method === "POST") {
    const body = await parseBody(req);
    if (deps.heartbeat) {
      deps.heartbeat.setIdleEnabled(!!body.enabled);
      return json({ ok: true, idle: body.enabled });
    }
    return json({ error: "Heartbeat not initialized" }, 500);
  }

  if (path === "/api/toggle/chain" && method === "POST") {
    const body = await parseBody(req);
    if (deps.heartbeat) {
      deps.heartbeat.setChainingEnabled(!!body.enabled);
      return json({ ok: true, chain: body.enabled });
    }
    return json({ error: "Heartbeat not initialized" }, 500);
  }

  if (path === "/api/toggle/monitors" && method === "POST") {
    const body = await parseBody(req);
    if (deps.heartbeat) {
      deps.heartbeat.setMonitorsEnabled(!!body.enabled);
      return json({ ok: true, monitors: body.enabled });
    }
    return json({ error: "Heartbeat not initialized" }, 500);
  }

  // --- Heartbeat control ---
  if (path === "/api/heartbeat/stop" && method === "POST") {
    if (deps.heartbeat) {
      deps.heartbeat.stop();
      return json({ ok: true, status: "stopped" });
    }
    return json({ error: "Heartbeat not initialized" }, 500);
  }

  if (path === "/api/heartbeat/resume" && method === "POST") {
    if (deps.heartbeat) {
      deps.heartbeat.resume();
      return json({ ok: true, status: "running" });
    }
    return json({ error: "Heartbeat not initialized" }, 500);
  }

  // --- Goals CRUD ---
  if (path === "/api/goals" && method === "GET") {
    if (!deps.goalStore) return json([]);
    return json(deps.goalStore.getAll());
  }

  if (path.match(/^\/api\/goals\/[^/]+$/) && method === "GET") {
    const id = path.split("/").pop()!;
    if (!deps.goalStore) return notFound();
    // Check if it's a project code
    const projectCodes = ["COIN", "BLOG", "DASH", "TRAIN", "TGBOT", "DCBOT", "GENERAL"];
    if (projectCodes.includes(id.toUpperCase())) {
      return json(deps.goalStore.getByProject(id.toUpperCase() as any));
    }
    const goal = deps.goalStore.getById(id);
    return goal ? json(goal) : notFound();
  }

  if (path === "/api/goals" && method === "POST") {
    if (!deps.goalStore) return json({ error: "Goals not initialized" }, 500);
    const body = await parseBody(req);
    if (!body.title || !body.description || !body.projects) {
      return json({ error: "title, description, projects required" }, 400);
    }
    const goal = deps.goalStore.createGoal({
      title: body.title,
      description: body.description,
      projects: body.projects,
      priority: body.priority,
      deadline: body.deadline,
    });
    return json(goal, 201);
  }

  if (path.match(/^\/api\/goals\/[^/]+$/) && method === "PUT") {
    const id = path.split("/").pop()!;
    if (!deps.goalStore) return json({ error: "Goals not initialized" }, 500);
    const body = await parseBody(req);
    const goal = deps.goalStore.updateGoal(id, body);
    return goal ? json(goal) : notFound();
  }

  if (path.match(/^\/api\/goals\/[^/]+$/) && method === "DELETE") {
    const id = path.split("/").pop()!;
    if (!deps.goalStore) return json({ error: "Goals not initialized" }, 500);
    const ok = deps.goalStore.deleteGoal(id);
    return ok ? json({ ok: true }) : notFound();
  }

  return notFound();
}

export function startHttpApi(dependencies: HttpApiDeps): void {
  deps = dependencies;

  Bun.serve({
    port: PORT,
    fetch: handleRequest,
  });

  console.log(`[http-api] Agent API server running on port ${PORT}`);
}
