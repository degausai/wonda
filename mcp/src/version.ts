import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Mirrors the Go CLI's update.Channel* constants and the server's
// updateCommands keys. All three must agree, or a client gets an instruction it
// cannot run: omitting "windows" here fell through to the "curl" default and
// told Windows users to pipe a bash script.
const INSTALL_CHANNELS = [
  "brew",
  "curl",
  "mcpb",
  "npm",
  "pkg",
  "windows",
] as const;

export type InstallChannel = (typeof INSTALL_CHANNELS)[number];

export type UpdatePolicy = {
  latest?: string;
  minSupported?: string;
  updateCommand?: string;
  updateCommands?: Record<string, string>;
};

// Bracket access via an index signature: this module is also compiled inside
// apps/mcp-remote, whose environment.d.ts closes NodeJS.ProcessEnv.
const env: Record<string, string | undefined> = process.env;

/**
 * Package version, single-sourced from package.json. `process.env.PKG_VERSION`
 * lets bundled deploys (which don't ship an adjacent package.json) inject it
 * at build time.
 */
export const PKG_VERSION: string = env["PKG_VERSION"] ?? readPackageVersion();

export function checkIsLocalMode(): boolean {
  return env["WONDA_MCP_MODE"] === "local";
}

export function buildUserAgent(): string {
  const base = `Wonda-MCP/${PKG_VERSION}`;
  if (!checkIsLocalMode()) return base;
  const binaryVersion = getCachedBinaryVersion();
  if (binaryVersion === undefined) return base;
  return `${base} wonda-bin/${binaryVersion}`;
}

let binaryVersionPromise: Promise<string | undefined> | undefined;
let cachedBinaryVersion: string | undefined;

export function getCachedBinaryVersion(): string | undefined {
  return cachedBinaryVersion;
}

/**
 * Drops the cached `wonda --version` result and re-probes. Used by the
 * per-action version gate so a user who upgrades the binary mid-session is
 * unblocked on retry without restarting the MCP host.
 */
export function refreshBinaryVersion(): Promise<string | undefined> {
  binaryVersionPromise = undefined;
  return captureBinaryVersion();
}

/**
 * Runs `wonda --version` once per process and caches the parsed version.
 * Resolves undefined when the binary is missing or prints no numeric
 * version (dev builds print "wonda version dev").
 */
export function captureBinaryVersion(): Promise<string | undefined> {
  binaryVersionPromise ??= new Promise((resolvePromise) => {
    execFile(
      env["WONDA_BIN"] ?? "wonda",
      ["--version"],
      { shell: false, timeout: 10_000 },
      (error, stdout) => {
        if (error !== null) {
          resolvePromise(undefined);
          return;
        }
        cachedBinaryVersion = parseVersionToken(String(stdout));
        resolvePromise(cachedBinaryVersion);
      },
    );
  });
  return binaryVersionPromise;
}

/**
 * Numeric-segment version compare. Tolerates a leading "v" and non-numeric
 * segments (treated as 0). Returns <0 when a is older than b, 0 when equal,
 * >0 when newer.
 */
export function compareVersions(a: string, b: string): number {
  const left = versionSegments(a);
  const right = versionSegments(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function detectInstallChannel(): InstallChannel {
  const fromEnv = env["WONDA_INSTALL_CHANNEL"];
  // WONDA_BIN identifies the binary we will actually run, so it outranks a
  // user-scoped marker describing some OTHER install. The Windows installer
  // sets WONDA_INSTALL_CHANNEL=windows machine-wide: without this ordering, an
  // npm user who also ran that installer would be told to update the Windows
  // installer, which leaves their npm binary untouched and the 409 standing.
  // The mcpb manifest sets both, and they agree, so nothing regresses there.
  const binary = env["WONDA_BIN"];
  if (binary !== undefined && binary.trim() !== "") {
    if (checkIsInsideThisPackage(binary)) return "mcpb";
    if (binary.includes(`${sep}Cellar${sep}`) || binary.includes("homebrew")) {
      return "brew";
    }
    if (binary.includes("node_modules")) return "npm";
  }
  if (fromEnv !== undefined && checkIsInstallChannel(fromEnv)) return fromEnv;
  // Platform check AFTER the binary heuristics, so an npm or bundled install on
  // Windows still reports its real channel; only an otherwise-unidentified
  // Windows install falls here. The curl default is a bash-only instruction, so
  // it must not be what a Windows client lands on.
  if (process.platform === "win32") return "windows";
  return "curl";
}

export function buildUpdateInstruction(
  channel: InstallChannel,
  policy: UpdatePolicy | undefined,
): string | undefined {
  if (channel === "mcpb") {
    return "Update the Wonda extension in Claude settings.";
  }
  // Windows is a download URL like pkg, and must return BEFORE the pkg logic
  // below: that path splices in updateCommands.pkg, which is the macOS
  // installer, and would hand a Windows user a .pkg to run.
  if (channel === "windows") {
    const windowsUrl = policy?.updateCommands?.windows;
    return windowsUrl === undefined ? undefined : `Download: ${windowsUrl}`;
  }
  const pkgUrl = policy?.updateCommands?.pkg;
  const command = policy?.updateCommands?.[channel] ?? policy?.updateCommand;
  if (channel === "pkg" && pkgUrl !== undefined) return `Download: ${pkgUrl}`;
  if (pkgUrl !== undefined && command !== undefined) {
    return `Download: ${pkgUrl} or run: ${command}`;
  }
  if (command !== undefined) return `Run: ${command}`;
  if (pkgUrl !== undefined) return `Download: ${pkgUrl}`;
  return undefined;
}

export function formatVersion(version: string): string {
  return `v${version.replace(/^v/, "")}`;
}

function readPackageVersion(): string {
  try {
    const raw = readFileSync(
      new URL("../package.json", import.meta.url),
      "utf8",
    );
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "version" in parsed &&
      typeof parsed.version === "string"
    ) {
      return parsed.version;
    }
  } catch {
    // package.json is not shipped next to the build output (bundled deploys).
  }
  return "0.0.0";
}

function parseVersionToken(output: string): string | undefined {
  const match = /\bv?(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)/.exec(output);
  return match?.[1];
}

function versionSegments(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((segment) => {
      const numeric = Number.parseInt(segment, 10);
      return Number.isNaN(numeric) ? 0 : numeric;
    });
}

function checkIsInstallChannel(value: string): value is InstallChannel {
  return INSTALL_CHANNELS.some((channel) => channel === value);
}

function checkIsInsideThisPackage(binaryPath: string): boolean {
  const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  return resolve(binaryPath).startsWith(`${packageRoot}${sep}`);
}
