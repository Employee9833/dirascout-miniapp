import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, fireEvent, waitFor } from "@testing-library/react";
import App, { readPreload } from "./App";
import { useWizardStore } from "./store/wizardStore";
import { useSubscriptionsStore } from "./store/subscriptionsStore";
import type { Subscription } from "./lib/types";
import { CITY_PROFILE_NAME } from "./lib/types";

// Minimal fake Telegram.WebApp -- records whatever handler MainButton.onClick
// was LAST given, mirroring the real SDK's "one active handler" contract
// (calling onClick again replaces the previous handler, it doesn't stack).
function makeFakeTg() {
  let mainClickHandler: (() => void) | null = null;
  return {
    tg: {
      ready: vi.fn(),
      expand: vi.fn(),
      close: vi.fn(),
      initData: "",
      initDataUnsafe: {},
      themeParams: {},
      setHeaderColor: vi.fn(),
      setBackgroundColor: vi.fn(),
      MainButton: {
        setText: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        enable: vi.fn(),
        disable: vi.fn(),
        onClick: (cb: () => void) => { mainClickHandler = cb; },
        offClick: vi.fn(),
      },
      BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
      HapticFeedback: { selectionChanged: vi.fn(), impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
      sendData: vi.fn(),
    },
    clickMain: () => mainClickHandler && mainClickHandler(),
  };
}

// Same encoding the bot uses server-side (base64.b64encode + urllib.parse.quote,
// see scripts/bot.py's _encode_edit_url) -- constructed independently here so
// this test actually exercises the cross-language symmetry, not just JS's own
// atob(btoa(x)) round-trip.
function encodeLikeBot(data: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  const b64 = btoa(bin);
  return encodeURIComponent(b64);
}

// The four-step wizard became a hub-and-spoke settings screen (2026-09-04),
// so "does Далее advance the step" no longer describes anything. What
// survives from the original stale-closure regression is the reason it
// existed: MainButton.onClick holds the closure from the last effect run,
// so any value the handler READS must be in the deps array. On the hub that
// value is the payload it submits.

// The hub launches by fetching the user's subscriptions (App.tsx's mount
// effect) and then previews a count, so a single blanket fetch mock no
// longer describes reality -- it would answer GET /api/subscriptions with a
// create response and leave the store's `items` undefined. Route by URL and
// method instead, and let each test say only what it cares about.
// Bodies of the WRITE calls only -- the hub also fires GET /api/subscriptions
// on mount and POST /api/preview for its counter, and neither is what a
// "did it submit?" assertion is about.
function postBodies(fetchMock: ReturnType<typeof vi.fn>): any[] {
  return fetchMock.mock.calls
    .filter(([url, init]: any) =>
      !String(url).includes("/api/preview") &&
      (init?.method === "POST" || init?.method === "PATCH"))
    .map(([, init]: any) => JSON.parse(String(init.body)));
}

function mockApi(over: {
  items?: unknown[];
  create?: { ok?: boolean; status?: number; body?: unknown };
} = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/api/preview")) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ count: 0, exact: 0, days: 30 }) });
    }
    if (init?.method === "POST" || init?.method === "PATCH") {
      const c = over.create ?? {};
      return Promise.resolve({
        ok: c.ok ?? true, status: c.status ?? 201,
        json: async () => c.body ?? { id: 1, active: true },
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: over.items ?? [] }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("App hub MainButton (stale-closure guard, 2026-08-29 / reshaped 2026-09-04)", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    useSubscriptionsStore.setState({ items: [], loading: false, error: null, sessionExpired: false });
    (window as any).Telegram = undefined;
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("submits the criteria as they are NOW, not as they were at mount", async () => {
    const fetchMock = mockApi();
    const { tg, clickMain } = makeFakeTg();
    (window as any).Telegram = { WebApp: tg };
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    act(() => {
      useWizardStore.getState().set("city", "אשקלון");
      useWizardStore.getState().set("price_max", 4800);
    });
    act(() => { clickMain(); });
    const posted = postBodies(fetchMock);
    expect(posted.length).toBeGreaterThan(0);
    const body = posted[posted.length - 1];
    expect(body.payload.price_max).toBe(4800);
    expect(body.payload.city).toBe("אשקלון");
  });

  it("an empty search still submits -- the name is auto-derived, not typed", async () => {
    const fetchMock = mockApi();
    const { tg, clickMain } = makeFakeTg();
    (window as any).Telegram = { WebApp: tg };
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    act(() => { clickMain(); });
    const posted = postBodies(fetchMock);
    expect(posted.length).toBeGreaterThan(0);
    const body = posted[posted.length - 1];
    expect(String(body.payload.name).trim()).not.toBe("");
  });
});


// Regression, found live 2026-09-04 minutes after the hub shipped: the mount
// effect knew ?action=manage and ?action=edit but not ?action=new, so the
// bot's "новый поиск" button fell through to the main-filter branch and
// opened the EXISTING search. Creating a second one became impossible.
describe("App launch actions (?action=new must not preload)", () => {
  const existing: Subscription = {
    id: 5, active: true, name: "Уже есть", city: "אשקלון", districts: ["אפרידר"],
    rooms_min: 3, rooms_max: null, price_min: null, price_max: 4000,
    sqm_min: null, sqm_max: null, floor_min: null, floor_max: null,
    mamad: "any", min_quality: "partial", required_fields: [], deal_type: "rent_offer",
  };

  beforeEach(() => {
    useWizardStore.getState().reset();
    useSubscriptionsStore.setState({ items: [], loading: false, error: null, sessionExpired: false });
    (window as any).Telegram = undefined;
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("?action=new starts blank even when the user already has a search", async () => {
    window.history.replaceState(null, "", "/?action=new");
    mockApi({ items: [existing] });
    const { tg } = makeFakeTg();
    (window as any).Telegram = { WebApp: tg };
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    const st = useWizardStore.getState();
    expect(st.profile_id).toBeNull();
    expect(st.action).toBe("new");
    expect(st.city).toBeNull();
    expect(st.price_max).toBeNull();
  });

  it("a bare launch (no action) still opens the existing main filter", async () => {
    mockApi({ items: [existing] });
    const { tg } = makeFakeTg();
    (window as any).Telegram = { WebApp: tg };
    render(<App />);
    await waitFor(() => expect(useWizardStore.getState().profile_id).toBe(5));
    expect(useWizardStore.getState().action).toBe("edit");
    expect(useWizardStore.getState().price_max).toBe(4000);
  });

  it("the bot-owned City profile is never adopted as the main filter", async () => {
    mockApi({ items: [{ ...existing, id: 9, name: CITY_PROFILE_NAME }] });
    const { tg } = makeFakeTg();
    (window as any).Telegram = { WebApp: tg };
    render(<App />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(useWizardStore.getState().profile_id).toBeNull();
  });
});

describe("readPreload() (base64 round-trip with the bot's encoding)", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("returns null with no ?action=edit", () => {
    expect(readPreload()).toBeNull();
  });

  it("decodes a bot-encoded payload back to the original object", () => {
    const original = {
      name: "Трёшка Афридар", city: "אשקלון", districts: ["אפרידר", "ברנע"],
      rooms_min: 3, rooms_max: 4, mamad: "required" as const,
    };
    const url = "/?action=edit&pid=42&data=" + encodeLikeBot(original);
    window.history.replaceState(null, "", url);
    expect(readPreload()).toEqual(original);
  });

  it("survives Hebrew/Russian text through the full UTF-8 path (not the deprecated escape()/unescape() pattern)", () => {
    const original = { name: "עברית и кириллица — 🏠" };
    const url = "/?action=edit&pid=1&data=" + encodeLikeBot(original);
    window.history.replaceState(null, "", url);
    expect(readPreload()).toEqual(original);
  });

  it("a malformed data param fails closed (null), not a thrown exception", () => {
    window.history.replaceState(null, "", "/?action=edit&pid=1&data=not-valid-base64!!!");
    expect(readPreload()).toBeNull();
  });
});

describe("App manage-mode (REST, 2026-09-01)", () => {
  const sub: Subscription = {
    id: 9,
    active: false,
    name: "Ашдод",
    city: "אשדוד",
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
  };

  beforeEach(() => {
    useWizardStore.getState().reset();
    useSubscriptionsStore.setState({ items: [], loading: false, error: null, sessionExpired: false });
    (window as any).Telegram = undefined;
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("fetches live subscriptions (not a URL preload) and hides MainButton when ?action=manage is present", async () => {
    window.history.replaceState(null, "", "/?action=manage");
    mockApi({ items: [sub] });
    const { tg } = makeFakeTg();
    tg.initDataUnsafe = { user: { language_code: "ru" } };
    (window as any).Telegram = { WebApp: tg };
    const { findByText } = render(<App />);
    await findByText("Ашдод", { exact: false });
    expect(tg.MainButton.hide).toHaveBeenCalled();
  });

  it("tapping edit on a manage row loads it into the wizard and switches mode in-app (no sendData)", async () => {
    window.history.replaceState(null, "", "/?action=manage");
    mockApi({ items: [sub] });
    const { tg } = makeFakeTg();
    tg.initDataUnsafe = { user: { language_code: "ru" } };
    (window as any).Telegram = { WebApp: tg };
    const { findByText, getByText } = render(<App />);
    await findByText("Ашдод", { exact: false });
    act(() => {
      fireEvent.click(getByText("✏️ Изменить"));
    });
    expect((tg as any).sendData).not.toHaveBeenCalled();
    expect(useWizardStore.getState().action).toBe("edit");
    expect(useWizardStore.getState().name).toBe("Ашдод");
    expect(useWizardStore.getState().profile_id).toBe(9);
  });

  it("BackButton at step 0 returns to the manage list, not hidden, after an in-app edit", async () => {
    window.history.replaceState(null, "", "/?action=manage");
    mockApi({ items: [sub] });
    const { tg } = makeFakeTg();
    tg.initDataUnsafe = { user: { language_code: "ru" } };
    (window as any).Telegram = { WebApp: tg };
    const { findByText, getByText } = render(<App />);
    await findByText("Ашдод", { exact: false });
    act(() => {
      fireEvent.click(getByText("✏️ Изменить"));
    });
    expect(tg.BackButton.show).toHaveBeenCalled();
  });
});

describe("App: double-tap guard on submit (2026-09-02 audit)", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    useSubscriptionsStore.setState({ items: [], loading: false, error: null, sessionExpired: false });
    (window as any).Telegram = undefined;
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("a second tap before the request resolves does not send a second create", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    const fetchMock = vi.fn(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { tg, clickMain } = makeFakeTg();
    (window as any).Telegram = { WebApp: tg };
    render(<App />);
    act(() => {
      useWizardStore.getState().set("city", "אשקלון");
    });
    act(() => { clickMain(); }); // first tap -- in flight, never resolved yet
    act(() => { clickMain(); }); // second tap while the first is still pending
    // The hub also fetches on mount and previews its counter, so count the
    // WRITE calls specifically rather than every fetch.
    const writes = fetchMock.mock.calls.filter(
      ([url, init]: any) => !String(url).includes("/api/preview") &&
        (init?.method === "POST" || init?.method === "PATCH"));
    expect(writes.length).toBe(1);
    await act(async () => {
      resolveFetch({ ok: true, status: 201, json: async () => ({ id: 1, active: true }) });
      await Promise.resolve();
    });
  });
});

describe("App: document dir/lang (RTL, 2026-09-02 audit)", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    (window as any).Telegram = undefined;
    window.history.replaceState(null, "", "/");
    document.documentElement.removeAttribute("dir");
    document.documentElement.lang = "";
  });

  it("sets dir=rtl and lang=he for a Hebrew user", () => {
    const { tg } = makeFakeTg();
    tg.initDataUnsafe = { user: { language_code: "he" } };
    (window as any).Telegram = { WebApp: tg };
    render(<App />);
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("he");
  });

  it("sets dir=ltr for ru/en users", () => {
    const { tg } = makeFakeTg();
    tg.initDataUnsafe = { user: { language_code: "ru" } };
    (window as any).Telegram = { WebApp: tg };
    render(<App />);
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("ru");
  });
});
