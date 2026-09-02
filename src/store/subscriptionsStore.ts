import { create } from "zustand";
import { apiRequest, UnauthorizedError, ApiError } from "../lib/apiClient";
import type { SearchPayload, Subscription } from "../lib/types";

interface SubscriptionsState {
  items: Subscription[];
  loading: boolean;
  // Set on any non-401 request failure; cleared on the next successful
  // request or explicitly via clearError(). A 401 does NOT set this -- it
  // sets sessionExpired instead, a distinct state the UI shows differently
  // (plan v2 §5: "401 -> флаг sessionExpired в UI, без закрытия апплета").
  error: string | null;
  sessionExpired: boolean;

  fetchAll: () => Promise<void>;
  create: (payload: Omit<SearchPayload, "action" | "profile_id">) => Promise<Subscription | null>;
  patch: (id: number, fields: Partial<Omit<SearchPayload, "action" | "profile_id">>) => Promise<void>;
  toggle: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  clearError: () => void;
}

// Every mutator follows the same shape: apply the optimistic change to
// `items` first (so the UI reacts on the same tick as the tap), fire the
// request, and on failure restore the pre-request snapshot -- a plain
// array swap, not a diff, since these lists are a handful of rows and a
// snapshot rollback can't drift from what "undo this" actually means.
export const useSubscriptionsStore = create<SubscriptionsState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  sessionExpired: false,

  clearError: () => set({ error: null }),

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const res = await apiRequest<{ items: Subscription[] }>("/api/subscriptions");
      set({ items: res.items, loading: false });
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        set({ loading: false, sessionExpired: true });
        return;
      }
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  create: async (payload) => {
    const before = get().items;
    const tempId = `temp-${Date.now()}`;
    const optimistic: Subscription = { ...payload, id: tempId, active: true };
    set({ items: [...before, optimistic], error: null });
    try {
      const created = await apiRequest<Subscription>("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify({ payload }),
      });
      set({ items: get().items.map((it) => (it.id === tempId ? created : it)) });
      return created;
    } catch (e) {
      set({ items: before });
      if (e instanceof UnauthorizedError) {
        set({ sessionExpired: true });
      } else {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
      return null;
    }
  },

  patch: async (id, fields) => {
    const before = get().items;
    set({
      items: before.map((it) => (it.id === id ? { ...it, ...fields } : it)),
      error: null,
    });
    try {
      const updated = await apiRequest<Subscription>("/api/subscriptions", {
        method: "PATCH",
        body: JSON.stringify({ id, patch: fields }),
      });
      set({ items: get().items.map((it) => (it.id === id ? updated : it)) });
    } catch (e) {
      set({ items: before });
      if (e instanceof UnauthorizedError) {
        set({ sessionExpired: true });
      } else {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    }
  },

  toggle: async (id) => {
    const before = get().items;
    set({
      items: before.map((it) => (it.id === id ? { ...it, active: !it.active } : it)),
      error: null,
    });
    try {
      await apiRequest<{ id: number; active: boolean }>("/api/subscriptions/toggle", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
    } catch (e) {
      set({ items: before });
      if (e instanceof UnauthorizedError) {
        set({ sessionExpired: true });
      } else {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    }
  },

  remove: async (id) => {
    const before = get().items;
    set({ items: before.filter((it) => it.id !== id), error: null });
    try {
      await apiRequest<{ ok: boolean }>("/api/subscriptions", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
    } catch (e) {
      set({ items: before });
      if (e instanceof UnauthorizedError) {
        set({ sessionExpired: true });
      } else {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    }
  },
}));

// Re-exported so callers can narrow a caught error without importing
// apiClient directly (kept as one import surface: "the store" for state,
// "the store's own client re-export" for the error types it can produce).
export { ApiError, UnauthorizedError };
