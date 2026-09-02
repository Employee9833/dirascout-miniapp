import { useState } from "react";
import type { Subscription } from "../lib/types";
import { CITY_PROFILE_NAME } from "../lib/types";
import { hapticImpact, hapticSelection } from "../lib/telegram";
import { useSubscriptionsStore } from "../store/subscriptionsStore";

const I18N = {
  ru: {
    title: "Мои подписки",
    empty: "Подписок пока нет.",
    pause: "⏸ Пауза",
    resume: "▶️ Включить",
    edit: "✏️ Изменить",
    del: "🗑 Удалить",
    delConfirm: "🗑 Точно?",
    paused: "⏸ на паузе",
    anyCity: "любой город",
    rooms: "комн.",
  },
  he: {
    title: "החיפושים שלי",
    empty: "אין עדיין חיפושים.",
    pause: "⏸ השהה",
    resume: "▶️ הפעל",
    edit: "✏️ ערוך",
    del: "🗑 מחק",
    delConfirm: "🗑 למחוק?",
    paused: "⏸ מושהה",
    anyCity: "כל עיר",
    rooms: "חד'",
  },
  en: {
    title: "My subscriptions",
    empty: "No subscriptions yet.",
    pause: "⏸ Pause",
    resume: "▶️ Resume",
    edit: "✏️ Edit",
    del: "🗑 Delete",
    delConfirm: "🗑 Sure?",
    paused: "⏸ paused",
    anyCity: "any city",
    rooms: "rooms",
  },
} as const;

function fmtRange(lo: number | null, hi: number | null): string | null {
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null) return lo === hi ? `${lo}` : `${lo}–${hi}`;
  if (lo != null) return `${lo}+`;
  return `≤${hi}`;
}

function summarize(item: Subscription, T: (typeof I18N)[keyof typeof I18N]): string {
  const parts: string[] = [`🏙 ${item.city ?? T.anyCity}`];
  const price = fmtRange(item.price_min, item.price_max);
  if (price) parts.push(`💰 ${price} ₪`);
  const rooms = fmtRange(item.rooms_min, item.rooms_max);
  if (rooms) parts.push(`🚪 ${rooms} ${T.rooms}`);
  if (item.districts.length) parts.push(`📍 ${item.districts.join(", ")}`);
  if (item.mamad === "required") parts.push("🛡");
  return `${item.name}\n${parts.join(" · ")}`;
}

export default function ManageSubs({
  lang,
  onEdit,
}: {
  lang: "ru" | "he" | "en";
  onEdit: (item: Subscription) => void;
}) {
  const T = I18N[lang];
  const items = useSubscriptionsStore((s) => s.items);
  const loading = useSubscriptionsStore((s) => s.loading);
  const error = useSubscriptionsStore((s) => s.error);
  const sessionExpired = useSubscriptionsStore((s) => s.sessionExpired);
  const toggle = useSubscriptionsStore((s) => s.toggle);
  const remove = useSubscriptionsStore((s) => s.remove);
  const clearError = useSubscriptionsStore((s) => s.clearError);

  // Delete needs a second tap: a mistaken single tap on a screen with
  // several rows close together must not delete anything -- one extra tap
  // is cheap insurance (unchanged reasoning from the pre-REST version).
  const [confirmId, setConfirmId] = useState<number | string | null>(null);

  if (sessionExpired) {
    return (
      <p className="text-[14px] text-red-500">
        {lang === "he"
          ? "הסשן פג — פתחו את האפליקציה מחדש"
          : lang === "en"
          ? "Session expired — reopen the Mini App"
          : "Сессия истекла — переоткройте Mini App"}
      </p>
    );
  }

  if (loading && items.length === 0) {
    return <p className="text-[14px] text-muted">…</p>;
  }

  // A failed fetch (network/CSP block, 5xx, ...) must not read as "no
  // subscriptions yet" -- items being empty because nothing loaded is a
  // completely different situation from items being empty because there
  // is genuinely nothing there, and conflating them hid a real CSP
  // connect-src block behind a misleading empty state (found live,
  // 2026-09-02: fetchAll() was silently failing and this screen showed
  // the empty-state text instead of the fetch error).
  if (error && items.length === 0) {
    return (
      <p className="text-[14px] text-red-500" onClick={clearError}>
        {error}
      </p>
    );
  }

  if (items.length === 0) {
    return <p className="text-[14px] text-muted">{T.empty}</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{T.title}</h1>
      {error && (
        <p className="text-[13px] text-red-500" onClick={clearError}>
          {error}
        </p>
      )}
      {items.map((item) => {
        const editable = item.name !== CITY_PROFILE_NAME;
        const pending = typeof item.id === "string";
        return (
          <div key={item.id} className="card space-y-3" style={pending ? { opacity: 0.6 } : undefined}>
            <p className="whitespace-pre-line text-[14px] text-ink">
              {summarize(item, T)}
              {!item.active && (
                <span className="ml-2 text-[12px] text-muted">{T.paused}</span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  hapticImpact("light");
                  toggle(item.id as number);
                }}
                className="pill border border-line bg-surface text-ink"
              >
                {item.active ? T.pause : T.resume}
              </button>
              {editable && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    hapticImpact("light");
                    onEdit(item);
                  }}
                  className="pill border border-line bg-surface text-ink"
                >
                  {T.edit}
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirmId === item.id) {
                    hapticImpact("light");
                    remove(item.id as number);
                  } else {
                    hapticSelection();
                    setConfirmId(item.id);
                  }
                }}
                className={`pill border ${
                  confirmId === item.id
                    ? "border-transparent bg-red-500 text-white"
                    : "border-line bg-surface text-ink"
                }`}
              >
                {confirmId === item.id ? T.delConfirm : T.del}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
