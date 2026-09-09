import { useEffect, useState } from "react";
import type { MatchCard, ReportReason } from "../lib/types";
import { hapticSelection } from "../lib/telegram";
import { ApiError, addFavorite, removeFavorite, reportListing } from "../lib/apiClient";

type Lang = "ru" | "he" | "en";

const I18N = {
  ru: {
    rooms: "комн.", floor: "этаж", mamadYes: "мамад", mamadNo: "без мамада",
    gone: "скорее всего сдано",
    agent: "маклер", private: "без посредника", open: "Открыть объявление",
    repeat: "повтор", unknownPrefix: "не указано:",
    f: { district: "район", mamad: "мамад", sqm: "площадь", price: "цена",
         rooms: "комнаты", floor: "этаж", city: "город", street_code: "улица" },
    noPrice: "цена не указана", today: "сегодня", yesterday: "вчера",
    daysAgo: (n: number) => `${n} дн. назад`,
    fav: "В избранное", favOn: "В избранном", report: "Пожаловаться",
    reportWhy: "Что не так?", cancel: "Отмена",
    reported: "Жалоба отправлена", favLimit: "Достигнут лимит избранного",
    reportLimit: "Лимит жалоб на сегодня исчерпан", failed: "Не получилось",
    reasons: { spam: "Спам", rented: "Уже сдано", wrong_place: "Не тот район",
               agent: "Маклер", scam: "Мошенничество", other: "Другое" },
  },
  he: {
    rooms: "חד'", floor: "קומה", mamadYes: 'ממ"ד', mamadNo: 'ללא ממ"ד',
    gone: "כנראה כבר הושכר",
    agent: "מתווך", private: "ללא תיווך", open: "פתיחת המודעה",
    repeat: "חוזר", unknownPrefix: "לא צוין:",
    f: { district: "שכונה", mamad: 'ממ"ד', sqm: "שטח", price: "מחיר",
         rooms: "חדרים", floor: "קומה", city: "עיר", street_code: "רחוב" },
    noPrice: "מחיר לא צוין", today: "היום", yesterday: "אתמול",
    daysAgo: (n: number) => `לפני ${n} ימים`,
    fav: "הוספה למועדפים", favOn: "במועדפים", report: "דיווח",
    reportWhy: "מה הבעיה?", cancel: "ביטול",
    reported: "הדיווח נשלח", favLimit: "הגעת למגבלת המועדפים",
    reportLimit: "נגמרו הדיווחים להיום", failed: "לא הצליח",
    reasons: { spam: "ספאם", rented: "כבר הושכר", wrong_place: "שכונה לא נכונה",
               agent: "מתווך", scam: "הונאה", other: "אחר" },
  },
  en: {
    rooms: "rooms", floor: "floor", mamadYes: "safe room", mamadNo: "no safe room",
    gone: "probably taken",
    agent: "agent", private: "no agent", open: "Open listing",
    repeat: "repeat", unknownPrefix: "not stated:",
    f: { district: "district", mamad: "safe room", sqm: "area", price: "price",
         rooms: "rooms", floor: "floor", city: "city", street_code: "street" },
    noPrice: "no price", today: "today", yesterday: "yesterday",
    daysAgo: (n: number) => `${n}d ago`,
    fav: "Save", favOn: "Saved", report: "Report",
    reportWhy: "What is wrong?", cancel: "Cancel",
    reported: "Report sent", favLimit: "Favorites limit reached",
    reportLimit: "No reports left today", failed: "Did not work",
    reasons: { spam: "Spam", rented: "Already taken", wrong_place: "Wrong area",
               agent: "Agent", scam: "Scam", other: "Other" },
  },
} as const;

/** "сегодня" / "вчера" / "N дн. назад" from the best timestamp the listing
 * has. `posted_at` (a real epoch from the source) is preferred over
 * `first_seen` (when WE saw it) -- for a polled board those differ by days. */
