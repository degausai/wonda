#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { runLocalVerb } from "./local-exec.js";
import { createWondaMcpServer } from "./server.js";

const mcpMode = process.env.WONDA_MCP_MODE === "local" ? "local" : "remote";

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
            payload: args.payload,
          }),
      }
    : {},
);

const transport = new StdioServerTransport();
await server.connect(transport);
