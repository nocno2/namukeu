import { readFile } from "fs/promises";

/**
 * Load the SOUL.md agent definition file.
 * Returns empty string if not found.
 */
export async function loadSoul(soulPath: string): Promise<string> {
  try {
    return await readFile(soulPath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Build the system prompt for autonomous (heartbeat) actions.
 * Combines SOUL.md + forbidden rules + task context.
 */
export function buildAgentSystemPrompt(params: {
  soul: string;
  forbiddenBlock: string;
  memoryContext: string;
  activeTasksSummary: string;
  userName: string;
  currentTime: string;
}): string {
  const parts: string[] = [];

  if (params.soul) {
    parts.push(params.soul);
  }

  parts.push(`\nYou are speaking with ${params.userName}.`);
  parts.push(`Current time: ${params.currentTime}`);

  if (params.forbiddenBlock) {
    parts.push(`\n${params.forbiddenBlock}`);
  }

  if (params.memoryContext) {
    parts.push(`\n${params.memoryContext}`);
  }

  if (params.activeTasksSummary) {
    parts.push(`\nACTIVE TASKS:\n${params.activeTasksSummary}`);
  }

  parts.push(
    "\nAUTONOMOUS MODE:" +
      "\nYou are running as an autonomous agent. You are executing a scheduled task." +
      "\nBe concise in your response. Focus on the task at hand." +
      "\nYour response will be sent directly to the user via messaging."
  );

  return parts.join("\n");
}
