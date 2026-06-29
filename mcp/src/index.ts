#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerResources } from "./resources/index.js";
import { registerGenerateTools } from "./tools/generate.js";
import { registerJobTools } from "./tools/jobs.js";
import { registerMediaTools } from "./tools/media.js";
import { registerPlatformTools } from "./tools/platform.js";
import { registerPublishTools } from "./tools/publish.js";
import { registerTwinTools } from "./tools/twin.js";

const server = new McpServer({
  name: "wonda",
  version: "0.2.0",
});

registerGenerateTools(server);
// Editor operations (trim/crop/merge/animatedCaptions/textOverlay/...) moved
// to the local wonda CLI in the local-editor-ops cleanup. The public API
// returns 410 Gone for them. The MCP server is a thin HTTP client with no
// local ffmpeg, so there is no execution path; the edit tools were removed
// rather than left to loop on 410s. Editing is a `wonda edit ...` CLI task.
registerMediaTools(server);
registerJobTools(server);
registerPublishTools(server);
registerTwinTools(server);
registerPlatformTools(server);
registerResources(server);

const transport = new StdioServerTransport();
await server.connect(transport);
