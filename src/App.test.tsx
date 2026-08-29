import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import App, { readPreload } from "./App";
import { useWizardStore } from "./store/wizardStore";
import type { SearchPayload } from "./lib/types";

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
function encodeLikeBot(data: Partial<SearchPayload>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  const b64 = btoa(bin);
  return encodeURIComponent(b64);
}

describe("App MainButton stale-closure (2026-08-29 review)", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    (window as any).Telegram = undefined;
    window.history.replaceState(null, "", "/");
  });

  it("must advance past step 0 after typing a name (not the value from mount)", () => {
    const { tg, clickMain } = makeFakeTg();
    (window as any).Telegram = { WebApp: tg };
    render(<App />);
    act(() => {
      useWizardStore.getState().set("name", "Тестовый поиск");
    });
    act(() => { clickMain(); });
    expect(useWizardStore.getState().step).toBe(1);
  });

  it("an edit's preloaded name must not be rejected as empty either", () => {
    const url = "/?action=edit&pid=7&data=" + encodeLikeBot({ name: "Старый поиск" });
    window.history.replaceState(null, "", url);
    const { tg, clickMain } = makeFakeTg();
    (window as any).Telegram = { WebApp: tg };
    render(<App />);
    expect(useWizardStore.getState().name).toBe("Старый поиск"); // preload itself worked
    act(() => { clickMain(); });
    expect(useWizardStore.getState().step).toBe(1); // and MainButton saw it too
  });

  it("still rejects a genuinely empty name (not a blanket bypass)", () => {
    const { tg, clickMain } = makeFakeTg();
    (window as any).Telegram = { WebApp: tg };
    render(<App />);
    act(() => { clickMain(); });
    expect(useWizardStore.getState().step).toBe(0);
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
