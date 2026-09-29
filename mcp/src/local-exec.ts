import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ApiResult } from "./api.js";
import type {
  LocalActionKind,
  LocalActionPlatform,
} from "./local-action-registry.js";
import type { UpdatePolicy } from "./version.js";
import {
  LOCAL_ACTIONS,
  validateLocalActionVia,
} from "./local-action-registry.js";
import { getCliVersionPolicy } from "./version-policy.js";
import {
  buildUpdateInstruction,
  captureBinaryVersion,
  compareVersions,
  detectInstallChannel,
  formatVersion,
  refreshBinaryVersion,
} from "./version.js";

// Bracket access via an index signature: this module is also compiled inside
// apps/mcp-remote, whose environment.d.ts closes NodeJS.ProcessEnv.
const env: Record<string, string | undefined> = process.env;

type ExecFileCallback = (
  error: Error | null,
  stdout: string | Buffer,
  stderr: string | Buffer,
) => void;

type ExecFileFn = (
  file: string,
  args: string[],
  options: { shell: false; timeout: number; maxBuffer: number },
  callback: ExecFileCallback,
) => void;

type RunLocalVerbOptions = {
  execFile?: ExecFileFn;
  timeoutMs?: number;
  // Parse stdout as the result even on a non-zero exit. `wab check` prints its
  // structured verdict and exits 1 when the session is not active; the JSON is
  // the answer, not an error.
  stdoutJsonOnError?: boolean;
  // Keep going: on a non-zero exit, if stdout still parses as JSON, attach it
  // as the error result's `partialResult` instead of discarding it. Unlike
  // stdoutJsonOnError this stays a real failure (ok: false) — linkedin/enrich
  // exits non-zero on a mid-batch rate limit but keeps every already-resolved
  // profile in its stdout (mirrors readEnrichPartialResult in
  // stream-actions.mjs).
  preservePartialStdout?: boolean;
  // Injectable for tests; defaults to the cached `wonda --version` probe.
  captureVersion?: () => Promise<string | undefined>;
};

export type LocalVerbArgs = {
  platform: LocalActionPlatform;
  action: string;
  kind: LocalActionKind;
  persona?: string;
  account?: string;
  via?: "cookies" | "wab";
  payload?: unknown;
};

export async function runLocalVerb(
  args: LocalVerbArgs,
  options: RunLocalVerbOptions = {},
): Promise<ApiResult<unknown>> {
  const spec = LOCAL_ACTIONS[`${args.platform}/${args.action}`];
  if (spec === undefined) {
    return {
      ok: false,
      error: `No local action registered for ${args.platform}/${args.action}`,
      status: 400,
    };
  }
  if (spec.kind !== args.kind) {
    return {
      ok: false,
      error: `Action ${args.platform}/${args.action} is registered as ${spec.kind}, not ${args.kind}`,
      status: 400,
    };
  }

  // Per-action CLI version floor: a verb newer than the installed binary would
  // fail as an unknown command, so refuse with upgrade guidance instead
  // (mirrors the relay's minVersionForAction handshake). Unknown/dev binary
  // versions never block.
  // A narrowed-out payload falls back to minCliVersionBase (when set) rather
  // than losing the gate: the verb itself still has to exist in the installed
  // binary, so an older one must get the 409 upgrade guidance instead of
  // exec'ing an unknown command. Absent base = no floor (prior behavior).
  const requiredCliVersion =
    spec.minCliVersion === undefined
      ? undefined
      : spec.minCliVersionWhen === undefined ||
          spec.minCliVersionWhen(
            effectivePayloadForVersionGate(args.payload, args.via),
          )
        ? spec.minCliVersion
        : spec.minCliVersionBase;
  if (requiredCliVersion !== undefined) {
    const refusal = await refuseBelowCliVersion(
      requiredCliVersion,
      `${args.platform}/${args.action}`,
      options.captureVersion,
    );
    if (refusal !== undefined) return refusal;
  }

  let argv: string[];
  try {
    validateLocalActionVia(spec, args.via, args.payload ?? {});
    const persona = await resolvePersona(args.persona, args.account);
    argv = spec.buildArgv(args.payload ?? {}, persona, args.account);
    overrideArgvVia(argv, args.via);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Invalid local action payload",
      status: 400,
    };
  }

  return runWonda(argv, {
    timeoutMs: spec.timeoutMs,
    preservePartialStdout: spec.preservePartialStdout,
    ...options,
  });
}

