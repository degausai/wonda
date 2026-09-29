import { z } from "zod";

import type { ApiResult } from "../api.js";
import type { WabInteractCommand, WabInteractParams } from "../local-exec.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiPost } from "../api.js";
import {
  buildWabInteractArgv,
  PLATFORM_LOGIN_URLS,
  runWabInteract,
  runWabLoginCheck,
  runWabLoginOpen,
  runWabOpen,
  runWabScreenshot,
  runWabStatus,
  runWabVisibility,
  WAB_INTERACT_LIMITS,
  WAB_TAB_PATTERN,
} from "../local-exec.js";
import { checkIsLocalMode } from "../version.js";
import {
  READ_TOOL_ANNOTATIONS,
  WRITE_TOOL_ANNOTATIONS,
} from "./annotations.js";

const personaField = z
  .string()
  .min(1)
  .optional()
  .describe("WAB persona; omit for the configured default account");

const platformField = z
  .enum(Object.keys(PLATFORM_LOGIN_URLS) as [string, ...string[]])
  .describe("Platform to log into");

const tabField = z
  .string()
  .regex(WAB_TAB_PATTERN)
  .optional()
  .describe('Named tab; omit for the shared "default" tab wab_open navigates');

const TARGET_GRAMMAR =
  '"@e5" (ref from wab_snapshot), "label=Email", "placeholder=Search", or a Playwright selector ("text=Sign in", "role=button[name=\\"Post\\"]", css)';

const targetField = z
  .string()
  .min(1)
  .max(WAB_INTERACT_LIMITS.target)
  .describe(`Element: ${TARGET_GRAMMAR}`);

const pointTargetField = z
  .string()
  .min(1)
  .max(WAB_INTERACT_LIMITS.target)
  .describe(`Element: ${TARGET_GRAMMAR}, or "x,y" viewport coordinates`);

const snapshotAfterField = z
  .boolean()
  .optional()
  .describe("Also return the interactive snapshot after acting");

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
        'List the Wonda Automation Browser (WAB) personas on the user\'s machine and whether each browser is running (PID, last activity). Each running persona also reports browser HEALTH (ok, browser-dead, unknown, unresponsive); browser-dead means the daemon is up but its Chromium context is gone and the persona needs a restart. The WAB runs offscreen by default; call wab_show to surface it as "Wonda · <persona>".',
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

  registerWabInteractionTools(server, isLocal);
}

