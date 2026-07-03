import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ApiResult } from "./api.js";
import type {
  LocalActionKind,
  LocalActionPlatform,
} from "./local-action-registry.js";
import { LOCAL_ACTIONS } from "./local-action-registry.js";
import { getCliVersionPolicy } from "./version-policy.js";
import {
  buildUpdateInstruction,
  captureBinaryVersion,
  compareVersions,
  detectInstallChannel,
  formatVersion,
} from "./version.js";

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
};

export type LocalVerbArgs = {
  platform: LocalActionPlatform;
  action: string;
  kind: LocalActionKind;
  persona?: string;
  account?: string;
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

  let argv: string[];
  try {
    const persona = await resolvePersona(args.persona, args.account);
    argv = spec.buildArgv(args.payload ?? {}, persona, args.account);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Invalid local action payload",
      status: 400,
    };
  }

  return runWonda(argv, options);
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
  const binary = process.env.WONDA_BIN ?? "wonda";
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
    const message = stderrText || execResult.error.message;
    return {
      ok: false,
      error: warning === undefined ? message : `${warning}\n\n${message}`,
      status: exitStatus(execResult.error),
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
  const envDefault = process.env.WONDA_DEFAULT_ACCOUNT;
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

function checkIsRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
