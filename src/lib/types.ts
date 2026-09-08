export interface ThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

// Flat payload understood by the bot's _miniapp_to_fields (scripts/_miniapp_integration.py).
// Mirrors the matched profile columns (search_profile schema).
export interface SearchPayload {
  action: "new" | "edit";
  profile_id?: number | null;
  name: string;
  city: string | null;
  districts: string[];
  rooms_min: number | null;
  rooms_max: number | null;
  price_min: number | null;
  price_max: number | null;
  sqm_min: number | null;
  sqm_max: number | null;
  floor_min: number | null;
  floor_max: number | null;
  mamad: "any" | "required" | "strict";
  min_quality: "exact" | "partial";
  required_fields: string[];
  deal_type: "rent_offer";
}

// One row of the manage-subscriptions screen. Shape mirrors api_server.py's
// _serialize_profile() response, so it round-trips straight into the wizard
// store via loadFromPreload() -- editing (2026-09-01, REST) no longer needs
// a bot round trip for the full field set: GET /api/subscriptions already
// returns everything, so there is no URL-length ceiling to work around
// (that ceiling was specific to encoding fields into a Telegram deep link).
export interface Subscription extends Omit<SearchPayload, "action" | "profile_id"> {
  // number for a real row; "temp-<ts>" for an optimistic create not yet
  // confirmed by the server (subscriptionsStore.create, plan v2 §5) --
  // replaced with the real numeric id from the 201 response, or dropped on
  // failure. Never sent back to the API while still a string.
  id: number | string;
  active: boolean;
}

// scripts/matching.py's CITY_PROFILE_NAME, duplicated here the same way
// api_server.py/bot.py each hold their own literal copy -- the personal
// City profile has no dedicated flag on the row, so every consumer that
// needs to recognize it (hide the edit button, block delete client-side as
// a UX hint -- the API enforces the real block server-side either way)
// checks the name directly.
export const CITY_PROFILE_NAME = "Личный City-поиск";

// --- matches feed (2026-09-07) --------------------------------------------
// Mirrors api_server.py's _match_card() / list_match_profiles(). Deliberately
// separate from `Subscription`: that one round-trips back into the wizard as
// an editable payload, these are read-only projections of a match+listing
// pair and never get sent anywhere.

/** One row of the matches index: a search plus how much it has found. */
export interface MatchProfile {
  id: number;
  name: string;
  active: boolean;
  exact: number;
  partial: number;
  last_matched_at: string | null;
}

export type MatchQuality = "exact" | "partial";

/** One listing card in a search's feed. Every field except the identifiers
 * can be null — that is the archive's normal state, not an error (the whole
 * "absence is not mismatch" rule the matcher runs on), so the UI renders
 * what exists and stays quiet about the rest. */
export interface MatchCard {
  match_id: number;
  listing_id: number;
  quality: MatchQuality;
  matched_at: string;
  /** Which filtered fields the listing never stated — why this is `partial`. */
  unknown_fields: string[];
  price: number | null;
  rooms: number | null;
  floor: number | null;
  sqm: number | null;
  /** 1 present, 0 confirmed absent, null unknown (tri-state, 2026-09-07). */
  mamad: number | null;
  seller: "agent" | "private" | null;
  city: string | null;
  district: string | null;
  street: string | null;
  text: string;
  photos: string[];
  url: string | null;
  sources: string[];
  times_seen: number;
  posted_at: number | null;
  first_seen: string;
  /** Premium liveness probe: 1 still on its board, 0 gone from it, null
   * never checked (every free-tier card). Tri-state — null is NOT "alive". */
  alive?: number | null;
  checked_at?: string | null;
}
