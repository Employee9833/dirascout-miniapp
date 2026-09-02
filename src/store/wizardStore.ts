import { create } from "zustand";
import type { SearchPayload } from "../lib/types";

export type WizardStep = 0 | 1 | 2 | 3;

interface WizardState {
  step: WizardStep;
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

  // Preload (edit mode) source.
  action: "new" | "edit";
  profile_id: number | null;

  next: () => void;
  back: () => void;
  goTo: (s: WizardStep) => void;
  set: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
  toggleDistrict: (d: string) => void;
  toggleRequired: (f: string) => void;
  loadFromPreload: (p: Partial<SearchPayload>) => void;
  toPayload: () => SearchPayload;
  reset: () => void;
}

const initial = {
  step: 0 as WizardStep,
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
  action: "new" as const,
  profile_id: null,
};

export const useWizardStore = create<WizardState>((set, get) => ({
  ...initial,

  next: () => set((s) => ({ step: Math.min(3, s.step + 1) as WizardStep })),
  back: () => set((s) => ({ step: Math.max(0, s.step - 1) as WizardStep })),
  goTo: (s) => set({ step: s }),

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
    }),

  toPayload: () => {
    const s = get();
    return {
      action: s.action,
      profile_id: s.profile_id,
      name: s.name,
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
