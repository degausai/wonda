// Soft out-of-band hints riding successful twin action results (spec:
// docs/superpowers/specs/2026-07-13-relay-update-notices-design.md). The
// server rate-limits them (e.g. relay_update_available: one per device per
// 24h); this layer renders each notice's message as one plain line appended
// after the JSON payload so the agent surfaces it to the user. Codes are
// deliberately not interpreted here: an unknown code still renders its
// message, so new server-side notice types need no MCP release.

type WithNotices = { notices?: unknown };

export function splitTwinNotices(data: unknown): {
  data: unknown;
  noticeLines: string[];
} {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { data, noticeLines: [] };
  }
  const { notices, ...rest } = data as Record<string, unknown> & WithNotices;
  if (!Array.isArray(notices)) {
    return { data, noticeLines: [] };
  }
  const noticeLines = notices
    .map((notice) =>
      notice !== null &&
      typeof notice === "object" &&
      typeof (notice as { message?: unknown }).message === "string"
        ? (notice as { message: string }).message
        : undefined,
    )
    .filter((message): message is string => message !== undefined);
  return { data: rest, noticeLines };
}
