import { apiGet, apiGetText } from "./api.js";

export type ContentSkillSummary = {
  slug: string;
  name: string;
  description: string;
  source: "default" | "user";
  sourceDefaultSlug: string | null;
  hasDefaultUpdate: boolean;
  versionNo: number | null;
  updatedAt: string | null;
  hook: string | null;
  worth: string | null;
  platform: string | null;
  thumbnail: string | null;
  output: string | null;
  group: string | null;
};

export type ContentSkillCatalog = {
  skills: ContentSkillSummary[];
};

export const CONTENT_SKILL_SLUG_PATTERN = /^[a-z0-9-]+$/;
export const CONTENT_SKILL_SLUG_MAX_LENGTH = 80;

export function fetchContentSkillCatalog() {
  return apiGet<ContentSkillCatalog>("/skill/content");
}

export function fetchContentSkill(slug: string) {
  return apiGetText(`/skill/content/${encodeURIComponent(slug)}`);
}
