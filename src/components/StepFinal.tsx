import { useWizardStore } from "../store/wizardStore";
import { getLang, hapticSelection } from "../lib/telegram";

const MAMAD: { v: "any" | "required" | "strict"; ru: string; he: string; en: string }[] = [
  { v: "any", ru: "Не важно", he: "לא משנה", en: "Any" },
  { v: "required", ru: "Нужен", he: "נדרש", en: "Required" },
  { v: "strict", ru: "Нужен и обязателен", he: "חובה", en: "Required + mandatory" },
];
const QUALITY: { v: "exact" | "partial"; ru: string; he: string; en: string }[] = [
  { v: "partial", ru: "Подходит близкое", he: "קרוב מספיק", en: "Close enough" },
  { v: "exact", ru: "Только точное", he: "מדויק", en: "Exact only" },
];
const REQ: { v: string; ru: string; he: string; en: string }[] = [
  { v: "rooms", ru: "Комнаты", he: "חדרים", en: "Rooms" },
  { v: "price", ru: "Цена", he: "מחיר", en: "Price" },
  { v: "sqm", ru: "Площадь", he: "שטח", en: "Area" },
  { v: "floor", ru: "Этаж", he: "קומה", en: "Floor" },
  { v: "district", ru: "Район", he: "שכונה", en: "District" },
  { v: "mamad", ru: "Мамад", he: "ממ״ד", en: "Mamad" },
];

function RadioRow<T extends string>({
  title,
  opts,
  value,
  onChange,
}: {
  title: string;
  opts: { v: T; ru: string; he: string; en: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const lang = getLang();
  return (
    <div className="card">
      <label className="label">{title}</label>
      <div className="flex flex-col gap-2">
        {opts.map((o) => {
          const on = value === o.v;
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => {
                hapticSelection();
                onChange(o.v);
              }}
              className={`pill justify-start border ${
                on
                  ? "border-transparent bg-accent text-accent-text"
                  : "border-line bg-surface text-ink"
              }`}
            >
              {o[lang]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StepFinal() {
  const lang = getLang();
  const mamad = useWizardStore((s) => s.mamad);
  const min_quality = useWizardStore((s) => s.min_quality);
  const required_fields = useWizardStore((s) => s.required_fields);
  const set = useWizardStore((s) => s.set);
  const toggleRequired = useWizardStore((s) => s.toggleRequired);

  const reqLabel = lang === "he" ? "שדות חובה" : lang === "en" ? "Required fields" : "Обязательные поля";

  return (
    <div className="space-y-4">
      <RadioRow
        title={lang === "he" ? "ממ״ד" : lang === "en" ? "Safe room (mamad)" : "Мамад"}
        opts={MAMAD}
        value={mamad}
        onChange={(v) => set("mamad", v)}
      />
      <RadioRow
        title={lang === "he" ? "דיוק" : lang === "en" ? "Match quality" : "Точность"}
        opts={QUALITY}
        value={min_quality}
        onChange={(v) => set("min_quality", v)}
      />
      <p className="px-1 text-[12px] text-muted">
        {lang === "he"
          ? "\"קרוב מספיק\" עדיין שולח כאשר חסר פרט; \"מדויק\" שולח רק כשהכול ידוע."
          : lang === "en"
          ? "\"Close enough\" still notifies you when a detail is missing; \"Exact only\" notifies just for fully-known matches."
          : "«Подходит близкое» — присылать и когда какой-то деталь неизвестна; «Только точное» — только когда известно всё."}
      </p>

      <div className="card">
        <label className="label">{reqLabel}</label>
        <p className="mb-2 text-[12px] text-muted">
          {lang === "he"
            ? "שונה מ\"דיוק\" למעלה: שדה שמסומן כאן חוסם לגמרי מודעה בלי הפרט הזה, גם מהארכיון."
            : lang === "en"
            ? "Different from Quality above: a field checked here excludes a listing missing it entirely, even from the archive."
            : "Отличается от «Точности» выше: поле, отмеченное здесь, полностью исключает объявление без этого пункта — даже из архива."}
        </p>
        <div className="flex flex-wrap gap-2">
          {REQ.map((r) => {
            const on = required_fields.includes(r.v);
            return (
              <button
                key={r.v}
                type="button"
                onClick={() => {
                  hapticSelection();
                  toggleRequired(r.v);
                }}
                className={`pill border ${
                  on
                    ? "border-transparent bg-ink text-accent-text"
                    : "border-line bg-surface text-ink"
                }`}
              >
                {r[lang]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
