import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiPost } from "../api.js";
import { getCliVersionPolicy } from "../version-policy.js";
import {
  buildUpdateInstruction,
  captureBinaryVersion,
  checkIsLocalMode,
  compareVersions,
  detectInstallChannel,
} from "../version.js";
import { READ_TOOL_ANNOTATIONS } from "./annotations.js";
import { fetchWhoami } from "./whoami.js";

export type RelayStatusResponse = {
  personas: {
    persona: string;
    connected: boolean;
    connectionState: "connected" | "disconnected";
    version: string | null;
    pairedAt: string | null;
    expiresAt: string | null;
    ttlMs: number;
  }[];
};

// The connected relays' presence, for remote mode (the MCP host has no local
// binary; the meaningful "installed Wonda" is the relay on the user's Mac,
// which self-reports its version on every poll). Returns null when the status
// lookup itself failed — indistinguishable from offline for the caller's
// purposes, but kept separate so a transient API error isn't reported as
// "no Mac connected".
export async function fetchLiveRelays(): Promise<
  RelayStatusResponse["personas"] | null
> {
  const status = await apiPost<RelayStatusResponse>("/relay/status", {});
  if (!status.ok) return null;
  return status.data.personas.filter((persona) => persona.connected);
}

export function registerStatusTools(server: McpServer): void {
  server.registerTool(
    "wonda_status",
    {
      title: "Wonda Status",
      description:
        "Check the user's Wonda installation. Locally this reports the installed binary; remotely it reports the Wonda Mac app (relay) connected for this account — its version, the personas it serves, and whether an update is available. localRelay.connected=false means the user's Mac app is not running. account.email is the Wonda account this session acts as; use wonda_whoami for the full identity picture.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({}),
    },
    async () => {
      const isLocal = checkIsLocalMode();
      // Identity rides along so every status check self-identifies (a
      // connector bound to an unexpected account is otherwise invisible); a
      // failed identity lookup must never break status, hence null.
      const [liveRelays, identity] = await Promise.all([
        isLocal ? Promise.resolve(null) : fetchLiveRelays(),
        fetchWhoami(),
      ]);
      const relayVersion =
        liveRelays?.find((relay) => relay.version !== null)?.version ?? null;
      // In remote mode the binary that matters is the relay on the user's Mac.
      const binaryVersion = isLocal
        ? ((await captureBinaryVersion()) ?? null)
        : relayVersion;
      const policy = await getCliVersionPolicy();
      const latest = policy?.latest ?? null;
      const minSupported = policy?.minSupported ?? null;
      const channel = isLocal ? detectInstallChannel() : null;
      const updateAvailable =
        binaryVersion !== null && latest !== null
          ? compareVersions(binaryVersion, latest) < 0
          : null;
      const updateInstructions =
        channel !== null
          ? (buildUpdateInstruction(channel, policy) ?? null)
          : null;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              binaryVersion,
              latest,
              minSupported,
              updateAvailable,
              updateInstructions,
              channel,
              account: identity ? { email: identity.email } : null,
              ...(isLocal
                ? {}
                : {
                    localRelay: {
                      connected: (liveRelays?.length ?? 0) > 0,
                      personas: liveRelays ?? [],
                    },
                  }),
            }),
          },
        ],
      };
    },
  );
}
