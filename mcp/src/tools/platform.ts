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
import { splitTwinNotices } from "../notices.js";
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
    // The payload contract (which fields, which are required) is identical
    // whether the action runs locally or on the cloud twin, so surface it in
    // BOTH modes: a remote caller (e.g. Cowork) otherwise sees only an opaque
    // `payload` record and hits a bare "Required" when a field like
    // linkedin/activity's `target` is missing. Only the framing differs.
    const spec = LOCAL_ACTIONS[entry.key];
    server.registerTool(
      entry.toolName,
      {
        title: formatTitle(entry.platform, entry.action),
        description:
          isLocal && spec
            ? localDescription(entry, spec)
            : remoteDescription(entry),
        annotations: annotationsForTwinActionKind(entry.kind),
        inputSchema: buildActionInputSchema(entry, isLocal),
      },
      async (args: {
        persona?: string;
        account?: string;
        payload?: Record<string, unknown>;
      }) => toolResult(await execute(entry, args)),
    );
  }
}

function remoteDescription(entry: TwinActionManifestEntry): string {
  return `${entry.platform}/${entry.action} ${entry.kind} action. Runs on the user's own Mac in the Wonda Automation Browser when their Wonda app is online, otherwise on the account's cloud twin. ${describeSlots(entry)}`;
}

// The tool's input schema. Uses the action's known payload fields (so required
// ones like linkedin/activity's `target` are advertised and validated up front)
// when the registry has them, falling back to the generic payload record only
// for actions without field metadata.
export function buildActionInputSchema(
  entry: TwinActionManifestEntry,
  isLocal: boolean,
) {
  const spec = LOCAL_ACTIONS[entry.key];
  if (spec === undefined) return platformActionInputSchema;
  return actionInputSchema(spec, isLocal);
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

function actionInputSchema(spec: LocalActionSpec, isLocal: boolean) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of spec.payloadFields) {
    shape[field.name] = zodForPayloadField(field);
  }
  const payloadRequired = spec.payloadFields.some((field) => field.required);
  const payload = z
    .object(shape)
    .passthrough()
    .describe(payloadDescription(spec, isLocal));
  return z.object({
    persona: z
      .string()
      .min(1)
      .optional()
      .describe(
        isLocal
          ? "Local WAB persona (defaults to the account name)"
          : "Persona identifying the account/identity; runs on the local WAB when the Wonda app is online, else the cloud twin",
      ),
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
  } else if (field.kind === "boolean") {
    schema = z.boolean();
  } else if (field.kind === "stringArray") {
    const items = z.array(z.string());
    schema = field.maxCount === undefined ? items : items.max(field.maxCount);
  } else {
    schema = z.union([z.string(), z.number(), z.boolean()]);
  }
  if (field.description !== undefined) {
    schema = schema.describe(field.description);
  }
  return field.required ? schema : schema.optional();
}

function payloadDescription(spec: LocalActionSpec, isLocal: boolean): string {
  const base = isLocal
    ? "Action payload, validated locally before the CLI runs."
    : "Action payload, validated against the action's schema.";
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
  // Server-attached notices render as plain lines after the payload (and are
  // stripped from the JSON so they read as hints, not action data).
  const { data, noticeLines } = splitTwinNotices(result.data);
  const text = [result.warning, JSON.stringify(data), result.notice]
    .filter((part): part is string => part !== undefined)
    .concat(noticeLines)
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
