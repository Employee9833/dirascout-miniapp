import { useEffect, useRef, useState } from "react";
import { useWizardStore, type PaneKey } from "../store/wizardStore";
import { CITIES } from "../data/cities";
import { getLang, getUser, hapticSelection } from "../lib/telegram";
import { fetchPreview, type PreviewCounts } from "../lib/apiClient";
import { tmaFetch } from "../lib/apiClient";

type Lang = "ru" | "he" | "en";

const I18N = {
  ru: {
    profile: "ПРОФИЛЬ", settings: "НАСТРОЙКИ", filters: "ФИЛЬТРЫ",
    user: "Пользователь", notifications: "Уведомления", language: "Язык",
    location: "Локация", price: "Цена",
    rooms: "Комнаты", area: "Площадь", floor: "Этаж", mamad: "Мамад",
    quality: "Точность",
    any: "Любая", anyM: "Любой", notSet: "Не указано", counting: "Считаем…",
    countErr: "Не удалось посчитать",
    found: (n: number, e: number, d: number) =>
      `${n} ${plural(n, "объявление", "объявления", "объявлений")} за ${d} дней · ${e} точных`,
    districtsN: (n: number) => `${n} ${plural(n, "район", "района", "районов")}`,
  },
  he: {
    profile: "פרופיל", settings: "הגדרות", filters: "מסננים",
    user: "משתמש", notifications: "התראות", language: "שפה",
    location: "מיקום", price: "מחיר",
    rooms: "חדרים", area: "שטח", floor: "קומה", mamad: 'ממ"ד',
    quality: "דיוק",
    any: "הכול", anyM: "הכול", notSet: "לא הוגדר", counting: "סופרים…",
    countErr: "הספירה נכשלה",
    found: (n: number, e: number, d: number) => `${n} מודעות ב-${d} ימים · ${e} מדויקות`,
    districtsN: (n: number) => `${n} שכונות`,
  },
  en: {
    profile: "PROFILE", settings: "SETTINGS", filters: "FILTERS",
    user: "User", notifications: "Notifications", language: "Language",
    location: "Location", price: "Price",
    rooms: "Rooms", area: "Area", floor: "Floor", mamad: "Safe room",
    quality: "Match quality",
    any: "Any", anyM: "Any", notSet: "Not set", counting: "Counting…",
    countErr: "Could not count",
    found: (n: number, e: number, d: number) =>
      `${n} ${n === 1 ? "property" : "properties"} in the last ${d} days · ${e} exact`,
    districtsN: (n: number) => `${n} ${n === 1 ? "district" : "districts"}`,
  },
} as const;

// Russian needs three plural forms; the two-form `n === 1` test used
// everywhere else would render "5 объявление".
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const LANG_NAME: Record<Lang, string> = { ru: "Русский", he: "עברית", en: "English" };

/** "3500 – 4800 ₪" / "от 3" / "до 4" / null when both ends are unset. */
export function rangeSummary(
  lo: number | null,
  hi: number | null,
  lang: Lang,
  unit = "",
): string | null {
  const u = unit ? ` ${unit}` : "";
  if (lo != null && hi != null) return `${lo} – ${hi}${u}`;
  const from = lang === "he" ? "מ-" : lang === "en" ? "from" : "от";
  const to = lang === "he" ? "עד" : lang === "en" ? "up to" : "до";
  if (lo != null) return `${from} ${lo}${u}`;
  if (hi != null) return `${to} ${hi}${u}`;
  return null;
}

function Row({
  icon, label, value, onClick, muted,
}: {
  icon: string; label: string; value: string; onClick: () => void; muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => { hapticSelection(); onClick(); }}
      className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-start last:border-b-0"
    >
      <span className="w-6 shrink-0 text-center text-[17px]">{icon}</span>
      <span className="flex-1 text-[16px] text-ink">{label}</span>
      <span className={`text-[15px] ${muted ? "text-muted" : "text-ink"}`}>{value}</span>
      <span className="text-[15px] text-muted">›</span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 px-4 text-[13px] font-medium uppercase tracking-wide text-accent">
        {title}
      </h2>
      <div className="overflow-hidden rounded-2xl bg-surface">{children}</div>
    </div>
  );
}

