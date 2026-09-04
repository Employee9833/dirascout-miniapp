import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, fireEvent, waitFor } from "@testing-library/react";
import Hub, { rangeSummary } from "./Hub";
import { useWizardStore } from "../store/wizardStore";

function fakeTg(lang = "ru") {
  return {
    ready: vi.fn(), expand: vi.fn(), close: vi.fn(),
    initData: "", initDataUnsafe: { user: { language_code: lang, first_name: "Стас", username: "Goldstary" } },
    themeParams: {}, setHeaderColor: vi.fn(), setBackgroundColor: vi.fn(),
    MainButton: { setText: vi.fn(), show: vi.fn(), hide: vi.fn(), enable: vi.fn(), disable: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
    BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
    HapticFeedback: { selectionChanged: vi.fn(), impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
    sendData: vi.fn(),
  };
}

describe("rangeSummary (the hub rows' whole point: show the value inline)", () => {
  it("renders both ends", () => {
    expect(rangeSummary(3500, 4800, "ru", "₪")).toBe("3500 – 4800 ₪");
  });
  it("renders an open lower bound", () => {
    expect(rangeSummary(3, null, "ru")).toBe("от 3");
    expect(rangeSummary(3, null, "en")).toBe("from 3");
  });
  it("renders an open upper bound", () => {
    expect(rangeSummary(null, 4, "ru")).toBe("до 4");
  });
  it("returns null when nothing is set, so the row can say «Любой»", () => {
    expect(rangeSummary(null, null, "ru")).toBeNull();
  });
});

describe("Hub", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    (window as any).Telegram = { WebApp: fakeTg() };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ count: 7, exact: 3, days: 30 }),
    }));
  });

  it("shows each filter's current value on its own row", () => {
    act(() => {
      useWizardStore.getState().set("price_min", 3500);
      useWizardStore.getState().set("price_max", 4800);
      useWizardStore.getState().set("rooms_min", 3);
    });
    const { getByText } = render(<Hub onOpen={() => {}} />);
    expect(getByText("3500 – 4800 ₪")).toBeTruthy();
    expect(getByText("от 3")).toBeTruthy();
  });

  it("tapping a row opens that row's pane", () => {
    const onOpen = vi.fn();
    const { getByText } = render(<Hub onOpen={onOpen} />);
    act(() => { fireEvent.click(getByText("Цена")); });
    expect(onOpen).toHaveBeenCalledWith("price");
  });

  it("location shows city and district together -- they are one question", () => {
    act(() => {
      useWizardStore.getState().set("city", "אשקלון");
      useWizardStore.getState().toggleDistrict("אפרידר");
    });
    const { getByText } = render(<Hub onOpen={() => {}} />);
    expect(getByText("Ашкелон, אפרידר")).toBeTruthy();
  });

  it("shows the live match count, both totals", async () => {
    const { findByText } = render(<Hub onOpen={() => {}} />);
    // debounced by 400ms, so this waits rather than asserting synchronously
    await findByText(/7 объявлений за 30 дней · 3 точных/, {}, { timeout: 2000 });
  });

  it("a failed count says so instead of showing a stale or fake number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { findByText } = render(<Hub onOpen={() => {}} />);
    await findByText("Не удалось посчитать", {}, { timeout: 2000 });
  });

  it("hides the Notifications toggle until the profile actually exists", async () => {
    const { queryByRole, rerender } = render(<Hub onOpen={() => {}} />);
    expect(queryByRole("switch")).toBeNull();
    act(() => { useWizardStore.getState().set("profile_id", 42); });
    rerender(<Hub onOpen={() => {}} />);
    await waitFor(() => expect(queryByRole("switch")).not.toBeNull());
  });
});
