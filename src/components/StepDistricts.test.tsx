import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import StepDistricts from "./StepDistricts";
import { useWizardStore } from "../store/wizardStore";
import { CITIES } from "../data/cities";

// 2026-09-08 audit. Two bugs, both of which made a chosen district match
// nothing at all, and both invisible from the UI (the filter just quietly
// returned fewer listings, or none).
// Several districts have children (ברנע, נווה ים, אגמים), so "the expander"
// has to be the one in ברנע's own row -- each district renders as one flex row.
function expanderFor(container: HTMLElement, he: string): HTMLElement {
  // .pop(): querySelectorAll is document order, so the outer wrapper (which
  // contains every row, and every ▸) comes first -- the last match is the
  // innermost div, i.e. this district's own row.
  const row = Array.from(container.querySelectorAll("div")).filter(
    (d) => d.textContent?.includes(he) && d.textContent?.includes("\u25b8")
  ).pop();
  if (!row) throw new Error(`no expander row for ${he}`);
  return within(row as HTMLElement).getByText(/\u25b8/);
}

describe("StepDistricts", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    useWizardStore.getState().set("city", "אשקלון");
  });

  it("stores the handbook KEY, not the display label", () => {
    // "נווה אלונים / שמשון ג'" is OSM's dual name and is what lands in
    // listing.district; the pill reads just "נווה אלונים". Sending the label
    // (what this component used to do) could never match a single listing.
    const dual = CITIES.cities
      .find((c) => c.code === "אשקלון")!
      .districts.find((d) => d.key !== d.he)!;
    expect(dual).toBeTruthy();

    const { getByText } = render(<StepDistricts />);
    fireEvent.click(getByText(new RegExp(dual.he)));
    expect(useWizardStore.getState().districts).toEqual([dual.key]);
    expect(dual.key).not.toBe(dual.he);
  });

  it("hides sub-districts inside their parent instead of listing them flat", () => {
    const { container, queryByText } = render(<StepDistricts />);
    // ברנע ב' is a declared sub-district of ברנע -- not offered at top level
    expect(queryByText(/ברנע ב'/)).toBeNull();
    expect(within(container).getByText(/ברנע/)).toBeTruthy();

    // ...until the parent's expander is opened
    fireEvent.click(expanderFor(container, "ברנע"));
    expect(within(container).getByText(/ברנע ב'/)).toBeTruthy();
  });

  it("a sub-district can still be picked on its own, narrowly", () => {
    const { container, getByText } = render(<StepDistricts />);
    fireEvent.click(expanderFor(container, "ברנע"));
    fireEvent.click(getByText(/ברנע ב'/));
    // the KEY of the child, not the parent -- picking a corner must not
    // silently widen back to the whole district (matching.district_matches
    // expands parent->children, never child->parent)
    expect(useWizardStore.getState().districts).toEqual(["ברנע ב'"]);
  });

  it("search still reaches a sub-district directly", () => {
    const { container, getByPlaceholderText } = render(<StepDistricts />);
    fireEvent.change(getByPlaceholderText(/Поиск|Search|חיפוש/), {
      target: { value: "גני ברנע" },
    });
    expect(within(container).getByText(/גני ברנע/)).toBeTruthy();
  });
});
