import { useWizardStore } from "../store/wizardStore";
import { CITIES } from "../data/cities";
import { getLang, hapticSelection } from "../lib/telegram";

// 2026-08-29 review: this component's text used to be a binary RU-vs-EN
// check (`haptic === "Русский" ? ... : ...`) with no Hebrew branch at all --
// a Hebrew-language user got English labels. City names were worse: hardcoded
// to c.labels.ru unconditionally, so EVERY user saw Russian city names
// regardless of lang. Fixed with the same three-way dictionary pattern
// StepDistricts.tsx already used correctly.
const I18N = {
  ru: { nameLabel: "Название поиска", namePlaceholder: "Напр. Сити 3-комн до 4500", cityLabel: "Город" },
  he: { nameLabel: "שם החיפוש", namePlaceholder: 'למשל סיטי 3 חד\' עד 4500', cityLabel: "עיר" },
  en: { nameLabel: "Search name", namePlaceholder: "e.g. City 3-room ≤ 4500", cityLabel: "City" },
} as const;

// `only` splits the two unrelated questions this screen used to bundle into
// the hub's own "Название" and "Город" rows (2026-09-04). Undefined keeps
// both, so any caller that wants the original combined screen is unchanged.
export default function StepNameCity({ only }: { only?: "name" | "city" } = {}) {
  const lang = getLang();
  const T = I18N[lang];
  const name = useWizardStore((s) => s.name);
  const city = useWizardStore((s) => s.city);
  const set = useWizardStore((s) => s.set);

  return (
    <div className="space-y-5">
      {only !== "city" && (
      <div>
        <label className="label" htmlFor="name">
          {T.nameLabel}
        </label>
        <input
          id="name"
          className="field"
          placeholder={T.namePlaceholder}
          value={name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>
      )}

      {only !== "name" && (
      <div>
        <label className="label">{T.cityLabel}</label>
        <div className="grid grid-cols-3 gap-2">
          {CITIES.cities.map((c) => {
            const active = city === c.code;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  hapticSelection();
                  set("city", c.code);
                }}
                className={`pill border ${
                  active
                    ? "border-transparent bg-accent text-accent-text"
                    : "border-line bg-surface text-ink"
                }`}
              >
                {c.labels[lang] ?? c.code}
              </button>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
