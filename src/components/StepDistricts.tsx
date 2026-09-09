import { useMemo, useState } from "react";
import { useWizardStore } from "../store/wizardStore";
import { CITIES, type DistrictEntry } from "../data/cities";
import { getLang, hapticSelection } from "../lib/telegram";

// 2026-08-29 review: the paginated 12-per-page list was the only option
// when Ashkelon/Ashdod had ~25 districts each; Jerusalem's 86 made paging
// through 7+ pages to find one neighborhood unusable. Replaced with a
// search-as-you-type filter (matches he/ru/en) -- selected districts stay
// pinned above the search box so they're never scrolled out of view.
const MAX_RESULTS = 30;

export default function StepDistricts() {
  const lang = getLang();
  const city = useWizardStore((s) => s.city);
  const districts = useWizardStore((s) => s.districts);
  const toggle = useWizardStore((s) => s.toggleDistrict);
  const [query, setQuery] = useState("");
  // Which parents are expanded. Sub-districts are hidden inside their parent
  // rather than listed flat (2026-09-08): Ashkelon went from 28 to 46 entries
  // when the handbook's full set became selectable, and five of those are
  // Barnea's sub-districts -- a flat list buries the district you actually
  // want under its own children.
  const [open, setOpen] = useState<string[]>([]);

  const all = useMemo(() => {
    const entry = CITIES.cities.find((c) => c.code === city);
    return entry?.districts ?? [];
  }, [city]);

  const childrenOf = useMemo(() => {
    const map = new Map<string, DistrictEntry[]>();
    for (const d of all) {
      if (!d.parent) continue;
      const list = map.get(d.parent) ?? [];
      list.push(d);
      map.set(d.parent, list);
    }
    return map;
  }, [all]);

  const selected = useMemo(
    () => all.filter((d) => districts.includes(d.key)),
    [all, districts]
  );

  // A search hit shows every match flat (you typed the name, you want it);
  // with no query the list shows top-level districts only.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = all.filter((d) => !districts.includes(d.key));
    const matches = q
      ? pool.filter(
          (d) =>
            d.he.toLowerCase().includes(q) ||
            d.ru.toLowerCase().includes(q) ||
            d.en.toLowerCase().includes(q)
        )
      : pool.filter((d) => !d.parent);
    return matches.slice(0, MAX_RESULTS);
  }, [all, districts, query]);

  const t = lang === "he" ? "אזורים" : lang === "en" ? "Districts" : "Районы";
  const skip = lang === "he" ? "ללא אזור" : lang === "en" ? "Any district" : "Любой район";
  const placeholder =
    lang === "he" ? "חיפוש שכונה…" : lang === "en" ? "Search district…" : "Поиск района…";
  const empty =
    lang === "he" ? "לא נמצא" : lang === "en" ? "No matches" : "Ничего не найдено";
  const label = (d: DistrictEntry) => (lang === "he" ? d.he : `${d.he} / ${d[lang]}`);

  const pick = (d: DistrictEntry) => {
    hapticSelection();
    toggle(d.key);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="label mb-0">{t}</label>
        <span className="text-[13px] text-muted">
          {districts.length > 0 ? `✓ ${districts.length}` : skip}
        </span>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => pick(d)}
              className="pill border border-transparent bg-accent text-accent-text"
            >
              {label(d)} ✕
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        inputMode="search"
        className="field"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        {results.map((d) => {
          const kids = (childrenOf.get(d.key) ?? []).filter(
            (k) => !districts.includes(k.key)
          );
          const expanded = open.includes(d.key);
          return (
            <div key={d.key} className="flex w-full flex-wrap gap-2">
              <button
                type="button"
                onClick={() => pick(d)}
                className="pill border border-line bg-surface text-ink"
              >
                {label(d)}
              </button>
              {/* Picking the parent already covers its sub-districts (see
                  matching.district_matches) -- this only opens the narrower
                  choice for someone who wants one specific corner of it. */}
              {!query && kids.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    hapticSelection();
                    setOpen((prev) =>
                      prev.includes(d.key)
                        ? prev.filter((k) => k !== d.key)
                        : [...prev, d.key]
                    );
                  }}
                  className="pill border border-line bg-surface text-muted"
                  aria-expanded={expanded}
                >
                  {expanded ? "▾" : "▸"} {kids.length}
                </button>
              )}
              {expanded &&
                kids.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => pick(k)}
                    className="pill ms-4 border border-line bg-tint text-sub"
                  >
                    {label(k)}
                  </button>
                ))}
            </div>
          );
        })}
        {results.length === 0 && (
          <p className="text-[13px] text-muted">{empty}</p>
        )}
      </div>
    </div>
  );
}
