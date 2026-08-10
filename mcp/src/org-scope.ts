/**
 * Organization scope resolution for MCP sessions.
 *
 * Paid access can live in two places: a personal plan, or a seat in an
 * organization. The API resolves org scope from the `X-Wonda-Org` header
 * (see resolvePaidAccess in the api-service); with no header it falls back to
 * the caller's personal plan. An org-seat member whose personal account is
 * free therefore gets 403 `paid_plan_required` on every paid endpoint unless
 * something sets that header.
 *
 * The CLI sets it from sticky config (`wonda use --org <slug>`). MCP has no
 * equivalent, so this module supplies one:
 *
 *   1. `WONDA_ORG` (or `ApiContext.orgSlug`) always wins when set.
 *   2. Otherwise, the first 403 `paid_plan_required` triggers a one-shot
 *      lookup of the caller's organizations. When exactly one carries a seat,
 *      it is adopted for the rest of the process and the request is retried.
 *
 * Resolving lazily off a 403 (rather than eagerly at startup) means sessions
 * that already work — personal paid plans — never pay for the extra call and
 * never change behaviour: no 403, no adoption.
 */

/**
 * `seatPlanCode` is non-null exactly when the member occupies a billed seat;
 * free invitees carry null. We deliberately do NOT check the code against a
 * list of paid plans: this package ships standalone to npm and cannot import
 * PAID_PLAN_CODES from @degaus/shared, and a copy here would drift silently.
 * The server stays the authority — if an adopted seat turns out not to grant
 * paid access, the retry 403s exactly as the original request did.
 */
type OrganizationMembership = {
  organizationId: string;
  slug: string;
  name: string;
  role: "owner" | "admin" | "member";
  seatPlanCode: string | null;
};

export type SeatOrgResolution =
  | { kind: "adopted"; slug: string }
  | { kind: "none" }
  | { kind: "ambiguous"; slugs: string[] };

/**
 * Cached per API key, never globally: in remote/connector mode a single
 * process serves many accounts through runWithApiContext, so a shared cache
 * would attach one customer's org scope to another customer's requests and
 * bill the wrong wallet.
 */
const resolutionByApiKey = new Map<string, SeatOrgResolution>();

/** Bounds the cache in long-lived connector processes. */
const MAX_CACHED_KEYS = 500;

export function getCachedSeatOrgSlug(apiKey: string): string | undefined {
  const cached = resolutionByApiKey.get(apiKey);
  return cached?.kind === "adopted" ? cached.slug : undefined;
}

/** Test seam; also used when an API key is rotated mid-process. */
export function resetSeatOrgCache(): void {
  resolutionByApiKey.clear();
}

/**
 * One-shot lookup of the caller's organizations, caching whatever it finds
 * (including "none") so a failing session cannot re-query on every tool call.
 *
 * `/organizations` is on the api-service paywall allowlist, so this is
 * reachable from exactly the free-personal-plan accounts that need it.
 */
export async function resolveSeatOrg(args: {
  baseUrl: string;
  apiKey: string;
  userAgent: string;
}): Promise<SeatOrgResolution> {
  const cached = resolutionByApiKey.get(args.apiKey);
  if (cached) return cached;

  const resolution = await fetchSeatOrg(args);

  if (resolutionByApiKey.size >= MAX_CACHED_KEYS) {
    const oldest = resolutionByApiKey.keys().next();
    if (!oldest.done) resolutionByApiKey.delete(oldest.value);
  }
  resolutionByApiKey.set(args.apiKey, resolution);
  return resolution;
}

async function fetchSeatOrg(args: {
  baseUrl: string;
  apiKey: string;
  userAgent: string;
}): Promise<SeatOrgResolution> {
  let payload: unknown;
  try {
    const response = await fetch(`${args.baseUrl}/organizations`, {
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "User-Agent": args.userAgent,
      },
    });
    if (!response.ok) return { kind: "none" };
    payload = await response.json();
  } catch {
    // Network failure here must never mask the caller's real error; the
    // original 403 is returned unchanged.
    return { kind: "none" };
  }

  const seated = extractOrganizations(payload).filter(
    (organization) => organization.seatPlanCode !== null,
  );

  if (seated.length === 1) return { kind: "adopted", slug: seated[0]!.slug };
  if (seated.length > 1)
    return {
      kind: "ambiguous",
      slugs: seated.map((organization) => organization.slug),
    };
  return { kind: "none" };
}

function extractOrganizations(payload: unknown): OrganizationMembership[] {
  if (typeof payload !== "object" || payload === null) return [];
  const { organizations } = payload as {
    organizations?: unknown;
  };
  if (!Array.isArray(organizations)) return [];

  return organizations.filter(
    (entry): entry is OrganizationMembership =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as OrganizationMembership).slug === "string" &&
      (typeof (entry as OrganizationMembership).seatPlanCode === "string" ||
        (entry as OrganizationMembership).seatPlanCode === null),
  );
}

/**
 * Appended to the original 403 when the caller holds several seats. Naming the
 * slugs keeps the agent from guessing which org should pay.
 */
export function buildAmbiguousOrgHint(slugs: string[]): string {
  return (
    `\n\nYou hold a paid seat in ${slugs.length} organizations ` +
    `(${slugs.join(", ")}). Set WONDA_ORG=<slug> in the MCP server ` +
    `environment to choose which one pays for this session.`
  );
}
