#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerResources } from "./resources/index.js";
import { registerEditTools } from "./tools/edit.js";
import { registerGenerateTools } from "./tools/generate.js";
import { registerJobTools } from "./tools/jobs.js";
import { registerMediaTools } from "./tools/media.js";
import { registerPublishTools } from "./tools/publish.js";

const server = new McpServer({
  name: "wonda",
  version: "0.1.0",
});

registerGenerateTools(server);
registerEditTools(server);
registerMediaTools(server);
registerJobTools(server);
registerPublishTools(server);
registerResources(server);

const transport = new StdioServerTransport();
await server.connect(transport);
