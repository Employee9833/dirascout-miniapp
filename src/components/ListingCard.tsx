import { useState } from "react";
import type { MatchCard } from "../lib/types";
import { hapticSelection } from "../lib/telegram";

type Lang = "ru" | "he" | "en";

const I18N = {
  ru: {
    rooms: "комн.", floor: "этаж", mamadYes: "мамад", mamadNo: "без мамада",
    agent: "маклер", private: "без посредника", open: "Открыть объявление",
    repeat: "повтор", unknownPrefix: "не указано:",
    f: { district: "район", mamad: "мамад", sqm: "площадь", price: "цена",
         rooms: "комнаты", floor: "этаж", city: "город", street_code: "улица" },
    noPrice: "цена не указана", today: "сегодня", yesterday: "вчера",
    daysAgo: (n: number) => `${n} дн. назад`,
  },
  he: {
    rooms: "חד'", floor: "קומה", mamadYes: 'ממ"ד', mamadNo: 'ללא ממ"ד',
    agent: "מתווך", private: "ללא תיווך", open: "פתיחת המודעה",
    repeat: "חוזר", unknownPrefix: "לא צוין:",
    f: { district: "שכונה", mamad: 'ממ"ד', sqm: "שטח", price: "מחיר",
         rooms: "חדרים", floor: "קומה", city: "עיר", street_code: "רחוב" },
    noPrice: "מחיר לא צוין", today: "היום", yesterday: "אתמול",
    daysAgo: (n: number) => `לפני ${n} ימים`,
  },
  en: {
    rooms: "rooms", floor: "floor", mamadYes: "safe room", mamadNo: "no safe room",
    agent: "agent", private: "no agent", open: "Open listing",
    repeat: "repeat", unknownPrefix: "not stated:",
    f: { district: "district", mamad: "safe room", sqm: "area", price: "price",
         rooms: "rooms", floor: "floor", city: "city", street_code: "street" },
    noPrice: "no price", today: "today", yesterday: "yesterday",
    daysAgo: (n: number) => `${n}d ago`,
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

export default function ListingCard({ card, lang }: { card: MatchCard; lang: Lang }) {
  const T = I18N[lang];
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
          <span className="shrink-0 text-[12px] text-muted">{whenLabel(card, T)}</span>
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
          {card.url && (
            <a
              href={card.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => hapticSelection()}
              className="shrink-0 rounded-btn bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-text"
            >
              {T.open}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