export default function Hub({ onOpen }: { onOpen: (p: PaneKey) => void }) {
  const lang = getLang() as Lang;
  const T = I18N[lang];
  const s = useWizardStore();
  const user = getUser();

  const [counts, setCounts] = useState<PreviewCounts | null>(null);
  const [countState, setCountState] = useState<"idle" | "loading" | "error">("idle");
  // Requests are not aborted (see fetchPreview's own note) -- instead every
  // response carries the sequence number of the request that produced it and
  // anything but the newest is dropped, so a slow early request can never
  // overwrite a fast later one.
  const seq = useRef(0);
  const payload = useWizardStore((st) => st.toPayload);

  // Re-count whenever a FILTER field changes. Debounced: the ranges are
  // free-typed number inputs, so without this every keystroke of "4500" is
  // its own round trip through the tunnel.
  const filterKey = JSON.stringify([
    s.city, s.districts, s.rooms_min, s.rooms_max, s.price_min, s.price_max,
    s.sqm_min, s.sqm_max, s.floor_min, s.floor_max, s.mamad, s.min_quality,
    s.required_fields,
  ]);
  useEffect(() => {
    const mine = ++seq.current;
    setCountState("loading");
    const timer = setTimeout(() => {
      fetchPreview(payload())
        .then((c) => {
          if (seq.current !== mine) return;
          setCounts(c);
          setCountState("idle");
        })
        .catch(() => {
          if (seq.current !== mine) return;
          setCountState("error");
        });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const cityEntry = CITIES.cities.find((c) => c.code === s.city);
  const locationValue = !cityEntry
    ? T.notSet
    : s.districts.length === 0
    ? cityEntry.labels[lang]
    : s.districts.length === 1
    ? `${cityEntry.labels[lang]}, ${s.districts[0]}`
    : `${cityEntry.labels[lang]}, ${T.districtsN(s.districts.length)}`;
  const subtitle =
    countState === "loading" && counts === null
      ? T.counting
      : countState === "error"
      ? T.countErr
      : counts
      ? T.found(counts.count, counts.exact, counts.days)
      : T.counting;

  return (
    <div className="pb-4">
      <Section title={T.profile}>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-[17px] font-semibold text-accent-text">
            {(user?.first_name ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="flex flex-col">
            <span className="text-[16px] text-ink">
              {[user?.first_name, user?.last_name].filter(Boolean).join(" ") || T.user}
              {user?.username ? ` (@${user.username})` : ""}
            </span>
            <span className="text-[14px] text-muted">{T.user}</span>
          </span>
        </div>
      </Section>

      <Section title={T.settings}>
        {/* Only a saved profile has anything to pause -- see the store's
            `active` note. A brand-new search simply has no such state yet. */}
        {s.profile_id != null && (
          <NotificationsRow lang={lang} label={T.notifications} />
        )}
        {/* Language is read-only on purpose: it comes from the Telegram
            client (initDataUnsafe.user.language_code), so a separate
            in-app setting would be a second source of truth that silently
            disagrees with every message the BOT sends. */}
        <div className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0">
          <span className="w-6 shrink-0 text-center text-[17px]">🌐</span>
          <span className="flex-1 text-[16px] text-ink">{T.language}</span>
          <span className="text-[15px] text-muted">{LANG_NAME[lang]}</span>
        </div>
      </Section>

      <Section title={T.filters}>
        <div className="border-b border-line px-4 pb-2 pt-1 text-[13px] text-muted">
          {subtitle}
        </div>
        {/* City and districts read as one question ("where?") and share one
            pane -- see LocationPane. The row summarises whichever is the
            more specific answer the user has actually given. */}
        <Row icon="📍" label={T.location} value={locationValue}
             muted={!cityEntry} onClick={() => onOpen("location")} />
        <Row icon="💰" label={T.price}
             value={rangeSummary(s.price_min, s.price_max, lang, "₪") ?? T.any}
             muted={s.price_min == null && s.price_max == null}
             onClick={() => onOpen("price")} />
        <Row icon="🚪" label={T.rooms}
             value={rangeSummary(s.rooms_min, s.rooms_max, lang) ?? T.anyM}
             muted={s.rooms_min == null && s.rooms_max == null}
             onClick={() => onOpen("rooms")} />
        <Row icon="📐" label={T.area}
             value={rangeSummary(s.sqm_min, s.sqm_max, lang, "m²") ?? T.any}
             muted={s.sqm_min == null && s.sqm_max == null}
             onClick={() => onOpen("sqm")} />
        <Row icon="🏢" label={T.floor}
             value={rangeSummary(s.floor_min, s.floor_max, lang) ?? T.anyM}
             muted={s.floor_min == null && s.floor_max == null}
             onClick={() => onOpen("floor")} />
        <Row icon="🛡" label={T.mamad}
             value={s.mamad === "any" ? T.anyM
                    : lang === "he" ? "נדרש" : lang === "en" ? "Required" : "Нужен"}
             muted={s.mamad === "any"} onClick={() => onOpen("mamad")} />
        <Row icon="🎯" label={T.quality}
             value={s.min_quality === "exact"
                    ? (lang === "he" ? "מדויק" : lang === "en" ? "Exact only" : "Только точное")
                    : (lang === "he" ? "קרוב מספיק" : lang === "en" ? "Close enough" : "Близкое")}
             onClick={() => onOpen("quality")} />
      </Section>
    </div>
  );
}

/** Pause/resume, riding the same owner-checked endpoint as the bot's own
 * ⏸/▶️ button. Optimistic: the switch moves under the finger and rolls back
 * if the request fails, since a toggle that visibly does nothing for a
 * whole tunnel round trip reads as broken. */
function NotificationsRow({ lang, label }: { lang: Lang; label: string }) {
  const active = useWizardStore((st) => st.active);
  const pid = useWizardStore((st) => st.profile_id);
  const set = useWizardStore((st) => st.set);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy || pid == null) return;
    hapticSelection();
    const prev = active;
    setBusy(true);
    set("active", !prev);
    try {
      const res = await tmaFetch("/api/subscriptions/toggle", {
        method: "POST",
        body: JSON.stringify({ profile_id: pid }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { active?: boolean };
      if (typeof data.active === "boolean") set("active", data.active);
    } catch {
      set("active", prev);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0">
      <span className="w-6 shrink-0 text-center text-[17px]">🔔</span>
      <span className="flex-1 text-[16px] text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={label}
        disabled={busy}
        onClick={toggle}
        className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${
          active ? "bg-accent" : "bg-line"
        } ${busy ? "opacity-60" : ""}`}
      >
        <span
          className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white transition-all ${
            active ? "start-[22px]" : "start-[2px]"
          }`}
        />
      </button>
      <span className="sr-only">{lang}</span>
    </div>
  );
}