export function whenLabel(card: MatchCard, T: (typeof I18N)[Lang]): string {
  const ms = card.posted_at != null
    ? card.posted_at * 1000
    : Date.parse(card.first_seen);
  if (!Number.isFinite(ms)) return "";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return T.today;
  if (days === 1) return T.yesterday;
  return T.daysAgo(days);
}

/** "Ашкелон · Афридар · ХаТаясим" from whichever parts resolved. */
export function placeLabel(card: MatchCard): string {
  return [card.city, card.district, card.street].filter(Boolean).join(" · ");
}

function Chip({ children, tone = "plain" }: {
  children: React.ReactNode;
  tone?: "plain" | "warn" | "good";
}) {
  const cls = tone === "warn"
    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
    : tone === "good"
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : "bg-tint text-sub shadow-border";
  return (
    <span className={`rounded-pill px-2 py-0.5 text-[12px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

const REPORT_REASONS: ReportReason[] = [
  "spam", "rented", "wrong_place", "agent", "scam", "other",
];

export default function ListingCard({
  card, lang, onHidden,
}: {
  card: MatchCard;
  lang: Lang;
  /** Called after a successful report: the listing is now blocked_at on the
   * server and would vanish on the next fetch anyway, so the feed drops it
   * immediately rather than showing a card that is already gone for everyone.
   */
  onHidden?: (listingId: number) => void;
}) {
  const T = I18N[lang];
  // Optimistic, but reverted on failure -- a star that stays lit after the
  // request failed is worse than one that never lit, because the user walks
  // away believing the listing is saved.
  const [fav, setFav] = useState(Boolean(card.favorite));
  // useState only seeds on MOUNT. The feed keys cards by match_id, so a
  // refetch reuses this component instance -- without re-syncing, a star
  // whose server-side state changed (starred from the bot, or from another
  // device) would keep rendering whatever it was when first mounted.
  useEffect(() => { setFav(Boolean(card.favorite)); },
            [card.favorite, card.listing_id]);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function toggleFav() {
    if (busy) return;
    const next = !fav;
    setBusy(true);
    setFav(next);
    hapticSelection();
    try {
      if (next) await addFavorite(card.listing_id);
      else await removeFavorite(card.listing_id);
      setNote(null);
    } catch (e) {
      setFav(!next);
      // 409 is the tier cap, which is expected traffic and deserves its own
      // message rather than a generic failure. Matched on ApiError.status,
      // not on the message text -- the detail string is server-authored and
      // localized, so substring-matching it would break on any wording change.
      setNote(e instanceof ApiError && e.status === 409 ? T.favLimit : T.failed);
    } finally {
      setBusy(false);
    }
  }

  async function sendReport(reason: ReportReason) {
    if (busy) return;
    setBusy(true);
    setPicking(false);
    hapticSelection();
    try {
      await reportListing(card.listing_id, reason);
      setNote(T.reported);
      onHidden?.(card.listing_id);
    } catch (e) {
      // 429 = the 3/day quota, spent. Anything else is a real failure.
      setNote(e instanceof ApiError && e.status === 429 ? T.reportLimit : T.failed);
    } finally {
      setBusy(false);
    }
  }
  // Photos are the single biggest "make it beautiful" lever here, but they
  // are also scraped CDN urls that expire (Facebook 403s, Telegram 404s --
  // the same class of failure that used to kill whole Telegram cards, see
  // bot._send_card_async). A broken <img> must degrade to no image, never
  // to a broken-image glyph, so failures collapse the element entirely.
  const [broken, setBroken] = useState(false);
  const hero = !broken && card.photos.length > 0 ? card.photos[0] : null;

  const facts: string[] = [];
  if (card.rooms != null) facts.push(`${card.rooms} ${T.rooms}`);
  if (card.sqm != null) facts.push(`${card.sqm} m²`);
  if (card.floor != null) facts.push(`${T.floor} ${card.floor}`);

  return (
    <article className="overflow-hidden rounded-card bg-surface shadow-card">
      {hero && (
        <div className="relative">
          <img
            src={hero}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-44 w-full object-cover"
          />
          {card.photos.length > 1 && (
            <span className="absolute bottom-2 end-2 rounded-pill bg-black/60 px-2 py-0.5 text-[12px] text-white">
              📷 {card.photos.length}
            </span>
          )}
        </div>
      )}

      <div className="space-y-2.5 p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[19px] font-semibold text-ink">
            {card.price != null
              ? `${card.price.toLocaleString("ru-RU")} ₪`
              : <span className="text-[15px] font-normal text-muted">{T.noPrice}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {card.alive === 0 && (
              <span className="rounded-pill bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                {T.gone}
              </span>
            )}
            <span className="text-[12px] text-muted">{whenLabel(card, T)}</span>
          </span>
        </div>

        {placeLabel(card) && (
          <div className="text-[14px] text-sub">📍 {placeLabel(card)}</div>
        )}

        {facts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {facts.map((f) => <Chip key={f}>{f}</Chip>)}
            {card.mamad === 1 && <Chip tone="good">🛡 {T.mamadYes}</Chip>}
            {card.mamad === 0 && <Chip>🛡 {T.mamadNo}</Chip>}
            {card.seller === "agent" && <Chip>💼 {T.agent}</Chip>}
            {card.seller === "private" && <Chip tone="good">👤 {T.private}</Chip>}
            {card.times_seen > 1 && <Chip>🔁 {T.repeat} ×{card.times_seen}</Chip>}
          </div>
        )}

        {/* Why this one is only a partial match -- naming the fields is the
            whole point of the separate tab (a card that "might fit, the
            listing just didn't say" is not the same as one that fits). */}
        {card.unknown_fields.length > 0 && (
          <div className="text-[12px] text-amber-600 dark:text-amber-400">
            ⚠️ {T.unknownPrefix}{" "}
            {card.unknown_fields
              .map((f) => (T.f as Record<string, string>)[f] ?? f)
              .join(", ")}
          </div>
        )}

        {/* Scraped free text: preview only, never the card's structure. */}
        <p className="line-clamp-3 whitespace-pre-line text-[13px] leading-snug text-sub">
          {card.text}
        </p>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="truncate text-[11px] text-muted">
            {card.sources.join(", ")}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={toggleFav}
              disabled={busy}
              aria-pressed={fav}
              aria-label={fav ? T.favOn : T.fav}
              title={fav ? T.favOn : T.fav}
              className="rounded-btn px-2 py-1.5 text-[15px] leading-none disabled:opacity-50"
            >
              {fav ? "\u2b50" : "\u2606"}
            </button>
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              disabled={busy}
              aria-label={T.report}
              title={T.report}
              className="rounded-btn px-2 py-1.5 text-[15px] leading-none disabled:opacity-50"
            >
              {"\ud83d\udea9"}
            </button>
            {card.url && (
              <a
                href={card.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => hapticSelection()}
                className="rounded-btn bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-text"
              >
                {T.open}
              </a>
            )}
          </div>
        </div>

        {/* Two taps, same as the bot: the flag only opens the picker, and the
            reason is what actually reports. Each reason names a different
            upstream code path, so an unlabelled report would be unactionable. */}
        {picking && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="w-full text-[11px] text-muted">{T.reportWhy}</span>
            {REPORT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => sendReport(r)}
                disabled={busy}
                className="rounded-btn border border-hairline px-2 py-1 text-[12px] disabled:opacity-50"
              >
                {T.reasons[r]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="rounded-btn px-2 py-1 text-[12px] text-muted"
            >
              {T.cancel}
            </button>
          </div>
        )}

        {note && <p className="pt-1 text-[11px] text-muted">{note}</p>}
      </div>
    </article>
  );
}
