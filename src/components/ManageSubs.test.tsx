import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import ManageSubs from "./ManageSubs";
import type { ManageItem } from "../lib/types";

function makeItem(overrides: Partial<ManageItem> = {}): ManageItem {
  return {
    id: 3,
    active: true,
    editable: true,
    summary: "🏙 Ашкелон\n💰 3000–4500 ₪",
    fields: {
      name: "Трёшка", city: "אשקלון", districts: [], rooms_min: null, rooms_max: null,
      price_min: 3000, price_max: 4500, sqm_min: null, sqm_max: null, floor_min: null,
      floor_max: null, mamad: "any", min_quality: "partial", required_fields: [],
      deal_type: "rent_offer",
    },
    ...overrides,
  };
}

describe("ManageSubs", () => {
  beforeEach(() => {
    (window as any).Telegram = {
      WebApp: {
        sendData: vi.fn(),
        HapticFeedback: { selectionChanged: vi.fn(), impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
      },
    };
  });

  it("shows the empty state with no items", () => {
    const { getByText } = render(<ManageSubs items={[]} lang="ru" onEdit={vi.fn()} />);
    expect(getByText("Подписок пока нет.")).toBeTruthy();
  });

  it("toggle sends {action:'toggle', profile_id} immediately (one tap)", () => {
    const item = makeItem();
    const { getByText } = render(<ManageSubs items={[item]} lang="ru" onEdit={vi.fn()} />);
    fireEvent.click(getByText("⏸ Пауза"));
    const sendData = (window as any).Telegram.WebApp.sendData;
    expect(sendData).toHaveBeenCalledWith(JSON.stringify({ action: "toggle", profile_id: 3 }));
  });

  it("delete requires a second tap before sending (fat-finger guard)", () => {
    const item = makeItem();
    const { getByText } = render(<ManageSubs items={[item]} lang="ru" onEdit={vi.fn()} />);
    const sendData = (window as any).Telegram.WebApp.sendData;
    fireEvent.click(getByText("🗑 Удалить"));
    expect(sendData).not.toHaveBeenCalled();
    fireEvent.click(getByText("🗑 Точно?"));
    expect(sendData).toHaveBeenCalledWith(JSON.stringify({ action: "delete", profile_id: 3 }));
  });

  it("hides the edit button for a non-editable item (the personal City profile)", () => {
    const item = makeItem({ editable: false });
    const { queryByText } = render(<ManageSubs items={[item]} lang="ru" onEdit={vi.fn()} />);
    expect(queryByText("✏️ Изменить")).toBeNull();
  });

  it("edit calls onEdit with the item, without touching sendData", () => {
    const item = makeItem();
    const onEdit = vi.fn();
    const { getByText } = render(<ManageSubs items={[item]} lang="ru" onEdit={onEdit} />);
    fireEvent.click(getByText("✏️ Изменить"));
    expect(onEdit).toHaveBeenCalledWith(item);
    expect((window as any).Telegram.WebApp.sendData).not.toHaveBeenCalled();
  });
});
