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

async function runWonda(
  argv: string[],
  options: RunLocalVerbOptions,
): Promise<ApiResult<unknown>> {
  const binary = process.env.WONDA_BIN ?? "wonda";
  const execFileImpl = options.execFile ?? execFile;

  return new Promise((resolve) => {
    execFileImpl(
      binary,
      argv,
      {
        shell: false,
        timeout: timeoutFor(argv, options),
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const stdoutText = bufferToString(stdout).trim();
        const stderrText = bufferToString(stderr).trim();
        if (error !== null) {
          resolve({
            ok: false,
            error: stderrText || error.message,
            status: exitStatus(error),
          });
          return;
        }

        try {
          resolve({
            ok: true,
            data: stdoutText.length > 0 ? JSON.parse(stdoutText) : {},
            status: 200,
          });
        } catch {
          resolve({
            ok: false,
            error:
              stdoutText.length > 0
                ? stdoutText
                : "wonda returned invalid JSON",
            status: 500,
          });
        }
      },
    );
  });
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
