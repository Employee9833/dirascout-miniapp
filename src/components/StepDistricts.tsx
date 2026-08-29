import { useMemo, useState } from "react";
import { useWizardStore } from "../store/wizardStore";
import { CITIES, type CityLabels } from "../data/cities";
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

  const all = useMemo(() => {
    const entry = CITIES.cities.find((c) => c.code === city);
    return entry?.districts ?? [];
  }, [city]);

  const selected = useMemo(
    () => all.filter((d) => districts.includes(d.he)),
    [all, districts]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = all.filter((d) => !districts.includes(d.he));
    const matches = q
      ? pool.filter(
          (d) =>
            d.he.toLowerCase().includes(q) ||
            d.ru.toLowerCase().includes(q) ||
            d.en.toLowerCase().includes(q)
        )
      : pool;
    return matches.slice(0, MAX_RESULTS);
  }, [all, districts, query]);

  const t = lang === "he" ? "אזורים" : lang === "en" ? "Districts" : "Районы";
  const skip = lang === "he" ? "ללא אזור" : lang === "en" ? "Any district" : "Любой район";
  const placeholder =
    lang === "he" ? "חיפוש שכונה…" : lang === "en" ? "Search district…" : "Поиск района…";
  const empty =
    lang === "he" ? "לא נמצא" : lang === "en" ? "No matches" : "Ничего не найдено";
  const label = (d: CityLabels) => (lang === "he" ? d.he : `${d.he} / ${d[lang]}`);

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
              key={d.he}
              type="button"
              onClick={() => {
                hapticSelection();
                toggle(d.he);
              }}
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
        {results.map((d) => (
          <button
            key={d.he}
            type="button"
            onClick={() => {
              hapticSelection();
              toggle(d.he);
            }}
            className="pill border border-line bg-surface text-ink"
          >
            {label(d)}
          </button>
        ))}
        {results.length === 0 && (
          <p className="text-[13px] text-muted">{empty}</p>
        )}
      </div>
    </div>
  );
}
