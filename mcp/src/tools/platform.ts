import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiPost } from "../api.js";
import { TWIN_ACTION_MANIFEST } from "./twin-action-manifest.js";

const platformActionInputSchema = z.object({
  persona: z.string().min(1).describe("Cloud twin persona"),
  payload: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Per-action payload, validated server-side against the registry"),
});

export function registerPlatformTools(server: McpServer): void {
  for (const entry of TWIN_ACTION_MANIFEST) {
    server.registerTool(
      entry.toolName,
      {
        title: formatTitle(entry.platform, entry.action),
        description: `${entry.platform}/${entry.action} twin ${entry.kind} action. ${describeSlots(entry)}`,
        inputSchema: platformActionInputSchema,
      },
      async ({ persona, payload }) => {
        const result = await apiPost(
          `/twin/sessions/${encodeURIComponent(persona)}/actions/${entry.platform}/${entry.action}`,
          payload ?? {},
        );
        if (!result.ok) {
          return {
            content: [{ type: "text", text: result.error }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(result.data) }],
        };
      },
    );
  }
}

function formatTitle(platform: string, action: string): string {
  const words = `${platform} ${action}`.split(/[-_\s]+/);
  return words
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function describeSlots(entry: {
  kind: "read" | "write";
  requestedSlots: Record<string, number>;
  variableSlots: boolean;
}): string {
  if (entry.kind === "read") return "No write slots requested.";

  const slots = Object.entries(entry.requestedSlots);
  if (entry.variableSlots) {
    return `Variable write slots, maximum ${formatSlots(slots)}.`;
  }
  return `Write slots requested: ${formatSlots(slots)}.`;
}

function formatSlots(slots: [string, number][]): string {
  if (slots.length === 0) return "server-side";
  return slots
    .map(([slot, count]) => `${count} ${slot}${count === 1 ? "" : "s"}`)
    .join(", ");
}
