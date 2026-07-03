import type { UpdatePolicy } from "./version.js";
import { apiGet } from "./api.js";

const CLI_VERSION_POLICY_TTL_MS = 30 * 60 * 1000;

let policyCache:
  | { fetchedAt: number; policy: UpdatePolicy | undefined }
  | undefined;
let policyPromise: Promise<UpdatePolicy | undefined> | undefined;

/**
 * Fetches `GET /cli/version` (latest / minSupported / update commands) with a
 * 30-minute in-process cache. Failures are cached for the same TTL and
 * resolve undefined.
 */
export function getCliVersionPolicy(): Promise<UpdatePolicy | undefined> {
  if (
    policyCache !== undefined &&
    Date.now() - policyCache.fetchedAt < CLI_VERSION_POLICY_TTL_MS
  ) {
    return Promise.resolve(policyCache.policy);
  }
  policyPromise ??= fetchCliVersionPolicy()
    .catch(() => undefined)
    .then((policy) => {
      policyCache = { fetchedAt: Date.now(), policy };
      policyPromise = undefined;
      return policy;
    });
  return policyPromise;
}

async function fetchCliVersionPolicy(): Promise<UpdatePolicy | undefined> {
  const result = await apiGet("/cli/version");
  if (!result.ok) return undefined;
  return parseUpdatePolicy(result.data);
}

function parseUpdatePolicy(data: unknown): UpdatePolicy | undefined {
  if (!checkIsRecord(data)) return undefined;
  const policy: UpdatePolicy = {};
  if (typeof data.latest === "string") policy.latest = data.latest;
  if (typeof data.minSupported === "string") {
    policy.minSupported = data.minSupported;
  }
  if (typeof data.updateCommand === "string") {
    policy.updateCommand = data.updateCommand;
  }
  if (checkIsRecord(data.updateCommands)) {
    const updateCommands: Record<string, string> = {};
    for (const [channel, command] of Object.entries(data.updateCommands)) {
      if (typeof command === "string") updateCommands[channel] = command;
    }
    policy.updateCommands = updateCommands;
  }
  return policy;
}

function checkIsRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