// ── Page interaction: snapshot -> act(@ref) -> re-snapshot, on ANY site ──
// Every tool runs offscreen in the persona's logged-in WAB (never surfaces the
// window). Local mode shells out to `wonda wab <command>`; remote mode forwards
// the same command to the user's relay, which runs the identical argv.
function registerWabInteractionTools(server: McpServer, isLocal: boolean) {
  const interact = (
    command: WabInteractCommand,
    persona: string | undefined,
    params: WabInteractParams,
  ) => runInteraction(isLocal, command, persona, params);

  server.registerTool(
    "wab_snapshot",
    {
      title: "WAB Snapshot",
      description:
        'Read the current page of the persona\'s Wonda Automation Browser as an accessibility tree (YAML), offscreen, on any site. Elements carry refs like [ref=e5]: pass "@e5" as target to wab_click, wab_type, wab_select, wab_hover, wab_get. Refs go stale after navigation or the next snapshot, so re-snapshot once the page changes. interactive: true lists only actionable elements (compact, best for choosing what to act on); omit it to also read page text. Prefer this over wab_screenshot for acting; never use a computer-use tool on the WAB.',
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        interactive: z
          .boolean()
          .optional()
          .describe("Only actionable elements, one line each"),
        maxChars: z
          .number()
          .int()
          .min(1)
          .max(WAB_INTERACT_LIMITS.maxChars)
          .optional()
          .describe("Truncate the YAML (default ~40000)"),
        persona: personaField,
        tab: tabField,
      }),
    },
    async ({ interactive, maxChars, persona, tab }) => {
      const result = await interact("snapshot", persona, {
        interactive,
        maxChars,
        tab,
      });
      return interactionResult(result, (data) => renderSnapshot(data));
    },
  );

  server.registerTool(
    "wab_click",
    {
      title: "WAB Click",
      description:
        "Click an element in the persona's WAB with a human-like mouse move (scrolled into view first). Returns the URL after the click.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        target: pointTargetField,
        button: z.enum(["left", "right", "middle"]).optional(),
        double: z.boolean().optional().describe("Double-click"),
        snapshot: snapshotAfterField,
        persona: personaField,
        tab: tabField,
      }),
    },
    async ({ target, button, double, snapshot, persona, tab }) =>
      interactionResult(
        await interact("click", persona, {
          target,
          button,
          double,
          snapshot,
          tab,
        }),
      ),
  );

  server.registerTool(
    "wab_type",
    {
      title: "WAB Type",
      description: `Type text into an element in the persona's WAB keystroke by keystroke, like a person (max ${WAB_INTERACT_LIMITS.typeText} chars). instant: true sets the whole value at once instead (long text, non-sensitive fields). clear empties the field first; submit presses Enter after. Never type credentials: use wab_login_open.`,
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        target: targetField,
        text: z.string().max(WAB_INTERACT_LIMITS.fillText),
        clear: z.boolean().optional(),
        submit: z.boolean().optional(),
        instant: z.boolean().optional(),
        snapshot: snapshotAfterField,
        persona: personaField,
        tab: tabField,
      }),
    },
    async ({
      target,
      text,
      clear,
      submit,
      instant,
      snapshot,
      persona,
      tab,
    }) => {
      if (instant !== true) {
        return interactionResult(
          await interact("type", persona, {
            target,
            text,
            clear,
            submit,
            snapshot,
            tab,
          }),
        );
      }
      // `wab fill` replaces the value (so clear is implicit) and has no
      // --submit: press Enter on the same element as a second step.
      const filled = await interact("fill", persona, {
        target,
        text,
        snapshot: submit === true ? undefined : snapshot,
        tab,
      });
      if (!filled.ok || submit !== true) return interactionResult(filled);
      return interactionResult(
        await interact("press", persona, {
          key: "Enter",
          target,
          snapshot,
          tab,
        }),
      );
    },
  );

  server.registerTool(
    "wab_press",
    {
      title: "WAB Press",
      description:
        'Press a key or chord in the persona\'s WAB (Playwright syntax: "Enter", "Escape", "Tab", "ArrowDown", "ControlOrMeta+A"). With target, focuses that element first; otherwise the key goes to the focused element.',
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        key: z.string().min(1).max(WAB_INTERACT_LIMITS.key),
        target: targetField.optional(),
        snapshot: snapshotAfterField,
        persona: personaField,
        tab: tabField,
      }),
    },
    async ({ key, target, snapshot, persona, tab }) =>
      interactionResult(
        await interact("press", persona, { key, target, snapshot, tab }),
      ),
  );

  server.registerTool(
    "wab_scroll",
    {
      title: "WAB Scroll",
      description:
        "Scroll the persona's WAB page with human wheel moves. Give one of: direction/pixels (default down 600), to (top|bottom), or into (an element target to bring into view). Returns scroll position and atBottom.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        direction: z.enum(["up", "down", "left", "right"]).optional(),
        pixels: z
          .number()
          .int()
          .min(1)
          .max(WAB_INTERACT_LIMITS.pixels)
          .optional(),
        to: z.enum(["top", "bottom"]).optional(),
        into: targetField.optional(),
        snapshot: snapshotAfterField,
        persona: personaField,
        tab: tabField,
      }),
    },
    async ({ direction, pixels, to, into, snapshot, persona, tab }) =>
      interactionResult(
        await interact("scroll", persona, {
          direction,
          pixels,
          to,
          into,
          snapshot,
          tab,
        }),
      ),
  );

  server.registerTool(
    "wab_select",
    {
      title: "WAB Select",
      description:
        "Choose option(s) of a <select> element in the persona's WAB, by option value or label.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        target: targetField,
        values: z
          .array(z.string().max(WAB_INTERACT_LIMITS.value))
          .min(1)
          .max(WAB_INTERACT_LIMITS.values),
        snapshot: snapshotAfterField,
        persona: personaField,
        tab: tabField,
      }),
    },
    async ({ target, values, snapshot, persona, tab }) =>
      interactionResult(
        await interact("select", persona, { target, values, snapshot, tab }),
      ),
  );

  server.registerTool(
    "wab_hover",
    {
      title: "WAB Hover",
      description:
        "Move the mouse onto an element in the persona's WAB, like a person (reveals hover menus and tooltips).",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        target: pointTargetField,
        persona: personaField,
        tab: tabField,
      }),
    },
    async ({ target, persona, tab }) =>
      interactionResult(await interact("hover", persona, { target, tab })),
  );

  server.registerTool(
    "wab_wait",
    {
      title: "WAB Wait",
      description:
        "Wait in the persona's WAB for exactly one condition: target (in state, default visible), url (substring or glob), load state, or a plain ms pause. timeoutMs defaults to 10000; a timeout returns an error.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        target: targetField.optional(),
        state: z.enum(["visible", "hidden", "attached", "detached"]).optional(),
        url: z.string().min(1).max(WAB_INTERACT_LIMITS.url).optional(),
        load: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
        ms: z.number().int().min(1).max(WAB_INTERACT_LIMITS.waitMs).optional(),
        timeoutMs: z
          .number()
          .int()
          .min(1)
          .max(WAB_INTERACT_LIMITS.waitMs)
          .optional(),
        persona: personaField,
        tab: tabField,
      }),
    },
    async ({ target, state, url, load, ms, timeoutMs, persona, tab }) =>
      interactionResult(
        await interact("wait", persona, {
          target,
          state,
          url,
          load,
          ms,
          timeoutMs,
          tab,
        }),
      ),
  );

  server.registerTool(
    "wab_get",
    {
      title: "WAB Get",
      description:
        "Read from the persona's WAB page: text (of target, or the whole page without one), html, value, attr (needs attr), url, title, or box (target bounds).",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        what: z.enum(["text", "html", "value", "attr", "url", "title", "box"]),
        target: targetField.optional(),
        attr: z.string().min(1).max(WAB_INTERACT_LIMITS.attr).optional(),
        maxChars: z
          .number()
          .int()
          .min(1)
          .max(WAB_INTERACT_LIMITS.maxChars)
          .optional(),
        persona: personaField,
        tab: tabField,
      }),
    },
    async ({ what, target, attr, maxChars, persona, tab }) =>
      interactionResult(
        await interact("get", persona, { what, target, attr, maxChars, tab }),
      ),
  );

  server.registerTool(
    "wab_navigate",
    {
      title: "WAB Navigate",
      description:
        "Navigate the persona's WAB offscreen: url loads that page; direction goes back, forward, or reloads. Does not surface the window (wab_open does, for the user to watch). Returns the URL and title; snapshot next.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        url: z
          .string()
          .min(1)
          .max(WAB_INTERACT_LIMITS.url)
          .optional()
          .describe("http(s) URL"),
        direction: z.enum(["back", "forward", "reload"]).optional(),
        snapshot: snapshotAfterField,
        persona: personaField,
        tab: tabField,
      }),
    },
    async ({ url, direction, snapshot, persona, tab }) => {
      if ((url === undefined) === (direction === undefined)) {
        return errorResult("Pass exactly one of url or direction.");
      }
      return interactionResult(
        url === undefined
          ? await interact(direction ?? "reload", persona, { snapshot, tab })
          : await interact("goto", persona, { url, snapshot, tab }),
      );
    },
  );

  // wab_eval is LOCAL ONLY: page JavaScript can read the session's tokens and
  // cookies, so it is never registered on (or forwarded by) the remote
  // connector. Everything else above has remote parity.
  if (!isLocal) return;
  server.registerTool(
    "wab_eval",
    {
      title: "WAB Eval",
      description:
        "Run a JavaScript expression in the persona's WAB page and return its JSON-serializable result. Isolated world by default; mainWorld: true sees page globals but is more detectable. Use only when wab_snapshot/wab_get cannot express the read.",
      annotations: WRITE_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        js: z.string().min(1).max(WAB_INTERACT_LIMITS.fillText),
        mainWorld: z.boolean().optional(),
        persona: personaField,
        tab: tabField,
      }),
    },
    // The page's own return value may legitimately carry an `error` key, so
    // only the exit status decides failure here (no driver-error sniffing).
    async ({ js, mainWorld, persona, tab }) =>
      toolResultFrom(await interact("eval", persona, { js, mainWorld, tab })),
  );
}

