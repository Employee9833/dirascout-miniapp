import { describe, it, expect, beforeEach } from "vitest";
import { useWizardStore } from "./wizardStore";

beforeEach(() => {
  useWizardStore.getState().reset();
});

describe("wizardStore: pane navigation (hub-and-spoke, 2026-09-04)", () => {
  it("starts on the hub", () => {
    expect(useWizardStore.getState().pane).toBeNull();
  });

  it("openPane() opens one, closePane() returns to the hub", () => {
    useWizardStore.getState().openPane("price");
    expect(useWizardStore.getState().pane).toBe("price");
    useWizardStore.getState().closePane();
    expect(useWizardStore.getState().pane).toBeNull();
  });

  it("opening a second pane replaces the first (no nesting)", () => {
    useWizardStore.getState().openPane("price");
    useWizardStore.getState().openPane("location");
    expect(useWizardStore.getState().pane).toBe("location");
  });
});

describe("wizardStore: set('city', ...) clears stale districts", () => {
  it("changing city drops districts picked for the old city", () => {
    const { set, toggleDistrict } = useWizardStore.getState();
    set("city", "אשקלון");
    toggleDistrict("אפרידר");
    expect(useWizardStore.getState().districts).toEqual(["אפרידר"]);

    set("city", "אשדוד");
    expect(useWizardStore.getState().districts).toEqual([]);
    expect(useWizardStore.getState().city).toBe("אשדוד");
  });

  it("re-setting the SAME city does not clear districts (not a real change)", () => {
    const { set, toggleDistrict } = useWizardStore.getState();
    set("city", "אשקלון");
    toggleDistrict("אפרידר");
    set("city", "אשקלון");
    expect(useWizardStore.getState().districts).toEqual(["אפרידר"]);
  });

  it("other fields are unaffected by the city special-case", () => {
    const { set } = useWizardStore.getState();
    set("name", "test");
    set("price_min", 3000);
    expect(useWizardStore.getState().name).toBe("test");
    expect(useWizardStore.getState().price_min).toBe(3000);
  });
});

describe("wizardStore: toggleDistrict / toggleRequired", () => {
  it("toggles a district on, then off", () => {
    const { toggleDistrict } = useWizardStore.getState();
    toggleDistrict("אפרידר");
    expect(useWizardStore.getState().districts).toEqual(["אפרידר"]);
    toggleDistrict("אפרידר");
    expect(useWizardStore.getState().districts).toEqual([]);
  });

  it("toggling one district does not disturb another already selected", () => {
    const { toggleDistrict } = useWizardStore.getState();
    toggleDistrict("אפרידר");
    toggleDistrict("ברנע");
    expect(useWizardStore.getState().districts.sort()).toEqual(["אפרידר", "ברנע"].sort());
  });

  it("toggleRequired mirrors toggleDistrict's on/off shape", () => {
    const { toggleRequired } = useWizardStore.getState();
    toggleRequired("rooms");
    expect(useWizardStore.getState().required_fields).toEqual(["rooms"]);
    toggleRequired("rooms");
    expect(useWizardStore.getState().required_fields).toEqual([]);
  });
});

describe("wizardStore: loadFromPreload", () => {
  it("fills every field from a partial payload, defaulting the rest", () => {
    useWizardStore.getState().loadFromPreload({
      profile_id: 5, name: "Трёшка", city: "אשקלון", rooms_min: 3,
    });
    const s = useWizardStore.getState();
    expect(s.action).toBe("edit");
    expect(s.profile_id).toBe(5);
    expect(s.name).toBe("Трёшка");
    expect(s.city).toBe("אשקלון");
    expect(s.rooms_min).toBe(3);
    // fields the payload didn't carry fall back to the same defaults `new` uses
    expect(s.districts).toEqual([]);
    expect(s.mamad).toBe("any");
    expect(s.min_quality).toBe("partial");
  });

  it("an explicit null/[] in the payload is honored, not treated as absent", () => {
    useWizardStore.getState().loadFromPreload({ city: null, districts: [] });
    const s = useWizardStore.getState();
    expect(s.city).toBeNull();
    expect(s.districts).toEqual([]);
  });
});

describe("wizardStore: toPayload", () => {
  it("always sends deal_type='rent_offer' (the bot's only value for it today)", () => {
    expect(useWizardStore.getState().toPayload().deal_type).toBe("rent_offer");
  });

  it("reflects the current store state, including action/profile_id for edit", () => {
    useWizardStore.getState().loadFromPreload({ profile_id: 9, name: "тест", rooms_min: 2, rooms_max: 5 });
    const payload = useWizardStore.getState().toPayload();
    expect(payload.action).toBe("edit");
    expect(payload.profile_id).toBe(9);
    expect(payload.rooms_min).toBe(2);
    expect(payload.rooms_max).toBe(5);
  });

  it("a fresh (new) profile has action='new' and profile_id=null", () => {
    const payload = useWizardStore.getState().toPayload();
    expect(payload.action).toBe("new");
    expect(payload.profile_id).toBeNull();
  });
});

describe("wizardStore: reset", () => {
  it("returns every field to its initial value, including the open pane", () => {
    const s = useWizardStore.getState();
    s.set("name", "x");
    s.toggleDistrict("אפרידר");
    s.openPane("rooms");
    s.reset();
    const fresh = useWizardStore.getState();
    expect(fresh.name).toBe("");
    expect(fresh.districts).toEqual([]);
    expect(fresh.pane).toBeNull();
  });
});

// The user stopped naming searches (2026-09-04, "один фильтр основной"),
// but `name` is still a required non-empty API field -- so toPayload() must
// always produce one, and must never send "".
describe("wizardStore: auto-generated name", () => {
  it("describes the criteria the user actually set", () => {
    const s = useWizardStore.getState();
    s.set("city", "אשקלון");
    s.set("rooms_min", 3);
    s.set("rooms_max", 4);
    s.set("price_max", 4800);
    const name = useWizardStore.getState().toPayload().name;
    expect(name).toContain("Ашкелон");
    expect(name).toContain("3-4");
    expect(name).toContain("4800");
  });

  it("never yields an empty name, even with nothing set at all", () => {
    expect(useWizardStore.getState().toPayload().name.trim()).not.toBe("");
  });

  it("an existing profile's own name is preserved over the auto one", () => {
    useWizardStore.getState().loadFromPreload({ name: "Моя старая подписка", city: "אשקלון" });
    expect(useWizardStore.getState().toPayload().name).toBe("Моя старая подписка");
  });
});
