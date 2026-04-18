import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiPost } from "../api.js";

type GenerationEndpoint = {
  name: string;
  title: string;
  description: string;
  path: string;
};

const GENERATION_ENDPOINTS: GenerationEndpoint[] = [
  {
    name: "generate_image",
    title: "Generate Image",
    description:
      "Generate an image from a text prompt. Returns an inferenceJobId — poll with get_inference_job until succeeded.",
    path: "/image/generate",
  },
  {
    name: "generate_video",
    title: "Generate Video",
    description:
      "Generate a video from a text prompt or reference image. Returns an inferenceJobId — poll with get_inference_job until succeeded.",
    path: "/video/generate",
  },
  {
    name: "generate_text",
    title: "Generate Text",
    description:
      "Generate text from a prompt. Returns an inferenceJobId — poll with get_inference_job until succeeded.",
    path: "/text/generate",
  },
  {
    name: "generate_music",
    title: "Generate Music",
    description:
      "Generate a music track from a text prompt. Returns an inferenceJobId — poll with get_inference_job until succeeded.",
    path: "/music/generate",
  },
  {
    name: "speech",
    title: "Text to Speech",
    description:
      "Generate speech audio from text. Returns an inferenceJobId — poll with get_inference_job until succeeded.",
    path: "/audio/speech",
  },
  {
    name: "transcribe",
    title: "Transcribe Audio",
    description:
      "Transcribe audio to text. Attach the audio mediaId via attachmentMediaIds. Returns an inferenceJobId — poll with get_inference_job until succeeded.",
    path: "/audio/transcribe",
  },
  {
    name: "dialogue",
    title: "Generate Dialogue",
    description:
      "Generate a multi-speaker dialogue audio track. Returns an inferenceJobId — poll with get_inference_job until succeeded.",
    path: "/audio/dialogue",
  },
];

const generationInputSchema = z.object({
  model: z
    .string()
    .min(1)
    .describe("Model identifier (e.g. nano-banana-2, seedance-2, suno-music)"),
  prompt: z.string().optional().describe("Text prompt"),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Model-specific parameters (e.g. duration, quality, voiceId)"),
  attachmentMediaIds: z
    .array(z.string())
    .optional()
    .describe("Media IDs to use as input references"),
});

export function registerGenerateTools(server: McpServer): void {
  for (const endpoint of GENERATION_ENDPOINTS) {
    server.registerTool(
      endpoint.name,
      {
        title: endpoint.title,
        description: endpoint.description,
        inputSchema: generationInputSchema,
      },
      async (args) => {
        const result = await apiPost(endpoint.path, args);
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

  server.registerTool(
    "analyze_video",
    {
      title: "Analyze Video",
      description:
        "Extract a composite frame grid and audio transcript from a video. Returns an inferenceJobId — poll with get_inference_job until succeeded.",
      inputSchema: z.object({
        mediaId: z.string().min(1).describe("Media ID of the video to analyze"),
        targetFrameCount: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Number of frames to extract"),
      }),
    },
    async ({ mediaId, targetFrameCount }) => {
      const body: Record<string, unknown> = { mediaId };
      if (targetFrameCount !== undefined) body.params = { targetFrameCount };
      const result = await apiPost("/video/analyze", body);
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
