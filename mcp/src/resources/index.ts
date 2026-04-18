import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiGet } from "../api.js";

export function registerResources(server: McpServer): void {
  server.registerResource(
    "balance",
    "wonda://balance",
    {
      title: "Credit Balance",
      description: "Current credit balance and next refill time",
      mimeType: "application/json",
    },
    async (uri) => {
      const result = await apiGet("/balance");
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: result.ok
              ? JSON.stringify(result.data)
              : JSON.stringify({ error: result.error }),
          },
        ],
      };
    },
  );

  server.registerResource(
    "capabilities",
    "wonda://capabilities",
    {
      title: "API Capabilities",
      description:
        "All available models, editor operations, and publish targets with their parameters",
      mimeType: "application/json",
    },
    async (uri) => {
      const result = await apiGet("/capabilities");
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: result.ok
              ? JSON.stringify(result.data)
              : JSON.stringify({ error: result.error }),
          },
        ],
      };
    },
  );
}
