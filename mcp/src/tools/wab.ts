import { z } from "zod";

import type { ApiResult } from "../api.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiPost } from "../api.js";
import {
  PLATFORM_LOGIN_URLS,
  runWabLoginCheck,
  runWabLoginOpen,
  runWabOpen,
  runWabScreenshot,
  runWabStatus,
  runWabVisibility,
} from "../local-exec.js";
import { checkIsLocalMode } from "../version.js";
import { READ_TOOL_ANNOTATIONS } from "./annotations.js";

const personaField = z
  .string()
  .min(1)
  .optional()
  .describe("WAB persona; omit for the configured default account");

const platformField = z
  .enum(Object.keys(PLATFORM_LOGIN_URLS) as [string, ...string[]])
  .describe("Platform to log into");

// wab tools register in BOTH modes. In local mode they shell out to the on-device
// wonda binary; in remote mode (the cloud connector) they forward each command to
// the user's paired relay via POST /twin/sessions/{persona}/wab/{command}, which
// runs the exact same `wonda wab` argv on the user's Mac. Either way they drive a
// real browser on the user's machine, so an agent NEVER needs a computer-use tool.
export function registerWabTools(server: McpServer): void {
  const isLocal = checkIsLocalMode();

  server.registerTool(
    "wab_status",
    {
      title: "WAB Status",
      description:
        'List the Wonda Automation Browser (WAB) personas on the user\'s machine and whether each browser is running (PID, last activity). The WAB runs offscreen by default; call wab_show to surface it as "Wonda · <persona>".',
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({ persona: personaField }),
    },
    async () =>
      toolResultFrom(isLocal ? await runWabStatus() : await remoteWabStatus()),
  );

  server.registerTool(
    "wab_show",
    {
      title: "WAB Show",
      description:
        "Bring the persona's Wonda Automation Browser window on screen so the user can watch the live session (starts it offscreen first if it is not running). The window appears as \"Wonda · <persona>\". This runs on the user's machine directly: never use a computer-use or desktop-control tool to open the WAB. Once shown, the user sees the window themselves; no screenshot is needed.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({ persona: personaField }),
    },
    async ({ persona }) =>
      toolResultFrom(
        isLocal
          ? await runWabVisibility("show", persona, undefined)
          : await remoteWabVisibility("show", persona),
      ),
  );

  server.registerTool(
    "wab_hide",
    {
      title: "WAB Hide",
      description:
        "Send a surfaced Wonda Automation Browser window back offscreen so it keeps running silently in the background.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({ persona: personaField }),
    },
    async ({ persona }) =>
      toolResultFrom(
        isLocal
          ? await runWabVisibility("hide", persona, undefined)
          : await remoteWabVisibility("hide", persona),
      ),
  );

  server.registerTool(
    "wab_open",
    {
      title: "WAB Open",
      description:
        "Navigate the persona's Wonda Automation Browser to a platform or URL (starts the browser first if needed) and bring the window forward. Use after wab_show when the user asks to go somewhere, e.g. \"navigate to linkedin\". This runs on the user's machine directly; never use a computer-use tool for it.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        target: z
          .string()
          .min(1)
          .describe(
            "Platform key (linkedin | x | reddit | instagram) or a full http(s) URL",
          ),
        persona: personaField,
      }),
    },
    async ({ target, persona }) =>
      toolResultFrom(
        isLocal
          ? await runWabOpen(target, persona, undefined)
          : await remoteWabOpen(target, persona),
      ),
  );

  server.registerTool(
    "wab_screenshot",
    {
      title: "WAB Screenshot",
      description:
        "Capture a PNG of what the persona's Wonda Automation Browser is currently showing, without surfacing the window (starts the browser offscreen if needed). Use this when YOU need to see the page; use wab_show when the user wants to watch. Never use a computer-use or desktop-control tool to screenshot the WAB.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({ persona: personaField }),
    },
    async ({ persona }) => {
      const result = isLocal
        ? await runWabScreenshot(persona, undefined)
        : await remoteWabControl("screenshot", persona);
      if (!result.ok) {
        // The friendly "update wonda" hint only applies in local mode: it keys
        // off a child-process exit code (status 1). In remote mode result.status
        // is an HTTP code, so surface the route's error text as-is (it is already
        // actionable via the route's message field).
        const binaryTooOld =
          isLocal &&
          result.status === 1 &&
          /unknown command "screenshot" for "wonda wab"/.test(result.error);
        return {
          content: [
            {
              type: "text" as const,
              text: binaryTooOld
                ? "The installed wonda binary does not support `wab screenshot` yet. Ask the user to update wonda, then retry."
                : result.error,
            },
          ],
          isError: true,
        };
      }
      const data = result.data as {
        base64?: string;
        mimeType?: string;
        path?: string;
      };
      if (typeof data?.base64 !== "string" || data.base64 === "") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Screenshot captured at ${data?.path ?? "an unknown path"} but no inline image was returned.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "image" as const,
            data: data.base64,
            mimeType: data.mimeType ?? "image/png",
          },
          { type: "text" as const, text: JSON.stringify({ path: data.path }) },
        ],
      };
    },
  );

  server.registerTool(
    "wab_login_open",
    {
      title: "WAB Login Open",
      description:
        "Start a platform login for a persona: opens the Wonda Automation Browser on screen at the platform's login page so the USER signs in themselves (2FA included). Never type or ask for credentials; cookies persist to the WAB profile automatically as they log in. Use a NEW persona name to mint a new identity. When the user says they are done, call wab_login_check.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        platform: platformField,
        persona: personaField,
      }),
    },
    async ({ platform, persona }) =>
      toolResultFrom(
        isLocal
          ? await runWabLoginOpen(platform, persona, undefined)
          : await remoteWabLoginOpen(platform, persona),
      ),
  );

  server.registerTool(
    "wab_login_check",
    {
      title: "WAB Login Check",
      description:
        'Verify a persona\'s platform session by navigating the WAB to a known-authenticated URL. Returns status "active" when the login worked, "needs_auth" when not. Call after wab_login_open once the user says they finished signing in; on success, call wab_open with the platform key once to sync cookies, then wab_hide if the user is done watching.',
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        platform: platformField,
        persona: personaField,
      }),
    },
    async ({ platform, persona }) =>
      toolResultFrom(
        isLocal
          ? await runWabLoginCheck(platform, persona, undefined)
          : await remoteWabControl("check", persona, { platform }),
      ),
  );
}

