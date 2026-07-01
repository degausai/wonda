import { z } from "zod";

import type { ApiResult } from "../api.js";
import type { TwinActionManifestEntry } from "./twin-action-manifest.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiPost } from "../api.js";
import { annotationsForTwinActionKind } from "./annotations.js";
import { TWIN_ACTION_MANIFEST } from "./twin-action-manifest.js";

const platformActionInputSchema = z.object({
  persona: z
    .string()
    .min(1)
    .optional()
    .describe("Cloud twin persona, or local WAB persona in local mode"),
  account: z
    .string()
    .min(1)
    .optional()
    .describe("Local account label for cookie and WAB persona selection"),
  payload: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Per-action payload, validated server-side against the registry"),
});

export type PlatformToolExecutor = (
  entry: TwinActionManifestEntry,
  args: {
    persona?: string;
    account?: string;
    payload?: Record<string, unknown>;
  },
) => Promise<ApiResult<unknown>>;

export function registerPlatformTools(
  server: McpServer,
  execute: PlatformToolExecutor = remotePlatformExecutor,
): void {
  for (const entry of TWIN_ACTION_MANIFEST) {
    server.registerTool(
      entry.toolName,
      {
        title: formatTitle(entry.platform, entry.action),
        description: `${entry.platform}/${entry.action} twin ${entry.kind} action. ${describeSlots(entry)}`,
        annotations: annotationsForTwinActionKind(entry.kind),
        inputSchema: platformActionInputSchema,
      },
      async (args) => toolResult(await execute(entry, args)),
    );
  }
}

async function remotePlatformExecutor(
  entry: TwinActionManifestEntry,
  {
    persona,
    payload,
  }: {
    persona?: string;
    account?: string;
    payload?: Record<string, unknown>;
  },
): Promise<ApiResult<unknown>> {
  if (persona === undefined) {
    return {
      ok: false,
      error: "persona is required in remote mode",
      status: 400,
    };
  }

  return apiPost(
    `/twin/sessions/${encodeURIComponent(persona)}/actions/${entry.platform}/${entry.action}`,
    payload ?? {},
  );
}

function toolResult(result: ApiResult<unknown>) {
  if (!result.ok) {
    return {
      content: [{ type: "text" as const, text: result.error }],
      isError: true,
    };
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result.data) }],
  };
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
