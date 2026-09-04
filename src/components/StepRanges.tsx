import { useWizardStore } from "../store/wizardStore";
import { getLang, hapticSelection } from "../lib/telegram";

interface RangeDef {
  key: "rooms" | "price" | "sqm" | "floor";
  icon: string;
  label: { ru: string; he: string; en: string };
  step: string;
  min: keyof ReturnType<typeof useWizardStore.getState>;
  max: keyof ReturnType<typeof useWizardStore.getState>;
}

// 2026-08-29 review: these labels used to be a single hardcoded Russian
// string per field, with no lang branch at all -- an en/he user saw
// Russian ("🚪 Комнаты" etc.) regardless of getLang(). Same three-way
// dictionary pattern as StepDistricts.tsx/StepFinal.tsx now applies here.
const DEFS: RangeDef[] = [
  { key: "rooms", icon: "🚪", label: { ru: "Комнаты", he: "חדרים", en: "Rooms" }, step: "0.5", min: "rooms_min", max: "rooms_max" },
  { key: "price", icon: "💰", label: { ru: "Бюджет (₪)", he: "תקציב (₪)", en: "Budget (₪)" }, step: "100", min: "price_min", max: "price_max" },
  { key: "sqm", icon: "📐", label: { ru: "Площадь (м²)", he: 'שטח (מ"ר)', en: "Area (m²)" }, step: "5", min: "sqm_min", max: "sqm_max" },
  { key: "floor", icon: "🏢", label: { ru: "Этаж", he: "קומה", en: "Floor" }, step: "1", min: "floor_min", max: "floor_max" },
];

// `only` narrows this to a single range, so the hub can reuse it verbatim
// as a one-field pane (2026-09-04). The component already mapped over DEFS;
// filtering that array is the whole change -- the inputs, the null handling
// and the "empty = no limit" hint are shared with the full-list rendering
// rather than duplicated per field.
export default function StepRanges({ only }: { only?: RangeDef["key"] } = {}) {
  const lang = getLang();
  const set = useWizardStore((s) => s.set);
  const vals = useWizardStore((s) => s);
  const defs = only ? DEFS.filter((d) => d.key === only) : DEFS;

  const labels =
    lang === "he"
      ? { from: "מ-", to: "עד" }
      : lang === "en"
      ? { from: "from", to: "to" }
      : { from: "от", to: "до" };

  return (
    <div className="space-y-4">
      {defs.map((d) => (
        <div key={d.key} className="card">
          <label className="label">{d.icon} {d.label[lang]}</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1 block text-[12px] text-muted">{labels.from}</span>
              <input
                type="number"
                inputMode="decimal"
                step={d.step}
                className="field"
                value={(vals[d.min] as number | null) ?? ""}
                onChange={(e) =>
                  set(d.min, e.target.value === "" ? null : parseFloat(e.target.value))
                }
              />
            </div>
            <div>
              <span className="mb-1 block text-[12px] text-muted">{labels.to}</span>
              <input
                type="number"
                inputMode="decimal"
                step={d.step}
                className="field"
                value={(vals[d.max] as number | null) ?? ""}
                onChange={(e) =>
                  set(d.max, e.target.value === "" ? null : parseFloat(e.target.value))
                }
              />
            </div>
          </div>
        </div>
      ))}
      <p
        className="cursor-pointer text-[13px] text-accent"
        onClick={() => hapticSelection()}
      >
        {lang === "he" ? "השאר ריק = ללא הגבלה" : lang === "en" ? "Leave empty = no limit" : "Пустое поле = без ограничения"}
      </p>
    </div>
  );
}