/**
 * The 409 upgrade refusal for a verb newer than the installed binary, or
 * undefined when the binary is new enough (or its version is unknown/dev,
 * which never blocks).
 */
async function refuseBelowCliVersion(
  requiredCliVersion: string,
  subject: string,
  captureVersion: (() => Promise<string | undefined>) | undefined,
): Promise<ApiResult<never> | undefined> {
  const capture = captureVersion ?? captureBinaryVersion;
  let binaryVersion = await capture();
  if (
    binaryVersion !== undefined &&
    compareVersions(binaryVersion, requiredCliVersion) < 0
  ) {
    // The version is cached for the process lifetime, so a user who just
    // upgraded the binary would stay blocked until an MCP restart; re-probe
    // once before refusing so retry-after-upgrade actually recovers.
    binaryVersion = await (captureVersion === undefined
      ? refreshBinaryVersion()
      : captureVersion());
  }
  if (
    binaryVersion === undefined ||
    compareVersions(binaryVersion, requiredCliVersion) >= 0
  ) {
    return undefined;
  }
  // Per-channel instruction rather than the generic "update the CLI": this
  // refusal returns before runWonda, so the staleness notice that normally
  // carries the instruction never runs. It matters most on mcpb, where the
  // binary is embedded in the extension and `brew upgrade` cannot fix it.
  const instruction = await resolveUpdateInstruction();
  return {
    ok: false,
    error: `Wonda binary ${formatVersion(binaryVersion)} does not support ${subject}; it needs ${formatVersion(requiredCliVersion)} or newer. ${instruction ?? "Update the wonda CLI to use this tool."}`,
    status: 409,
  };
}

// The refusal is a LOCAL verdict and must not wait on the network. mcpb needs
// no policy at all, and every other channel gets one bounded attempt: a stalled
// fetch would otherwise turn an instant 409 into a tool timeout, losing the
// very guidance it is here to deliver.
async function resolveUpdateInstruction(): Promise<string | undefined> {
  const channel = detectInstallChannel();
  const policy =
    channel === "mcpb"
      ? undefined
      : await withPolicyDeadline(getCliVersionPolicy());
  return buildUpdateInstruction(channel, policy);
}

// Upper bound on how long a version refusal may wait for the update policy.
// Short on purpose: the 409 itself is already decided, and the instruction is
// a nicety we degrade rather than block on.
const POLICY_DEADLINE_MS = 2_000;

/**
 * Resolves to the policy, or undefined if it does not arrive in time or fails.
 * buildUpdateInstruction already degrades to `undefined` for a missing policy,
 * so a slow network costs the caller a less specific sentence, never a hang.
 */
