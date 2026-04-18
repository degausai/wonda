const DEFAULT_BASE_URL = "https://api.wondercat.ai/api/v1";

const baseUrl = (process.env.WONDA_BASE_URL ?? DEFAULT_BASE_URL).replace(
  /\/$/,
  "",
);
const apiKey = process.env.WONDA_API_KEY ?? process.env.WONDERCAT_API_KEY;

function buildUrl(path: string): string {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

if (!apiKey) {
  throw new Error(
    "WONDA_API_KEY environment variable is required.\n" +
      "Get your API key at https://wonda.sh → Settings → API Keys",
  );
}

const headers: Record<string, string> = {
  Authorization: `Bearer ${apiKey}`,
};

type ApiResult<T = unknown> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number };

export async function apiGet<T = unknown>(
  path: string,
  query?: Record<string, string | undefined>,
): Promise<ApiResult<T>> {
  const url = new URL(buildUrl(path));
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, { headers });
  return parseResponse<T>(response);
}

export async function apiPost<T = unknown>(
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parseResponse<T>(response);
}

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
): Promise<ApiResult<T>> {
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  return parseResponse<T>(response);
}

function extractError(data: unknown, status: number): string {
  const fallback = `HTTP ${status}`;

  if (typeof data === "string" && data.length > 0) return data;
  if (typeof data !== "object" || data === null) return fallback;

  const errorField = (data as Record<string, unknown>).error;
  if (typeof errorField === "string" && errorField.length > 0)
    return errorField;
  if (typeof errorField === "object" && errorField !== null) {
    const message = (errorField as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }

  return fallback;
}

async function parseResponse<T>(response: Response): Promise<ApiResult<T>> {
  const text = await response.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = text as T;
  }

  if (!response.ok) {
    return {
      ok: false,
      error: extractError(data, response.status),
      status: response.status,
    };
  }

  return { ok: true, data, status: response.status };
}
