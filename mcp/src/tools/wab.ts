import { z } from "zod";

import type { ApiResult } from "../api.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

// Local mode only: these drive the on-device Wonda Automation Browser through
// the host wonda binary, so agents never need a computer-use tool for it.
export function registerWabTools(server: McpServer): void {
  if (!checkIsLocalMode()) return;

  server.registerTool(
    "wab_status",
    {
      title: "WAB Status",
      description:
        'List the local Wonda Automation Browser (WAB) personas on this machine and whether each browser is running (PID, last activity, log and command-socket paths). The WAB runs offscreen by default; call wab_show to surface it as "Wonda · <persona>".',
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({}),
    },
    async () => toolResultFrom(await runWabStatus()),
  );

  server.registerTool(
    "wab_show",
    {
      title: "WAB Show",
      description:
        'Bring the persona\'s Wonda Automation Browser window on screen so the user can watch the live session (starts it offscreen first if it is not running). The window appears as "Wonda · <persona>". This runs on the host directly: never use a computer-use or desktop-control tool to open the WAB. Once shown, the user sees the window themselves; no screenshot is needed.',
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({ persona: personaField }),
    },
    async ({ persona }) =>
      toolResultFrom(await runWabVisibility("show", persona, undefined)),
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
      toolResultFrom(await runWabVisibility("hide", persona, undefined)),
  );

  server.registerTool(
    "wab_open",
    {
      title: "WAB Open",
      description:
        'Navigate the persona\'s Wonda Automation Browser to a platform or URL (starts the browser first if needed) and bring the window forward. Use after wab_show when the user asks to go somewhere, e.g. "navigate to linkedin". This runs on the host directly; never use a computer-use tool for it.',
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
      toolResultFrom(await runWabOpen(target, persona, undefined)),
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
      const result = await runWabScreenshot(persona, undefined);
      if (!result.ok) {
        const binaryTooOld =
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
      toolResultFrom(await runWabLoginOpen(platform, persona, undefined)),
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
      toolResultFrom(await runWabLoginCheck(platform, persona, undefined)),
  );
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