async function withPolicyDeadline(
  policy: Promise<UpdatePolicy | undefined>,
): Promise<UpdatePolicy | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      policy.catch(() => undefined),
      new Promise<undefined>((resolvePromise) => {
        timer = setTimeout(() => resolvePromise(undefined), POLICY_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function effectivePayloadForVersionGate(
  payload: unknown,
  via: LocalVerbArgs["via"],
): Record<string, unknown> {
  const effective =
    payload !== null && typeof payload === "object" && !Array.isArray(payload)
      ? { ...(payload as Record<string, unknown>) }
      : {};
  if (via !== undefined) effective.via = via;
  return effective;
}

function overrideArgvVia(argv: string[], via: LocalVerbArgs["via"]): void {
  if (via === undefined) return;
  const viaIndex = argv.indexOf("--via");
  if (viaIndex === -1) {
    argv.push("--via", via);
    return;
  }
  argv[viaIndex + 1] = via;
}

export function runWabStatus(
  options: RunLocalVerbOptions = {},
): Promise<ApiResult<unknown>> {
  return runWonda(["--json", "wab", "status"], {
    timeoutMs: 30_000,
    ...options,
  });
}

// Mirrors the CLI's platform-login registry (cli/wondercat/wab/platform_login.go).
export const PLATFORM_LOGIN_URLS: Record<string, string> = {
  linkedin: "https://www.linkedin.com/login",
  x: "https://x.com/i/flow/login",
  reddit: "https://www.reddit.com/login",
  instagram: "https://www.instagram.com/accounts/login/",
};

// Opens a visible WAB at the platform's login page so the USER can sign in
// manually. Mirrors the first half of `wonda wab login` (which is
// TTY-interactive and cannot run from the MCP); cookies persist to the WAB
// profile via Set-Cookie as the user logs in.
export async function runWabLoginOpen(
  platform: string,
  persona: string | undefined,
  account: string | undefined,
): Promise<ApiResult<unknown>> {
  const loginUrl = PLATFORM_LOGIN_URLS[platform];
  if (loginUrl === undefined) {
    return {
      ok: false,
      error: `Unknown platform ${platform} (supported: ${Object.keys(PLATFORM_LOGIN_URLS).join(", ")})`,
      status: 400,
    };
  }
  const shown = await runWabVisibility("show", persona, account);
  if (!shown.ok) return shown;
  return runWabOpen(loginUrl, persona, account);
}

// Verifies a platform session via `wab check` (navigates the WAB to a
// known-authenticated URL). Exits 1 with a structured verdict when not
// active, so stdout is parsed either way.
export async function runWabLoginCheck(
  platform: string,
  persona: string | undefined,
  account: string | undefined,
  options: RunLocalVerbOptions = {},
): Promise<ApiResult<unknown>> {
  const resolved = await resolvePersona(persona, account);
  return runWonda(["--json", "wab", "check", resolved, platform], {
    timeoutMs: 60_000,
    stdoutJsonOnError: true,
    ...options,
  });
}

// `wab screenshot` captures the persona's current page offscreen and, in
// --json mode, returns {path, base64, mimeType} with the PNG inline.
export async function runWabScreenshot(
  persona: string | undefined,
  account: string | undefined,
  options: RunLocalVerbOptions = {},
): Promise<ApiResult<unknown>> {
  const resolved = await resolvePersona(persona, account);
  return runWonda(["--json", "wab", "screenshot", resolved], {
    timeoutMs: 120_000,
    ...options,
  });
}

// `wab start --open` navigates the persona's default tab (spawning the WAB
// first if needed) and brings the window forward. Target is a platform key
// (linkedin|x|reddit|instagram) or a full http(s) URL; the CLI validates it.
export async function runWabOpen(
  target: string,
  persona: string | undefined,
  account: string | undefined,
  options: RunLocalVerbOptions = {},
): Promise<ApiResult<unknown>> {
  const resolved = await resolvePersona(persona, account);
  const result = await runWonda(["wab", "start", resolved, "--open", target], {
    timeoutMs: 120_000,
    ...options,
  });
  if (!result.ok) return result;
  return {
    ...result,
    data: {
      persona: resolved,
      opened: target,
      windowTitle: `Wonda · ${resolved}`,
    },
  };
}

// `wab show` starts the persona's WAB offscreen first when it isn't running,
// so the cold-start path needs the generous timeout.
export async function runWabVisibility(
  action: "show" | "hide",
  persona: string | undefined,
  account: string | undefined,
  options: RunLocalVerbOptions = {},
): Promise<ApiResult<unknown>> {
  const resolved = await resolvePersona(persona, account);
  const result = await runWonda(["wab", action, resolved], {
    timeoutMs: action === "show" ? 120_000 : 30_000,
    ...options,
  });
  if (!result.ok) return result;
  return {
    ...result,
    data: {
      persona: resolved,
      visible: action === "show",
      windowTitle: `Wonda · ${resolved}`,
    },
  };
}

// ── WAB page interaction: snapshot -> act(@ref) -> re-snapshot ──────────────

// The wonda release that first ships `wab snapshot/click/type/fill/press/...`.
// MUST equal that release: the latest existing tag is wonda/v1.62.0, so the
// commands land in 1.63.0. An older binary gets the 409 upgrade guidance instead
// of an "unknown command" exec failure. Mirrored server-side by
// WAB_INTERACT_MIN_RELAY_VERSION (apps/api-service .../routes/wab-control.ts).
export const WAB_INTERACT_MIN_CLI_VERSION = "1.63.0";

// Input bounds, shared by the MCP schemas and mirrored by the api-service route
// schema (routes/wab-control.ts) so both transports accept the same inputs.
export const WAB_INTERACT_LIMITS = {
  target: 2048,
  // Human typing runs ~40-120ms per character; past this, fill is the only
  // sane path (and the remote route must finish inside its request budget).
  typeText: 3000,
  fillText: 50_000,
  key: 64,
  value: 1024,
  values: 64,
  url: 2048,
  attr: 256,
  maxChars: 200_000,
  // Mirrors the CLI's wabMaxScrollPixels.
  pixels: 50_000,
  waitMs: 60_000,
} as const;

// Mirrors the CLI's wabTabPattern (cmd/automation/wab_interact.go).
export const WAB_TAB_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

export type WabInteractCommand =
  | "snapshot"
  | "click"
  | "type"
  | "fill"
  | "press"
  | "hover"
  | "select"
  | "scroll"
  | "wait"
  | "get"
  | "goto"
  | "back"
  | "forward"
  | "reload"
  | "eval";

export type WabInteractParams = {
  tab?: string;
  target?: string;
  text?: string;
  key?: string;
  button?: "left" | "right" | "middle";
  double?: boolean;
  clear?: boolean;
  submit?: boolean;
  values?: string[];
  direction?: "up" | "down" | "left" | "right";
  pixels?: number;
  to?: "top" | "bottom";
  into?: string;
  state?: "visible" | "hidden" | "attached" | "detached";
  url?: string;
  load?: "load" | "domcontentloaded" | "networkidle";
  ms?: number;
  timeoutMs?: number;
  what?: "text" | "html" | "value" | "attr" | "url" | "title" | "box";
  attr?: string;
  maxChars?: number;
  interactive?: boolean;
  snapshot?: boolean;
  js?: string;
  mainWorld?: boolean;
};

// Commands that change the page and accept `--snapshot` (act-and-observe in
// one call: the CLI appends the interactive snapshot after acting).
const WAB_SNAPSHOT_AFTER_COMMANDS: ReadonlySet<WabInteractCommand> = new Set([
  "click",
  "type",
  "fill",
  "press",
  "select",
  "scroll",
  "goto",
  "back",
  "forward",
  "reload",
]);

// The CLI waits the driver's 60s action budget + 15s slack per request, after
// a possible cold start (EnsureRunning spawns the persona offscreen). --snapshot
// adds a second driver request with the same bound.
const WAB_INTERACT_TIMEOUT_MS = 150_000;
const WAB_NAVIGATE_TIMEOUT_MS = 180_000;
const WAB_SNAPSHOT_AFTER_TIMEOUT_MS = 75_000;
// Upper bound of the driver's human keystroke delay (40-120ms) plus slack.
const WAB_TYPE_MS_PER_CHAR = 150;
const WAB_WAIT_DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Builds the exact `wonda wab <command>` argv (Layer 2 contract):
 * `--json wab <command> --persona <p> [--tab <t>] [flags...] [-- positionals...]`.
 * Positionals always follow `--` so page text or a key starting with "-" is
 * never parsed as a flag. Throws on an invalid parameter combination.
 * Mirrored by buildWabArgv in apps/api-service/src/public-api/routes/wab-control.ts.
 */
export function buildWabInteractArgv(
  command: WabInteractCommand,
  persona: string,
  params: WabInteractParams,
): { argv: string[]; timeoutMs: number } {
  const flags = ["--persona", persona];
  if (params.tab !== undefined) {
    if (!WAB_TAB_PATTERN.test(params.tab)) {
      throw new Error(
        "tab must be 1-64 letters, digits or _ . : - (starting with a letter or digit)",
      );
    }
    flags.push("--tab", params.tab);
  }
  const positionals: string[] = [];

  switch (command) {
    case "snapshot":
      if (params.interactive === true) flags.push("--interactive");
      if (params.maxChars !== undefined) {
        flags.push("--max-chars", String(params.maxChars));
      }
      break;
    case "click":
      positionals.push(requireParam(params.target, "target", command));
      if (params.button !== undefined) flags.push("--button", params.button);
      if (params.double === true) flags.push("--double");
      break;
    case "type": {
      const text = requireText(params.text, command);
      if (text.length > WAB_INTERACT_LIMITS.typeText) {
        throw new Error(
          `text over ${WAB_INTERACT_LIMITS.typeText} characters is too long to type like a person; use fill (wab_type with instant: true)`,
        );
      }
      if (text === "" && params.clear !== true && params.submit !== true) {
        throw new Error(
          "text is empty: pass clear to empty the field, or submit to just press Enter",
        );
      }
      positionals.push(requireParam(params.target, "target", command), text);
      if (params.clear === true) flags.push("--clear");
      if (params.submit === true) flags.push("--submit");
      break;
    }
    case "fill":
      positionals.push(
        requireParam(params.target, "target", command),
        requireText(params.text, command),
      );
      break;
    case "press":
      positionals.push(requireParam(params.key, "key", command));
      if (params.target !== undefined) flags.push("--target", params.target);
      break;
    case "hover":
      positionals.push(requireParam(params.target, "target", command));
      break;
    case "select":
      if (params.values === undefined || params.values.length === 0) {
        throw new Error("values is required for select");
      }
      positionals.push(
        requireParam(params.target, "target", command),
        ...params.values,
      );
      break;
    case "scroll": {
      const byAmount =
        params.direction !== undefined || params.pixels !== undefined;
      const modes = [
        byAmount,
        params.to !== undefined,
        params.into !== undefined,
      ].filter(Boolean).length;
      if (modes > 1) {
        throw new Error(
          "scroll takes one of direction/pixels, to, or into, not several",
        );
      }
      if (params.to !== undefined) flags.push("--to", params.to);
      if (params.into !== undefined) flags.push("--into", params.into);
      if (byAmount) {
        positionals.push(params.direction ?? "down");
        if (params.pixels !== undefined)
          positionals.push(String(params.pixels));
      }
      break;
    }
    case "wait": {
      const conditions = [
        params.target,
        params.url,
        params.load,
        params.ms,
      ].filter((value) => value !== undefined).length;
      if (conditions !== 1) {
        throw new Error("wait takes exactly one of target, url, load, or ms");
      }
      if (params.state !== undefined && params.target === undefined) {
        throw new Error("state only applies when waiting for a target");
      }
      if (params.ms !== undefined && params.timeoutMs !== undefined) {
        throw new Error("timeoutMs does not apply to a plain ms wait");
      }
      if (params.target !== undefined) positionals.push(params.target);
      if (params.state !== undefined) flags.push("--state", params.state);
      if (params.url !== undefined) flags.push("--url", params.url);
      if (params.load !== undefined) flags.push("--load", params.load);
      if (params.ms !== undefined) flags.push("--time", `${params.ms}ms`);
      if (params.timeoutMs !== undefined) {
        flags.push("--timeout", `${params.timeoutMs}ms`);
      }
      break;
    }
    case "get": {
      const what = requireParam(params.what, "what", command);
      if ((what === "attr") !== (params.attr !== undefined)) {
        throw new Error("attr is required for what=attr and only valid there");
      }
      positionals.push(what);
      if (params.target !== undefined) positionals.push(params.target);
      if (params.attr !== undefined) flags.push("--attr", params.attr);
      if (params.maxChars !== undefined) {
        flags.push("--max-chars", String(params.maxChars));
      }
      break;
    }
    case "goto": {
      const url = requireParam(params.url, "url", command);
      if (!/^https?:\/\//i.test(url)) {
        throw new Error("url must be an http(s) URL");
      }
      positionals.push(url);
      break;
    }
    case "back":
    case "forward":
    case "reload":
      break;
    case "eval":
      positionals.push(requireParam(params.js, "js", command));
      if (params.mainWorld === true) flags.push("--main-world");
      break;
  }

  if (params.snapshot === true && WAB_SNAPSHOT_AFTER_COMMANDS.has(command)) {
    flags.push("--snapshot");
  }
  return {
    argv: [
      "--json",
      "wab",
      command,
      ...flags,
      ...(positionals.length > 0 ? ["--", ...positionals] : []),
    ],
    timeoutMs:
      wabInteractTimeoutMs(command, params) +
      (params.snapshot === true && WAB_SNAPSHOT_AFTER_COMMANDS.has(command)
        ? WAB_SNAPSHOT_AFTER_TIMEOUT_MS
        : 0),
  };
}

function wabInteractTimeoutMs(
  command: WabInteractCommand,
  params: WabInteractParams,
): number {
  switch (command) {
    case "type":
      return (
        WAB_INTERACT_TIMEOUT_MS +
        (params.text?.length ?? 0) * WAB_TYPE_MS_PER_CHAR
      );
    case "wait":
      return (
        WAB_INTERACT_TIMEOUT_MS +
        (params.ms ?? params.timeoutMs ?? WAB_WAIT_DEFAULT_TIMEOUT_MS)
      );
    case "goto":
    case "back":
    case "forward":
    case "reload":
      return WAB_NAVIGATE_TIMEOUT_MS;
    default:
      return WAB_INTERACT_TIMEOUT_MS;
  }
}

function requireParam<T extends string>(
  value: T | undefined,
  name: string,
  command: string,
): T {
  if (value === undefined || value === "") {
    throw new Error(`${name} is required for ${command}`);
  }
  return value;
}

// Text may be empty (fill "" clears a field), but must be present.
function requireText(value: string | undefined, command: string): string {
  if (value === undefined) throw new Error(`text is required for ${command}`);
  return value;
}

const UNKNOWN_WAB_COMMAND_PATTERN = /unknown command "[^"]+" for "wonda wab"/;

// Runs one page-interaction command against the persona's WAB, offscreen. The
// CLI's --json output (the driver response) is the result.
export async function runWabInteract(
  command: WabInteractCommand,
  persona: string | undefined,
  account: string | undefined,
  params: WabInteractParams,
  options: RunLocalVerbOptions = {},
): Promise<ApiResult<unknown>> {
  let built: { argv: string[]; timeoutMs: number };
  try {
    built = buildWabInteractArgv(
      command,
      await resolvePersona(persona, account),
      params,
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid wab parameters",
      status: 400,
    };
  }
  const refusal = await refuseBelowCliVersion(
    WAB_INTERACT_MIN_CLI_VERSION,
    `wab ${command}`,
    options.captureVersion,
  );
  if (refusal !== undefined) return refusal;

  const result = await runWonda(built.argv, {
    timeoutMs: built.timeoutMs,
    ...options,
  });
  // A dev/unknown-version binary skips the version gate; an old one still
  // fails as an unknown command. Turn that into upgrade guidance.
  if (!result.ok && UNKNOWN_WAB_COMMAND_PATTERN.test(result.error)) {
    const instruction = await resolveUpdateInstruction();
    return {
      ok: false,
      error: `The installed wonda binary does not support \`wab ${command}\` yet (it needs ${formatVersion(WAB_INTERACT_MIN_CLI_VERSION)} or newer). ${instruction ?? "Ask the user to update wonda, then retry."}`,
      status: 409,
    };
  }
  return result;
}

export async function buildLocalActionArgv(
  args: LocalVerbArgs,
): Promise<ApiResult<string[]>> {
  const spec = LOCAL_ACTIONS[`${args.platform}/${args.action}`];
  if (spec === undefined) {
    return {
      ok: false,
      error: `No local action registered for ${args.platform}/${args.action}`,
      status: 400,
    };
  }

  try {
    const persona = await resolvePersona(args.persona, args.account);
    return {
      ok: true,
      data: spec.buildArgv(args.payload ?? {}, persona, args.account),
      status: 200,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Invalid local action payload",
      status: 400,
    };
  }
}

/**
 * Extracts the wonda CLI's stderr update banner ("A new version of wonda is
 * available: ..." + the channel instruction/changelog lines, see
 * BANNER_CONTINUATION_PREFIXES) and broadcast message
 * blocks ("[SEVERITY] Title" + body until a blank line, see
 * update.PrintMessages) so they can surface in tool results. All other
 * stderr stays suppressed on success.
 */
export function extractUpdateNotices(stderr: string): string[] {
  const lines = stderr.replace(ANSI_PATTERN, "").split(/\r?\n/);
  const notices: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (line.startsWith(UPDATE_BANNER_PREFIX)) {
      const block = [line];
      while (index + 1 < lines.length) {
        const next = lines[index + 1]?.trim() ?? "";
        if (
          !BANNER_CONTINUATION_PREFIXES.some((prefix) =>
            next.startsWith(prefix),
          )
        ) {
          break;
        }
        block.push(next);
        index += 1;
      }
      notices.push(block.join("\n"));
      continue;
    }
    if (BROADCAST_MESSAGE_PATTERN.test(line)) {
      const block = [line];
      while (
        index + 1 < lines.length &&
        (lines[index + 1]?.trim() ?? "") !== ""
      ) {
        block.push(lines[index + 1]?.trim() ?? "");
        index += 1;
      }
      notices.push(block.join("\n"));
    }
  }
  return notices;
}

const UPDATE_BANNER_PREFIX = "A new version of wonda is available:";

// Second/third banner lines per install channel: "Update: <cmd>" (curl, brew,
// npm), "Download the latest installer: <url>" (pkg), the bare extension
// instruction (mcpb), and "Changelog: <url>" on all of them.
const BANNER_CONTINUATION_PREFIXES = [
  "Update:",
  "Changelog:",
  "Download the latest installer:",
  "Update the Wonda extension",
];
const BROADCAST_MESSAGE_PATTERN = /^\[[A-Z]+\] /;
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001B\[[0-9;]*m/g;

async function runWonda(
  argv: string[],
  options: RunLocalVerbOptions,
): Promise<ApiResult<unknown>> {
  const binary = env["WONDA_BIN"] ?? "wonda";
  const execFileImpl = options.execFile ?? execFile;
  const noticesPromise = getVersionNotices().catch((): VersionNotices => ({}));

  const execResult = await new Promise<{
    error: Error | null;
    stdout: string | Buffer;
    stderr: string | Buffer;
  }>((resolve) => {
    execFileImpl(
      binary,
      argv,
      {
        shell: false,
        timeout: timeoutFor(argv, options),
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    );
  });

  const { notice, warning } = await noticesPromise;
  const stdoutText = bufferToString(execResult.stdout).trim();
  const stderrText = bufferToString(execResult.stderr).trim();

  if (execResult.error !== null) {
    if (options.stdoutJsonOnError === true && stdoutText.length > 0) {
      try {
        return { ok: true, data: JSON.parse(stdoutText), status: 200 };
      } catch {
        // Fall through to the normal error shape.
      }
    }
    const message = stderrText || execResult.error.message;
    const partialResult =
      options.preservePartialStdout === true
        ? tryParseJson(stdoutText)
        : undefined;
    return {
      ok: false,
      error: warning === undefined ? message : `${warning}\n\n${message}`,
      status: exitStatus(execResult.error),
      ...(partialResult !== undefined && { partialResult }),
    };
  }

  const noticeParts = [notice, ...extractUpdateNotices(stderrText)].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  const combinedNotice =
    noticeParts.length > 0 ? noticeParts.join("\n\n") : undefined;

  try {
    return {
      ok: true,
      data: stdoutText.length > 0 ? JSON.parse(stdoutText) : {},
      status: 200,
      notice: combinedNotice,
      warning,
    };
  } catch {
    const message =
      stdoutText.length > 0 ? stdoutText : "wonda returned invalid JSON";
    return {
      ok: false,
      error: warning === undefined ? message : `${warning}\n\n${message}`,
      status: 500,
    };
  }
}

type VersionNotices = { notice?: string; warning?: string };

/**
 * Computes the staleness notice/warning for the local binary. The binary
 * version is captured once per process; the version policy is fetched with a
 * 30-minute TTL. Both run while the actual verb executes, so this adds no
 * latency to tool calls.
 */
async function getVersionNotices(): Promise<VersionNotices> {
  const binaryVersion = await captureBinaryVersion();
  if (binaryVersion === undefined) return {};
  const policy = await getCliVersionPolicy();
  if (policy === undefined) return {};

  const instruction = buildUpdateInstruction(detectInstallChannel(), policy);
  const suffix = instruction === undefined ? "" : ` ${instruction}`;
  if (
    policy.minSupported !== undefined &&
    compareVersions(binaryVersion, policy.minSupported) < 0
  ) {
    return {
      warning: `WARNING: Wonda binary ${formatVersion(binaryVersion)} is older than the minimum supported version ${formatVersion(policy.minSupported)}. Tool calls may fail until it is updated.${suffix}`,
    };
  }
  if (
    policy.latest !== undefined &&
    compareVersions(binaryVersion, policy.latest) < 0
  ) {
    return {
      notice: `Wonda binary ${formatVersion(binaryVersion)} is outdated (latest ${formatVersion(policy.latest)}).${suffix}`,
    };
  }
  return {};
}

function timeoutFor(argv: string[], options: RunLocalVerbOptions): number {
  if (options.timeoutMs !== undefined) return options.timeoutMs;
  return Math.max(180_000, durationTimeoutMs(argv));
}

function durationTimeoutMs(argv: string[]): number {
  const durationIndex = argv.indexOf("--duration");
  if (durationIndex === -1) return 180_000;

  const rawDuration = argv[durationIndex + 1];
  if (rawDuration === undefined) return 180_000;

  const match = /^(\d+)ms$/.exec(rawDuration);
  if (match === null) return 180_000;

  return Number(match[1]) + 30_000;
}

async function resolvePersona(
  persona: string | undefined,
  account: string | undefined,
): Promise<string> {
  if (persona !== undefined && persona.trim() !== "") return persona;
  if (account !== undefined && account.trim() !== "") return account;
  const envDefault = env["WONDA_DEFAULT_ACCOUNT"];
  if (envDefault !== undefined && envDefault.trim() !== "") return envDefault;
  const configDefault = await readDefaultAccount();
  if (configDefault !== undefined) return configDefault;
  return "default";
}

async function readDefaultAccount(): Promise<string | undefined> {
  try {
    const raw = await readFile(
      join(homedir(), ".wonda", "config.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw);
    if (!checkIsRecord(parsed)) return undefined;
    const defaultAccount = parsed.default_account;
    if (typeof defaultAccount === "string" && defaultAccount.trim() !== "") {
      return defaultAccount;
    }
    const defaultPersona = parsed.default_persona;
    if (typeof defaultPersona === "string" && defaultPersona.trim() !== "") {
      return defaultPersona;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function bufferToString(value: string | Buffer): string {
  return typeof value === "string" ? value : value.toString("utf8");
}

function exitStatus(error: Error): number {
  if ("code" in error && typeof error.code === "number") return error.code;
  return 1;
}

function tryParseJson(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function checkIsRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
