import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  tmaFetch,
  apiRequest,
  UnauthorizedError,
  ApiError,
  REQUEST_TIMEOUT_MS,
} from "./apiClient";

beforeEach(() => {
  (window as any).Telegram = { WebApp: { initData: "auth_date=1&hash=abc" } };
  vi.restoreAllMocks();
});

describe("tmaFetch", () => {
  it("attaches X-Telegram-Init-Data on every request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await tmaFetch("/api/subscriptions");
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get("X-Telegram-Init-Data")).toBe("auth_date=1&hash=abc");
  });

  it("defaults Content-Type to application/json when a body is present", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await tmaFetch("/api/subscriptions", { method: "POST", body: JSON.stringify({ a: 1 }) });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("does not set Content-Type on a bodyless GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await tmaFetch("/api/subscriptions");
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).has("Content-Type")).toBe(false);
  });

  it("respects an explicitly-set Content-Type instead of overriding it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await tmaFetch("/x", { body: "raw", headers: { "Content-Type": "text/plain" } });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get("Content-Type")).toBe("text/plain");
  });

  it("does not set credentials: include (header-based auth, plan v2 §5)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await tmaFetch("/api/subscriptions");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBeUndefined();
  });
});

describe("apiRequest: hung request", () => {
  it("aborts instead of hanging forever, and reports it as a readable error", async () => {
    // Regression: with no timeout a stalled fetch never settles, so the
    // caller's `loading` flag stays true and the screen shows a spinner
    // with no error and no exit (reported live 2026-09-02 as "вечная
    // загрузка"). The path to the API is tunnel -> Tailscale exit node ->
    // Cloudflare, any hop of which can stall without closing the socket.
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn((_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            // never resolves on its own -- only the abort signal ends it
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")));
          }),
        ),
      );
      const p = apiRequest("/api/subscriptions");
      const assertion = expect(p).rejects.toMatchObject({
        status: 0,
        message: expect.stringContaining("не отвечает"),
      });
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 10);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("apiRequest", () => {
  it("returns the parsed JSON body on 2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ a: 1 }) }));
    await expect(apiRequest<{ a: number }>("/x")).resolves.toEqual({ a: 1 });
  });

  it("throws UnauthorizedError on 401, distinct from ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(apiRequest("/x")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws ApiError with the status and server detail on other non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 422, statusText: "Unprocessable", text: async () => "«name»: обязательно" }),
    );
    try {
      await apiRequest("/x");
      throw new Error("must have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(422);
      expect((e as ApiError).message).toBe("«name»: обязательно");
    }
  });
});
