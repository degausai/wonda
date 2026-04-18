import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiGet } from "../api.js";

type JobEndpoint = {
  name: string;
  title: string;
  description: string;
  path: string;
  paramName: string;
};

const JOB_ENDPOINTS: JobEndpoint[] = [
  {
    name: "get_inference_job",
    title: "Get Inference Job",
    description:
      "Check the status of a generation job. Terminal statuses: succeeded, failed, canceled. When succeeded, outputs include media URLs and IDs.",
    path: "/jobs/inference",
    paramName: "inferenceJobId",
  },
  {
    name: "get_editor_job",
    title: "Get Editor Job",
    description:
      "Check the status of an editor job. Terminal statuses: succeeded, failed. When succeeded, outputs include media URLs and IDs.",
    path: "/jobs/editor",
    paramName: "editorJobId",
  },
  {
    name: "get_publish_job",
    title: "Get Publish Job",
    description:
      "Check the status of a publish job. Terminal statuses: succeeded, failed.",
    path: "/jobs/publish",
    paramName: "outputJobId",
  },
];

export function registerJobTools(server: McpServer): void {
  for (const endpoint of JOB_ENDPOINTS) {
    server.registerTool(
      endpoint.name,
      {
        title: endpoint.title,
        description: endpoint.description,
        inputSchema: z.object({
          jobId: z.string().min(1).describe(`The ${endpoint.paramName}`),
        }),
      },
      async ({ jobId }) => {
        const result = await apiGet(`${endpoint.path}/${jobId}`);
        if (!result.ok)
          return {
            content: [{ type: "text", text: result.error }],
            isError: true,
          };
        return {
          content: [{ type: "text", text: JSON.stringify(result.data) }],
        };
      },
    );
  }
}