async function runInteraction(
  isLocal: boolean,
  command: WabInteractCommand,
  persona: string | undefined,
  params: WabInteractParams,
): Promise<ApiResult<unknown>> {
  if (isLocal) return runWabInteract(command, persona, undefined, params);
  if (command === "eval") {
    return {
      ok: false,
      error: "wab eval is only available in local mode",
      status: 400,
    };
  }
  const resolved = requireRemotePersona(persona);
  if (!resolved.ok) return resolved;
  // Same combination rules as the route (and the local path), checked here so
  // an invalid call fails fast instead of costing a relay round trip.
  try {
    buildWabInteractArgv(command, resolved.persona, params);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid wab parameters",
      status: 400,
    };
  }
  return remoteWabControl(command, resolved.persona, params);
}

// Renders a driver result. A result carrying `error` is a failure even on a
// zero exit. An act-and-observe `snapshot` field is appended as raw YAML
// rather than JSON-escaped, so the agent reads it like wab_snapshot output.
function interactionResult(
  result: ApiResult<unknown>,
  render?: (data: Record<string, unknown>) => string | undefined,
) {
  if (!result.ok) return errorResult(result.error);
  const data = checkIsRecord(result.data) ? result.data : {};
  if (typeof data.error === "string" && data.error !== "") {
    return errorResult(data.error);
  }
  const rendered = render?.(data);
  if (rendered !== undefined) return textResult(rendered);
  const { snapshot, ...rest } = data;
  if (snapshot === undefined) return textResult(JSON.stringify(result.data));
  const snapshotText =
    typeof snapshot === "string"
      ? snapshot
      : checkIsRecord(snapshot)
        ? (renderSnapshot(snapshot) ?? JSON.stringify(snapshot))
        : JSON.stringify(snapshot);
  return textResult(
    `${JSON.stringify(rest)}\n\nsnapshot after action:\n${snapshotText}`,
  );
}

function renderSnapshot(data: Record<string, unknown>): string | undefined {
  if (typeof data.snapshot !== "string") return undefined;
  const header = [
    typeof data.url === "string" ? `url: ${data.url}` : undefined,
    typeof data.title === "string" && data.title !== ""
      ? `title: ${data.title}`
      : undefined,
    typeof data.refCount === "number" ? `refs: ${data.refCount}` : undefined,
    data.truncated === true
      ? "truncated: true (raise maxChars or use interactive: true)"
      : undefined,
  ].filter((line): line is string => line !== undefined);
  return header.length > 0
    ? `${header.join("\n")}\n\n${data.snapshot}`
    : data.snapshot;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function checkIsRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
