import { create } from "zustand";
import type { SearchPayload } from "../lib/types";
import { CITIES } from "../data/cities";

// Hebrew city code -> a short Russian label for the auto-generated profile
// name. Built from the same generated table the pickers use, so a city
// added to CITY_REGISTRY shows up here without a second edit.
const CITY_LABELS: Record<string, string> = Object.fromEntries(
  CITIES.cities.map((c) => [c.code, c.labels.ru]),
);

// The hub-and-spoke screen (2026-09-04) replaced the four-step linear
// wizard: one settings-style list where every row shows its own current
// value and opens a single-purpose pane. `null` is the hub itself.
// The panes are finer-grained than the old steps were -- price/rooms/sqm/
// floor each get their own, because the hub row for each has to show its
// own summary, which is the whole point of the screen.
export type PaneKey =
  | "location"
  | "price"
  | "rooms"
  | "sqm"
  | "floor"
  | "mamad"
  | "quality";

interface WizardState {
  pane: PaneKey | null;
  // Fields mirror SearchPayload (null = unset).
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

  // Mirrors search_profile.active. Only meaningful once the profile exists
  // -- a brand-new search has nothing to pause, so the hub hides the
  // Notifications row until there is a profile_id. Toggling it does NOT go
  // through the save payload: `active` is not a _miniapp_to_fields field,
  // it has its own owner-checked endpoint (POST /api/subscriptions/toggle),
  // shared with the bot's own pause button.
  active: boolean;

  // Preload (edit mode) source.
  action: "new" | "edit";
  profile_id: number | null;

  openPane: (p: PaneKey) => void;
  closePane: () => void;
  set: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
  toggleDistrict: (d: string) => void;
  toggleRequired: (f: string) => void;
  loadFromPreload: (p: Partial<SearchPayload>) => void;
  autoName: () => string;
  toPayload: () => SearchPayload;
  reset: () => void;
}

const initial = {
  pane: null as PaneKey | null,
  name: "",
  city: null,
  districts: [],
  rooms_min: null,
  rooms_max: null,
  price_min: null,
  price_max: null,
  sqm_min: null,
  sqm_max: null,
  floor_min: null,
  floor_max: null,
  mamad: "any" as const,
  min_quality: "partial" as const,
  required_fields: [],
  active: true,
  action: "new" as const,
  profile_id: null,
};

export const useWizardStore = create<WizardState>((set, get) => ({
  ...initial,

  openPane: (p) => set({ pane: p }),
  closePane: () => set({ pane: null }),

  // A city change clears districts (found live, 2026-09-02: pick a
  // district in city A, switch to city B, and it silently stays in the
  // payload -- city B's district list doesn't contain it, so it never even
  // shows as selected to un-pick, and the saved profile can never match
  // anything). Every OTHER field via `set` unconditionally overwrites, so
  // this is the one key that needs the special case, not a reason to give
  // every field its own setter.
  set: (key, value) =>
    set((s) => {
      if (key === "city" && value !== s.city) {
        return { city: value, districts: [] } as Partial<WizardState>;
      }
      return { [key]: value } as Partial<WizardState>;
    }),

  toggleDistrict: (d) =>
    set((s) => ({
      districts: s.districts.includes(d)
        ? s.districts.filter((x) => x !== d)
        : [...s.districts, d],
    })),

  toggleRequired: (f) =>
    set((s) => ({
      required_fields: s.required_fields.includes(f)
        ? s.required_fields.filter((x) => x !== f)
        : [...s.required_fields, f],
    })),

  loadFromPreload: (p) =>
    set({
      action: "edit",
      profile_id: p.profile_id ?? null,
      name: p.name ?? "",
      city: p.city ?? null,
      districts: p.districts ?? [],
      rooms_min: p.rooms_min ?? null,
      rooms_max: p.rooms_max ?? null,
      price_min: p.price_min ?? null,
      price_max: p.price_max ?? null,
      sqm_min: p.sqm_min ?? null,
      sqm_max: p.sqm_max ?? null,
      floor_min: p.floor_min ?? null,
      floor_max: p.floor_max ?? null,
      mamad: p.mamad ?? "any",
      min_quality: p.min_quality ?? "partial",
      required_fields: p.required_fields ?? [],
      active: (p as { active?: boolean }).active ?? true,
    }),

  // The user no longer names their search (2026-09-04: "сделать один
  // фильтр основной"). `name` is still a required, non-empty API field and
  // still what /matches and the bot's own lists label a profile with, so it
  // is DERIVED from the criteria instead of removed -- an auto-label the
  // user never has to think about, rather than a second concept to manage.
  // Kept in the store (not computed only at submit) so an edit of an
  // existing profile preserves whatever name that profile already had if
  // the criteria have not changed enough to redescribe it.
  autoName: () => {
    const s = get();
    const bits: string[] = [];
    const city = CITY_LABELS[s.city ?? ""];
    if (city) bits.push(city);
    if (s.districts.length === 1) bits.push(s.districts[0]);
    else if (s.districts.length > 1) bits.push(`${s.districts.length} р-нов`);
    const rooms = s.rooms_min ?? s.rooms_max;
    if (rooms != null) bits.push(`${s.rooms_min ?? ""}-${s.rooms_max ?? ""}`.replace(/^-|-$/, "") + " комн");
    if (s.price_max != null) bits.push(`до ${s.price_max} ₪`);
    else if (s.price_min != null) bits.push(`от ${s.price_min} ₪`);
    return bits.join(" · ") || "Мой поиск";
  },

  toPayload: () => {
    const s = get();
    return {
      action: s.action,
      profile_id: s.profile_id,
      name: s.name.trim() || get().autoName(),
      city: s.city,
      districts: s.districts,
      rooms_min: s.rooms_min,
      rooms_max: s.rooms_max,
      price_min: s.price_min,
      price_max: s.price_max,
      sqm_min: s.sqm_min,
      sqm_max: s.sqm_max,
      floor_min: s.floor_min,
      floor_max: s.floor_max,
      mamad: s.mamad,
      min_quality: s.min_quality,
      required_fields: s.required_fields,
      deal_type: "rent_offer",
    };
  },

  reset: () => set({ ...initial }),
}));
