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

// One row of the manage-subscriptions screen (?action=manage preload from
// bot.py's _encode_manage_url). No `fields` here on purpose (2026-08-30):
// embedding every row's full edit-field set made this URL long enough that
// Telegram clients silently refused to open the web_app button at all past
// a couple of subscriptions. Editing sends {action:"edit_open", profile_id}
// instead and the bot replies with a fresh, short single-profile edit link
// (same one /subs' own ✏️ button already uses).
export interface ManageItem {
  id: number;
  active: boolean;
  editable: boolean;
  summary: string;
}
