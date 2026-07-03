import { AsyncLocalStorage } from "node:async_hooks";

import { buildUserAgent } from "./version.js";

const DEFAULT_BASE_URL = "https://api.wondercat.ai/api/v1";

export type ApiContext = {
  apiKey: string;
  baseUrl?: string;
};

type NormalizedApiContext = {
  apiKey?: string;
  baseUrl: string;
};

const apiContextStorage = new AsyncLocalStorage<NormalizedApiContext>();

export function runWithApiContext<T>(
  context: ApiContext,
  callback: () => T,
): T {
  return apiContextStorage.run(normalizeApiContext(context), callback);
}

function getApiContext(): NormalizedApiContext {
  const context = apiContextStorage.getStore();
  if (context) return context;

  return normalizeApiContext({
    apiKey: process.env.WONDA_API_KEY ?? process.env.WONDERCAT_API_KEY ?? "",
    baseUrl: process.env.WONDA_BASE_URL,
  });
}

function normalizeApiContext(context: {
  apiKey?: string;
  baseUrl?: string;
}): NormalizedApiContext {
  return {
    apiKey: context.apiKey,
    baseUrl: (context.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
  };
}

function buildUrl(path: string): string {
  const { baseUrl } = getApiContext();
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export type ApiResult<T = unknown> =
  | {
      ok: true;
      data: T;
      status: number;
      /** Informational update/broadcast text appended to tool output. */
      notice?: string;
      /** Hard staleness warning prepended to tool output. */
      warning?: string;
      error?: never;
    }
  | { ok: false; error: string; status: number; data?: never };

export async function apiGet<T = unknown>(
  path: string,
  query?: Record<string, string | undefined>,
): Promise<ApiResult<T>> {
  const headers = getAuthHeaders();
  if (headers.ok === false) return apiError(headers);

  const url = new URL(buildUrl(path));
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, { headers: headers.data });
  return parseResponse<T>(response);
}

export async function apiPost<T = unknown>(
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers = getAuthHeaders();
  if (headers.ok === false) return apiError(headers);

  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: { ...headers.data, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parseResponse<T>(response);
}

export async function apiPut<T = unknown>(
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers = getAuthHeaders();
  if (headers.ok === false) return apiError(headers);

  const response = await fetch(buildUrl(path), {
    method: "PUT",
    headers: { ...headers.data, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parseResponse<T>(response);
}

export async function apiPatch<T = unknown>(
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers = getAuthHeaders();
  if (headers.ok === false) return apiError(headers);

  const response = await fetch(buildUrl(path), {
    method: "PATCH",
    headers: { ...headers.data, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parseResponse<T>(response);
}

export async function apiDelete<T = unknown>(
  path: string,
): Promise<ApiResult<T>> {
  const headers = getAuthHeaders();
  if (headers.ok === false) return apiError(headers);

  const response = await fetch(buildUrl(path), {
    method: "DELETE",
    headers: headers.data,
  });
  return parseResponse<T>(response);
}

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
): Promise<ApiResult<T>> {
  const headers = getAuthHeaders();
  if (headers.ok === false) return apiError(headers);

  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: headers.data,
    body: formData,
  });
  return parseResponse<T>(response);
}

function getAuthHeaders(): ApiResult<Record<string, string>> {
  const { apiKey } = getApiContext();
  if (apiKey === undefined || apiKey.trim() === "") {
    return {
      ok: false,
      error:
        "WONDA_API_KEY environment variable is required.\n" +
        "Get your API key at https://wonda.sh -> Settings -> API Keys",
      status: 401,
    };
  }

  return {
    ok: true,
    data: {
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": buildUserAgent(),
    },
    status: 200,
  };
}

function apiError<T>(result: { error: string; status: number }): ApiResult<T> {
  return { ok: false, error: result.error, status: result.status };
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
