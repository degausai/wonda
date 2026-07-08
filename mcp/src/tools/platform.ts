import { z } from "zod";

import type { ApiResult } from "../api.js";
import type {
  LocalActionSpec,
  PayloadFieldSpec,
} from "../local-action-registry.js";
import type { TwinActionManifestEntry } from "./twin-action-manifest.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiPost } from "../api.js";
import { LOCAL_ACTIONS } from "../local-action-registry.js";
import { checkIsLocalMode } from "../version.js";
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
  const isLocal = checkIsLocalMode();
  for (const entry of TWIN_ACTION_MANIFEST) {
    // localOnly actions have no server-registry counterpart; registering them
    // in remote mode would just produce 4xx tool errors.
    if (entry.localOnly === true && !isLocal) continue;
    const localSpec = isLocal ? LOCAL_ACTIONS[entry.key] : undefined;
    if (localSpec === undefined) {
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
      continue;
    }
    server.registerTool(
      entry.toolName,
      {
        title: formatTitle(entry.platform, entry.action),
        description: localDescription(entry, localSpec),
        annotations: annotationsForTwinActionKind(entry.kind),
        inputSchema: localInputSchema(localSpec),
      },
      async (args) => toolResult(await execute(entry, args)),
    );
  }
}

function localDescription(
  entry: TwinActionManifestEntry,
  spec: LocalActionSpec,
): string {
  const surface =
    spec.via === "wab"
      ? "drives the Wonda Automation Browser (WAB), a real Chrome window on this machine (offscreen by default)"
      : "uses the account's stored cookie session (no browser window)";
  const base = `${entry.platform}/${entry.action} ${entry.kind} action. Runs locally via the wonda CLI: ${surface}.`;
  return entry.kind === "write" ? `${base} ${describeSlots(entry)}` : base;
}

function localInputSchema(spec: LocalActionSpec) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of spec.payloadFields) {
    shape[field.name] = zodForPayloadField(field);
  }
  const payloadRequired = spec.payloadFields.some((field) => field.required);
  const payload = z
    .object(shape)
    .passthrough()
    .describe(payloadDescription(spec));
  return z.object({
    persona: z
      .string()
      .min(1)
      .optional()
      .describe("Local WAB persona (defaults to the account name)"),
    account: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Account label selecting the local cookie store and WAB persona; omit for the configured default",
      ),
    payload: payloadRequired ? payload : payload.optional(),
  });
}

function zodForPayloadField(field: PayloadFieldSpec): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  if (field.enum !== undefined) {
    schema = z.enum(field.enum as [string, ...string[]]);
  } else if (field.kind === "string") {
    schema = z.string().min(1);
  } else if (field.kind === "stringArray") {
    const items = z.array(z.string());
    schema = field.maxCount === undefined ? items : items.max(field.maxCount);
  } else {
    schema = z.union([z.string(), z.number(), z.boolean()]);
  }
  return field.required ? schema : schema.optional();
}

function payloadDescription(spec: LocalActionSpec): string {
  const base = "Action payload, validated locally before the CLI runs.";
  if (!spec.supportsPagination) return base;
  return `${base} Also accepts count, cursor, after, sort, time, all, maxPages, delayMs.`;
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
  const text = [result.warning, JSON.stringify(result.data), result.notice]
    .filter((part): part is string => part !== undefined)
    .join("\n\n");
  return {
    content: [{ type: "text" as const, text }],
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
