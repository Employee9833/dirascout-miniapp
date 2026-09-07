import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, fireEvent, waitFor, within } from "@testing-library/react";
import Matches from "./Matches";
import ListingCard, { placeLabel, whenLabel } from "./ListingCard";
import { useMatchesStore } from "../store/matchesStore";
import type { MatchCard } from "../lib/types";

function card(over: Partial<MatchCard> = {}): MatchCard {
  return {
    match_id: 1, listing_id: 10, quality: "exact", matched_at: "2026-09-04T15:29:54",
    unknown_fields: [], price: 4150, rooms: 3, floor: 17, sqm: 75, mamad: 1,
    seller: null, city: "אשקלון", district: "אפרידר", street: null,
    text: "להשכרה, דירה, 3 חדרים", photos: [], url: "https://x/1",
    sources: ["yad2_ashkelon"], times_seen: 1, posted_at: null,
    first_seen: new Date().toISOString(), ...over,
  };
}

// Two searches: one with both kinds, one with only partial (the case that
// decides which tab a search opens on).
const PROFILES = [
  { id: 19, name: "Ашкелон афридар", active: true, exact: 2, partial: 4,
    last_matched_at: "2026-09-04T15:29:54" },
  { id: 5, name: "Только неточные", active: false, exact: 0, partial: 3,
    last_matched_at: "2026-09-01T10:00:00" },
  { id: 20, name: "Пустой поиск", active: true, exact: 0, partial: 0,
    last_matched_at: null },
];

