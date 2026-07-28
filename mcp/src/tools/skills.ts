import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CONTENT_SKILL_SLUG_MAX_LENGTH,
  CONTENT_SKILL_SLUG_PATTERN,
  fetchContentSkill,
  fetchContentSkillCatalog,
} from "../content-skills.js";
import { READ_TOOL_ANNOTATIONS } from "./annotations.js";

const skillSlugSchema = z
  .string()
  .min(1)
  .max(CONTENT_SKILL_SLUG_MAX_LENGTH)
  .regex(
    CONTENT_SKILL_SLUG_PATTERN,
    "Skill slugs contain only lowercase letters, numbers, and hyphens",
  );

export function registerSkillTools(server: McpServer): void {
  server.registerTool(
    "list_content_skills",
    {
      title: "List Content Skills",
      description:
        "List the account's effective Wonda content skills: canonical defaults overlaid with the user's own forks and custom skills. Each entry includes its slug, purpose, platform, output, source, and whether a fork has a newer default available. Call this before inventing a content or outreach workflow, then fetch the best match with get_content_skill.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({}),
    },
    async () => {
      const result = await fetchContentSkillCatalog();
      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: result.error }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.data) }],
      };
    },
  );

  server.registerTool(
    "get_content_skill",
    {
      title: "Get Content Skill",
      description:
        "Fetch one content skill's full, current Markdown workflow by slug. This resolves the user's fork or custom version when present, otherwise the canonical Wonda default. Fetching only retrieves the guide; it does not execute any step. Use list_content_skills first when the slug is unknown.",
      annotations: READ_TOOL_ANNOTATIONS,
      inputSchema: z.object({
        slug: skillSlugSchema.describe(
          "Skill slug returned by list_content_skills",
        ),
      }),
    },
    async ({ slug }) => {
      const result = await fetchContentSkill(slug);
      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: result.error }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: result.data }],
      };
    },
  );
}
