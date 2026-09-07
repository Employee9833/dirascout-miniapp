import { create } from "zustand";
import { fetchMatchFeed, fetchMatchProfiles, ApiError, UnauthorizedError } from "../lib/apiClient";
import type { MatchCard, MatchProfile, MatchQuality } from "../lib/types";

interface MatchesState {
  profiles: MatchProfile[];
  profilesLoading: boolean;
  /** Feed cache keyed `${profileId}:${quality}` -- switching tabs back and
   * forth is the most common interaction here, and re-fetching a list the
   * user just looked at through the tunnel (several hops, see apiClient's
   * timeout note) makes the toggle feel broken. Cleared wholesale on
   * refresh, never invalidated per-entry: nothing in this screen writes. */
  feeds: Record<string, MatchCard[]>;
  feedLoading: boolean;
  error: string | null;
  sessionExpired: boolean;

  loadProfiles: () => Promise<void>;
  loadFeed: (profileId: number, quality: MatchQuality) => Promise<void>;
  reset: () => void;
}

export const feedKey = (profileId: number, quality: MatchQuality) =>
  `${profileId}:${quality}`;

export const useMatchesStore = create<MatchesState>((set, get) => ({
  profiles: [],
  profilesLoading: false,
  feeds: {},
  feedLoading: false,
  error: null,
  sessionExpired: false,

  loadProfiles: async () => {
    set({ profilesLoading: true, error: null });
    try {
      const { items } = await fetchMatchProfiles();
      set({ profiles: items, profilesLoading: false });
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        set({ sessionExpired: true, profilesLoading: false });
        return;
      }
      set({
        error: e instanceof ApiError ? e.message : String(e),
        profilesLoading: false,
      });
    }
  },

  loadFeed: async (profileId, quality) => {
    const key = feedKey(profileId, quality);
    if (get().feeds[key]) return;          // cached, see `feeds` above
    set({ feedLoading: true, error: null });
    try {
      const { items } = await fetchMatchFeed(profileId, quality);
      set((s) => ({ feeds: { ...s.feeds, [key]: items }, feedLoading: false }));
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        set({ sessionExpired: true, feedLoading: false });
        return;
      }
      set({
        error: e instanceof ApiError ? e.message : String(e),
        feedLoading: false,
      });
    }
  },

  reset: () => set({ profiles: [], feeds: {}, error: null, sessionExpired: false }),
}));