// ── Remote (cloud connector) execution: forward the command to the user's relay ──

// POST /twin/sessions/{persona}/wab/{command}. The route returns { result,
// actionRunId }; unwrap `result` so remote and local return the same wab payload.
async function remoteWabControl(
  command: string,
  persona: string | undefined,
  body: Record<string, unknown> = {},
): Promise<ApiResult<unknown>> {
  const resolved = requireRemotePersona(persona);
  if (!resolved.ok) return resolved;
  const result = await apiPost<{ result?: unknown }>(
    `/twin/sessions/${encodeURIComponent(resolved.persona)}/wab/${command}`,
    body,
  );
  if (!result.ok) return result;
  return { ...result, data: result.data?.result ?? {} };
}

// POST /twin/wab/status. Account-level: no persona (matches local `wab status`,
// which lists every persona on the machine via any live relay), so it never goes
// through requireRemotePersona. Persona stays optional/ignored on this tool.
async function remoteWabStatus(): Promise<ApiResult<unknown>> {
  const result = await apiPost<{ result?: unknown }>("/twin/wab/status", {});
  if (!result.ok) return result;
  return { ...result, data: result.data?.result ?? {} };
}

// show/hide/open echo a small descriptor (matching the local-exec shape) so the
// agent knows the window title without a follow-up call.
async function remoteWabVisibility(
  action: "show" | "hide",
  persona: string | undefined,
): Promise<ApiResult<unknown>> {
  const result = await remoteWabControl(action, persona);
  if (!result.ok) return result;
  return {
    ...result,
    data: {
      persona,
      visible: action === "show",
      windowTitle: persona ? `Wonda · ${persona}` : undefined,
    },
  };
}

async function remoteWabOpen(
  target: string,
  persona: string | undefined,
): Promise<ApiResult<unknown>> {
  const result = await remoteWabControl("open", persona, { target });
  if (!result.ok) return result;
  return {
    ...result,
    data: {
      persona,
      opened: target,
      windowTitle: persona ? `Wonda · ${persona}` : undefined,
    },
  };
}

// Mirrors local-exec's runWabLoginOpen: surface the window, then navigate it to
// the platform's login page so the user signs in themselves.
async function remoteWabLoginOpen(
  platform: string,
  persona: string | undefined,
): Promise<ApiResult<unknown>> {
  const loginUrl = PLATFORM_LOGIN_URLS[platform];
  if (loginUrl === undefined) {
    return {
      ok: false,
      error: `Unknown platform ${platform} (supported: ${Object.keys(PLATFORM_LOGIN_URLS).join(", ")})`,
      status: 400,
    };
  }
  const shown = await remoteWabVisibility("show", persona);
  if (!shown.ok) return shown;
  return remoteWabOpen(loginUrl, persona);
}

function requireRemotePersona(
  persona: string | undefined,
):
  | { ok: true; persona: string }
  | { ok: false; error: string; status: number } {
  if (persona !== undefined && persona.trim() !== "") {
    return { ok: true, persona };
  }
  return {
    ok: false,
    error:
      "persona is required on the remote connector: pass the account/identity to act as",
    status: 400,
  };
}

function toolResultFrom(result: ApiResult<unknown>) {
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
