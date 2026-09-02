import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import ManageSubs from "./ManageSubs";
import { useSubscriptionsStore } from "../store/subscriptionsStore";
import type { Subscription } from "../lib/types";
import { CITY_PROFILE_NAME } from "../lib/types";

function makeItem(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 3,
    active: true,
    name: "Афридар",
    city: "אשקלון",
    districts: [],
    rooms_min: null,
    rooms_max: null,
    price_min: 3000,
    price_max: 4500,
    sqm_min: null,
    sqm_max: null,
    floor_min: null,
    floor_max: null,
    mamad: "any",
    min_quality: "partial",
    required_fields: [],
    deal_type: "rent_offer",
    ...overrides,
  };
}

function seedStore(items: Subscription[]) {
  useSubscriptionsStore.setState({
    items,
    loading: false,
    error: null,
    sessionExpired: false,
  });
}

describe("ManageSubs", () => {
  beforeEach(() => {
    (window as any).Telegram = {
      WebApp: {
        HapticFeedback: { selectionChanged: vi.fn(), impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
      },
    };
    seedStore([]);
    vi.restoreAllMocks();
  });

  it("shows the empty state with no items", () => {
    const { getByText } = render(<ManageSubs lang="ru" onEdit={vi.fn()} />);
    expect(getByText("Подписок пока нет.")).toBeTruthy();
  });

  it("shows the session-expired message instead of the list", () => {
    useSubscriptionsStore.setState({ sessionExpired: true });
    const { getByText, queryByText } = render(<ManageSubs lang="ru" onEdit={vi.fn()} />);
    expect(getByText(/Сессия истекла/)).toBeTruthy();
    expect(queryByText("Подписок пока нет.")).toBeNull();
  });

  it("toggle flips active optimistically and POSTs /toggle", async () => {
    seedStore([makeItem()]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 3, active: false }) });
    vi.stubGlobal("fetch", fetchMock);
    const { getByText } = render(<ManageSubs lang="ru" onEdit={vi.fn()} />);
    fireEvent.click(getByText("⏸ Пауза"));
    // optimistic flip is synchronous, before the request resolves
    expect(useSubscriptionsStore.getState().items[0].active).toBe(false);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/subscriptions/toggle"),
        expect.objectContaining({ method: "POST", body: JSON.stringify({ id: 3 }) }),
      );
    });
  });

  it("toggle rolls back on a failed request", async () => {
    seedStore([makeItem()]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "boom", text: async () => "boom" }),
    );
    const { getByText } = render(<ManageSubs lang="ru" onEdit={vi.fn()} />);
    fireEvent.click(getByText("⏸ Пауза"));
    await waitFor(() => {
      expect(useSubscriptionsStore.getState().items[0].active).toBe(true);
      expect(useSubscriptionsStore.getState().error).toBeTruthy();
    });
  });

  it("delete requires a second tap before sending (fat-finger guard)", async () => {
    seedStore([makeItem()]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const { getByText } = render(<ManageSubs lang="ru" onEdit={vi.fn()} />);
    fireEvent.click(getByText("🗑 Удалить"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useSubscriptionsStore.getState().items).toHaveLength(1);
    fireEvent.click(getByText("🗑 Точно?"));
    // optimistic removal is synchronous
    expect(useSubscriptionsStore.getState().items).toHaveLength(0);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/subscriptions"),
        expect.objectContaining({ method: "DELETE", body: JSON.stringify({ id: 3 }) }),
      );
    });
  });

  it("hides the edit button for the personal City profile, still shows pause/delete", () => {
    seedStore([makeItem({ name: CITY_PROFILE_NAME })]);
    const { queryByText, getByText } = render(<ManageSubs lang="ru" onEdit={vi.fn()} />);
    expect(queryByText("✏️ Изменить")).toBeNull();
    expect(getByText("⏸ Пауза")).toBeTruthy();
    expect(getByText("🗑 Удалить")).toBeTruthy();
  });

  it("edit calls onEdit with the item, no network request", () => {
    const item = makeItem();
    seedStore([item]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onEdit = vi.fn();
    const { getByText } = render(<ManageSubs lang="ru" onEdit={onEdit} />);
    fireEvent.click(getByText("✏️ Изменить"));
    expect(onEdit).toHaveBeenCalledWith(item);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a pending (optimistic-create) row disables its action buttons", () => {
    seedStore([makeItem({ id: "temp-123" })]);
    const { getByText } = render(<ManageSubs lang="ru" onEdit={vi.fn()} />);
    expect((getByText("⏸ Пауза") as HTMLButtonElement).disabled).toBe(true);
  });
});
