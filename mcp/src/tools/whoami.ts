import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiGet } from "../api.js";
import { checkIsLocalMode } from "../version.js";
import { READ_TOOL_ANNOTATIONS } from "./annotations.js";

// GET /auth/whoami: the account identity this session's credential resolves
// to, plus where its platform actions will run. A connector session is bound
// to whichever account approved its OAuth consent and then refreshes silently,
// so the acting account is otherwise invisible to the agent.
export type WhoamiResponse = {
  email: string;
  accountId: string;
  plan: string;
  twinEnginePolicy: "auto" | "my_machine" | "cloud";
  activeDevice: {
    deviceName: string;
    online: boolean;
    version: string | null;
    /** Soft version posture; null when either side is unknown/uncomparable. */
    updateAvailable: boolean | null;
    latestVersion: string | null;
    /** The device's self-reported self-updater failure; null while healthy. */
    selfUpdateError: string | null;
    /** True when the relay routes ANY persona dynamically; then
     * connectedPersonas is advisory (last-reported profiles), not an
     * exhaustive reachable set — do not treat an absent persona as offline. */
    servesAllPersonas: boolean;
  } | null;
  connectedPersonas: string[];
};

export async function fetchWhoami(): Promise<WhoamiResponse | null> {
  const result = await apiGet<WhoamiResponse>("/auth/whoami");
  if (!result.ok) return null;
  return result.data;
}

export function registerWhoamiTools(server: McpServer): void {
  server.registerTool(
    "wonda_whoami",
    {
      title: "Wonda Whoami",
      description:
        "Report which Wonda account this session is acting as (email, plan) and where its platform actions run: the twin engine policy, the active paired device with its online state, and the personas currently connected. Call this when an action unexpectedly reports the user's machine offline, when results look like they belong to a different account, or to confirm identity before write actions. mode says whether this MCP server runs locally on the user's machine or as the remote connector; in remote mode the account is the one that approved the connector's OAuth consent, which is not necessarily the account the user is signed into on the web.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({}),
    },
    async () => {
      const result = await apiGet<WhoamiResponse>("/auth/whoami");
      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: result.error }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ...result.data,
              mode: checkIsLocalMode() ? "local" : "remote",
            }),
          },
        ],
      };
    },
  );
}
