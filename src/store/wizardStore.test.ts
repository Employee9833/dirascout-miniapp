import { describe, it, expect, beforeEach } from "vitest";
import { useWizardStore } from "./wizardStore";

beforeEach(() => {
  useWizardStore.getState().reset();
});

describe("wizardStore: step navigation", () => {
  it("next() advances, capped at step 3", () => {
    const { next } = useWizardStore.getState();
    next(); next(); next(); next(); next();
    expect(useWizardStore.getState().step).toBe(3);
  });

  it("back() retreats, capped at step 0", () => {
    const { back } = useWizardStore.getState();
    back(); back();
    expect(useWizardStore.getState().step).toBe(0);
  });

  it("goTo() jumps directly", () => {
    useWizardStore.getState().goTo(2);
    expect(useWizardStore.getState().step).toBe(2);
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
  it("returns every field to its initial value, including step", () => {
    const s = useWizardStore.getState();
    s.set("name", "x");
    s.toggleDistrict("אפרידר");
    s.goTo(2);
    s.reset();
    const fresh = useWizardStore.getState();
    expect(fresh.name).toBe("");
    expect(fresh.districts).toEqual([]);
    expect(fresh.step).toBe(0);
  });
});