function mockApi(feed: MatchCard[] = [card()]) {
  const fetchMock = vi.fn((url: string) => {
    const u = String(url);
    if (u.includes("/api/matches/")) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({
        profile: { id: 19, name: "Ашкелон афридар" }, items: feed }) });
    }
    return Promise.resolve({ ok: true, status: 200,
                             json: async () => ({ items: PROFILES }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ListingCard pure helpers", () => {
  it("placeLabel joins only the parts that resolved", () => {
    expect(placeLabel(card({ city: "אשקלון", district: "אפרידר", street: "הטייסים" })))
      .toBe("אשקלון · אפרידר · הטייסים");
    expect(placeLabel(card({ city: "אשקלון", district: null, street: null })))
      .toBe("אשקלון");
    expect(placeLabel(card({ city: null, district: null, street: null }))).toBe("");
  });

  it("whenLabel prefers the source's own posted_at over when WE saw it", () => {
    const T = { today: "сегодня", yesterday: "вчера",
                daysAgo: (n: number) => `${n} дн. назад` } as never;
    const tenDaysAgo = Math.floor((Date.now() - 10 * 86_400_000) / 1000);
    // first_seen is TODAY but the ad was published 10 days ago -- for a
    // polled board those genuinely differ, and the ad's own date is the
    // honest one to show.
    expect(whenLabel(card({ posted_at: tenDaysAgo,
                            first_seen: new Date().toISOString() }), T))
      .toBe("10 дн. назад");
    expect(whenLabel(card({ posted_at: null,
                            first_seen: new Date().toISOString() }), T)).toBe("сегодня");
  });
});

describe("ListingCard rendering", () => {
  it("renders price, place and facts as structure, not a text dump", () => {
    const { getByText } = render(<ListingCard card={card()} lang="ru" />);
    expect(getByText("4 150 ₪")).toBeTruthy();
    expect(getByText(/אשקלון · אפרידר/)).toBeTruthy();
    expect(getByText("3 комн.")).toBeTruthy();
    expect(getByText("75 m²")).toBeTruthy();
  });

  it("names WHY a match is partial -- that is the tab's whole point", () => {
    const { getByText } = render(
      <ListingCard card={card({ quality: "partial",
                                unknown_fields: ["mamad", "sqm"] })} lang="ru" />);
    expect(getByText(/не указано:/)).toBeTruthy();
    expect(getByText(/мамад, площадь/)).toBeTruthy();
  });

  // Scoped with within(container): every render() in one test appends to the
  // same document.body, so an unscoped query would also see the previous
  // card's chips and report "multiple elements found".
  it("distinguishes confirmed-absent mamad from unknown (tri-state)", () => {
    const yes = render(<ListingCard card={card({ mamad: 1 })} lang="ru" />);
    expect(within(yes.container).getByText(/🛡 мамад/)).toBeTruthy();
    const no = render(<ListingCard card={card({ mamad: 0 })} lang="ru" />);
    expect(within(no.container).getByText(/без мамада/)).toBeTruthy();
    const unknown = render(<ListingCard card={card({ mamad: null })} lang="ru" />);
    expect(within(unknown.container).queryByText(/мамад/)).toBeNull();
  });

  it("a missing price does not render a bare currency symbol", () => {
    const { getByText, queryByText } = render(
      <ListingCard card={card({ price: null })} lang="ru" />);
    expect(getByText("цена не указана")).toBeTruthy();
    expect(queryByText("null ₪")).toBeNull();
  });

  it("a photo that fails to load collapses instead of showing a broken image", () => {
    const { container } = render(
      <ListingCard card={card({ photos: ["https://dead/1.jpg"] })} lang="ru" />);
    const img = container.querySelector("img")!;
    expect(img).toBeTruthy();
    act(() => { fireEvent.error(img); });
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("Matches screen", () => {
  beforeEach(() => {
    useMatchesStore.getState().reset();
    (window as any).Telegram = undefined;
    vi.restoreAllMocks();
  });

  it("lists searches with their exact/partial counts", async () => {
    mockApi();
    const { findByText, getByText } = render(<Matches lang="ru" />);
    await findByText("Ашкелон афридар");
    expect(getByText("2 ✓")).toBeTruthy();
    expect(getByText("4 ⚠️")).toBeTruthy();
  });

  it("opening a search shows its feed as cards", async () => {
    mockApi([card({ price: 4150 })]);
    const { findByText, getByText } = render(<Matches lang="ru" />);
    await findByText("Ашкелон афридар");
    act(() => { fireEvent.click(getByText("Ашкелон афридар")); });
    await findByText("4 150 ₪");
  });

  it("a search with only partial matches opens on the partial tab", async () => {
    mockApi([card({ quality: "partial", unknown_fields: ["district"] })]);
    const { findByText, getByText } = render(<Matches lang="ru" />);
    await findByText("Только неточные");
    act(() => { fireEvent.click(getByText("Только неточные")); });
    // the partial-tab hint only renders on that tab
    await findByText(/объявление не указало часть данных/);
  });

  it("a search with nothing found is not tappable", async () => {
    mockApi();
    const { findByText } = render(<Matches lang="ru" />);
    const row = (await findByText("Пустой поиск")).closest("button")!;
    expect(row.disabled).toBe(true);
  });

  it("switching tabs refetches only once per tab (results are cached)", async () => {
    const fetchMock = mockApi();
    const { findByText, getByText } = render(<Matches lang="ru" />);
    await findByText("Ашкелон афридар");
    act(() => { fireEvent.click(getByText("Ашкелон афридар")); });
    await waitFor(() => expect(getByText(/Неточные/)).toBeTruthy());
    const feedCalls = () => fetchMock.mock.calls
      .filter(([u]) => String(u).includes("/api/matches/")).length;
    act(() => { fireEvent.click(getByText(/Неточные/)); });
    await waitFor(() => expect(feedCalls()).toBe(2));
    act(() => { fireEvent.click(getByText(/Точные/)); });   // back to a cached tab
    act(() => { fireEvent.click(getByText(/Неточные/)); });
    expect(feedCalls()).toBe(2);
  });

  it("an empty index explains itself instead of showing a blank screen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ items: [] }) }));
    const { findByText } = render(<Matches lang="ru" />);
    await findByText("Совпадений пока нет.");
  });

  it("a failed load says so rather than looking empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 500, statusText: "boom",
      text: async () => "boom", json: async () => ({}) }));
    const { findByText } = render(<Matches lang="ru" />);
    await findByText(/boom/);
  });
});
