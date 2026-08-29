import { useMemo, useState } from "react";
import { useWizardStore } from "../store/wizardStore";
import { CITIES } from "../data/cities";
import { getLang, hapticSelection } from "../lib/telegram";

const PAGE = 12;

export default function StepDistricts() {
  const lang = getLang();
  const city = useWizardStore((s) => s.city);
  const districts = useWizardStore((s) => s.districts);
  const toggle = useWizardStore((s) => s.toggleDistrict);
  const [page, setPage] = useState(0);

  const all = useMemo(() => {
    const entry = CITIES.cities.find((c) => c.code === city);
    return entry?.districts ?? [];
  }, [city]);

  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const slice = all.slice(page * PAGE, page * PAGE + PAGE);
  const t = lang === "he" ? "אזורים" : lang === "en" ? "Districts" : "Районы";
  const skip = lang === "he" ? "ללא ראשות" : lang === "en" ? "Any district" : "Любой район";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="label mb-0">{t}</label>
        <span className="text-[13px] text-muted">
          {districts.length > 0 ? `✓ ${districts.length}` : skip}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {slice.map((d) => {
          const on = districts.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                hapticSelection();
                toggle(d);
              }}
              className={`pill border ${
                on
                  ? "border-transparent bg-accent text-accent-text"
                  : "border-line bg-surface text-ink"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => {
              hapticSelection();
              setPage((p) => Math.max(0, p - 1));
            }}
            className="pill border border-line bg-surface text-ink disabled:opacity-40"
          >
            ←
          </button>
          <span className="text-[13px] text-muted">
            {page + 1} / {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages - 1}
            onClick={() => {
              hapticSelection();
              setPage((p) => Math.min(pages - 1, p + 1));
            }}
            className="pill border border-line bg-surface text-ink disabled:opacity-40"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
