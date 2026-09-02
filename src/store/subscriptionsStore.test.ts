import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSubscriptionsStore } from "./subscriptionsStore";
import type { SearchPayload, Subscription } from "../lib/types";

function payload(overrides: Partial<SearchPayload> = {}): Omit<SearchPayload, "action" | "profile_id"> {
  return {
    name: "Тест",
    city: "אשקלון",
    districts: [],
    rooms_min: null,
    rooms_max: null,
    price_min: null,
    price_max: null,
    sqm_min: null,
    sqm_max: null,
    floor_min: null,
    floor_max: null,
    mamad: "any",
    min_quality: "partial",
    required_fields: [],
    deal_type: "rent_offer",
    ...overrides,
  };
}

function existingItem(overrides: Partial<Subscription> = {}): Subscription {
  return { ...payload(), id: 3, active: true, ...overrides };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "err",
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  useSubscriptionsStore.setState({ items: [], loading: false, error: null, sessionExpired: false });
  vi.restoreAllMocks();
});

describe("subscriptionsStore.fetchAll", () => {
  it("populates items on success", async () => {
    const item = existingItem();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { items: [item] })));
    await useSubscriptionsStore.getState().fetchAll();
    expect(useSubscriptionsStore.getState().items).toEqual([item]);
    expect(useSubscriptionsStore.getState().loading).toBe(false);
  });

  it("sets sessionExpired on 401, does not set error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { detail: "no" })));
    await useSubscriptionsStore.getState().fetchAll();
    expect(useSubscriptionsStore.getState().sessionExpired).toBe(true);
    expect(useSubscriptionsStore.getState().error).toBeNull();
  });

  it("sets error on a non-401 failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));
    await useSubscriptionsStore.getState().fetchAll();
    expect(useSubscriptionsStore.getState().error).toBeTruthy();
    expect(useSubscriptionsStore.getState().sessionExpired).toBe(false);
  });
});

describe("subscriptionsStore.create", () => {
  it("optimistically adds a temp-id row, then swaps in the real one on success", async () => {
    const created = existingItem({ id: 42 });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, created));
    vi.stubGlobal("fetch", fetchMock);
    const promise = useSubscriptionsStore.getState().create(payload());
    // synchronous optimistic insert, before the request resolves
    const optimistic = useSubscriptionsStore.getState().items[0];
    expect(typeof optimistic.id).toBe("string");
    expect(String(optimistic.id).startsWith("temp-")).toBe(true);
    const result = await promise;
    expect(result).toEqual(created);
    expect(useSubscriptionsStore.getState().items).toEqual([created]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/subscriptions"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rolls back the optimistic row on failure and returns null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(422, { detail: "bad" })));
    const result = await useSubscriptionsStore.getState().create(payload());
    expect(result).toBeNull();
    expect(useSubscriptionsStore.getState().items).toEqual([]);
    expect(useSubscriptionsStore.getState().error).toBeTruthy();
  });
});

describe("subscriptionsStore.patch", () => {
  it("optimistically merges, then replaces with the server row on success", async () => {
    useSubscriptionsStore.setState({ items: [existingItem()] });
    const updated = existingItem({ price_max: 5000 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, updated)));
    const promise = useSubscriptionsStore.getState().patch(3, { price_max: 5000 });
    expect(useSubscriptionsStore.getState().items[0].price_max).toBe(5000); // optimistic
    await promise;
    expect(useSubscriptionsStore.getState().items[0]).toEqual(updated);
  });

  it("rolls back to the pre-patch snapshot on failure", async () => {
    const before = existingItem();
    useSubscriptionsStore.setState({ items: [before] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, { detail: "not found" })));
    await useSubscriptionsStore.getState().patch(3, { price_max: 5000 });
    expect(useSubscriptionsStore.getState().items).toEqual([before]);
  });
});

describe("subscriptionsStore.toggle / remove", () => {
  it("toggle flips active optimistically and rolls back on failure", async () => {
    useSubscriptionsStore.setState({ items: [existingItem({ active: true })] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));
    await useSubscriptionsStore.getState().toggle(3);
    expect(useSubscriptionsStore.getState().items[0].active).toBe(true); // rolled back
    expect(useSubscriptionsStore.getState().error).toBeTruthy();
  });

  it("remove optimistically drops the row and restores it on failure", async () => {
    const item = existingItem();
    useSubscriptionsStore.setState({ items: [item] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, {})));
    await useSubscriptionsStore.getState().remove(3);
    expect(useSubscriptionsStore.getState().items).toEqual([item]);
  });

  it("remove succeeds and stays removed", async () => {
    useSubscriptionsStore.setState({ items: [existingItem()] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { ok: true })));
    await useSubscriptionsStore.getState().remove(3);
    expect(useSubscriptionsStore.getState().items).toEqual([]);
  });
});
