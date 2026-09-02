// REST client for the Mini App API (plan v2 §5). Every request carries the
// signed initData as X-Telegram-Init-Data; auth is header-based, not
// cookie-based, so `credentials: "include"` is deliberately NOT set --
// cross-origin cookies would additionally require
// Access-Control-Allow-Credentials plus a non-wildcard origin on the server
// for no benefit here (see docs/plan-miniapp-api.md §5's own note).

import { getInitData } from "./telegram";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// Thrown on a 401 response -- callers (subscriptionsStore) turn this into a
// "session expired" UI state rather than treating it like any other error,
// since the fix is "reopen the Mini App", not "retry the request".
export class UnauthorizedError extends Error {
  readonly name = "Unauthorized";
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** fetch() with the auth header attached and a JSON Content-Type default for
 * bodied requests. Never throws on a non-2xx status -- apiRequest() below
 * is what turns that into a typed error; this stays a thin fetch wrapper so
 * it is also usable directly (e.g. a caller that wants the raw Response). */
export function tmaFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-Telegram-Init-Data", getInitData());
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_BASE}${input}`, { ...init, headers });
}

/** JSON in, JSON out, typed. 401 -> UnauthorizedError; any other non-2xx ->
 * ApiError carrying the status and the server's plain-text/JSON detail. */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await tmaFetch(path, init);
  if (res.status === 401) {
    throw new UnauthorizedError("session expired");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.text()) || detail;
    } catch {
      // body already consumed or unreadable -- statusText is enough
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}
