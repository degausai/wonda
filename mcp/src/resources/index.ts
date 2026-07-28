import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiGet } from "../api.js";
import {
  CONTENT_SKILL_SLUG_MAX_LENGTH,
  CONTENT_SKILL_SLUG_PATTERN,
  fetchContentSkill,
  fetchContentSkillCatalog,
} from "../content-skills.js";

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

  server.registerResource(
    "twins",
    "wonda://twins",
    {
      title: "Cloud Twins",
      description: "Provisioned twins with status",
      mimeType: "application/json",
    },
    async (uri) => {
      const result = await apiGet("/twin/sessions");
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
    "content-skills",
    "wonda://skills",
    {
      title: "Content Skills",
      description:
        "The account's effective Wonda content-skill catalog: defaults overlaid with the user's forks and custom skills",
      mimeType: "application/json",
    },
    async (uri) => {
      const result = await fetchContentSkillCatalog();
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

  const contentSkillTemplate = new ResourceTemplate("wonda://skills/{slug}", {
    // The catalog resource and list_content_skills tool handle discovery.
    // Do not turn a generic resources/list request into an authenticated,
    // paid-plan API lookup.
    list: undefined,
    complete: {
      slug: async (value) => {
        const result = await fetchContentSkillCatalog();
        if (!result.ok) return [];
        return result.data.skills
          .map((skill) => skill.slug)
          .filter((slug) => slug.startsWith(value));
      },
    },
  });

  server.registerResource(
    "content-skill",
    contentSkillTemplate,
    {
      title: "Content Skill",
      description:
        "A full account-resolved Wonda content-skill workflow in Markdown",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const slugVariable = variables.slug;
      const slug = Array.isArray(slugVariable)
        ? slugVariable.join("/")
        : slugVariable;
      if (
        slug === undefined ||
        slug.length > CONTENT_SKILL_SLUG_MAX_LENGTH ||
        !CONTENT_SKILL_SLUG_PATTERN.test(slug)
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Invalid content skill slug",
        );
      }
      const result = await fetchContentSkill(slug);
      if (!result.ok) {
        throw new McpError(
          result.status === 404
            ? ErrorCode.InvalidParams
            : ErrorCode.InternalError,
          result.error,
        );
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: result.data,
          },
        ],
      };
    },
  );
}
