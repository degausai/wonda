import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCliVersionPolicy } from "../version-policy.js";
import {
  buildUpdateInstruction,
  captureBinaryVersion,
  checkIsLocalMode,
  compareVersions,
  detectInstallChannel,
} from "../version.js";
import { READ_TOOL_ANNOTATIONS } from "./annotations.js";

export function registerStatusTools(server: McpServer): void {
  server.registerTool(
    "wonda_status",
    {
      title: "Wonda Status",
      description:
        "Check whether the installed Wonda binary is up to date. Returns the installed version, the latest and minimum supported releases, the install channel, and update instructions.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({}),
    },
    async () => {
      const isLocal = checkIsLocalMode();
      const binaryVersion = isLocal
        ? ((await captureBinaryVersion()) ?? null)
        : null;
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
            }),
          },
        ],
      };
    },
  );
}
