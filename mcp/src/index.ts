#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { runLocalVerb } from "./local-exec.js";
import { createWondaMcpServer } from "./server.js";
import { captureBinaryVersion } from "./version.js";

const mcpMode = process.env.WONDA_MCP_MODE === "local" ? "local" : "remote";

// Capture `wonda --version` early so the User-Agent carries the binary
// version from the first API call (cached for the process lifetime).
if (mcpMode === "local") void captureBinaryVersion();

const server = createWondaMcpServer(
  mcpMode === "local"
    ? {
        platformToolExecutor: (entry, args) =>
          runLocalVerb({
            platform: entry.platform,
            action: entry.action,
            kind: entry.kind,
            persona: args.persona,
            account: args.account,
            via: args.via,
            payload: args.payload,
          }),
      }
    : {},
);

const transport = new StdioServerTransport();
await server.connect(transport);
