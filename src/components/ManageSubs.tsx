import { useState } from "react";
import type { ManageItem } from "../lib/types";
import { hapticImpact, hapticSelection, submitViaSendData } from "../lib/telegram";

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
  },
} as const;

export default function ManageSubs({
  items,
  lang,
}: {
  items: ManageItem[];
  lang: "ru" | "he" | "en";
}) {
  const T = I18N[lang];
  // Delete needs a second tap: /subs' own inline 🗑 has no confirmation
  // step either, but there a mistaken tap just re-shows the list (harmless
  // soft-delete, still fixable from a backup); here sendData() closes the
  // Mini App immediately on the first tap, with no "oops, undo" screen to
  // land on afterwards -- one extra tap is cheap insurance against a
  // fat-finger on a screen with several rows close together.
  const [confirmId, setConfirmId] = useState<number | null>(null);

  function act(action: "toggle" | "delete" | "edit_open", id: number) {
    hapticImpact("light");
    submitViaSendData({ action, profile_id: id });
  }

  if (items.length === 0) {
    return <p className="text-[14px] text-muted">{T.empty}</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{T.title}</h1>
      {items.map((item) => (
        <div key={item.id} className="card space-y-3">
          <p className="whitespace-pre-line text-[14px] text-ink">
            {item.summary}
            {!item.active && (
              <span className="ml-2 text-[12px] text-muted">{T.paused}</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => act("toggle", item.id)}
              className="pill border border-line bg-surface text-ink"
            >
              {item.active ? T.pause : T.resume}
            </button>
            {item.editable && (
              <button
                type="button"
                onClick={() => act("edit_open", item.id)}
                className="pill border border-line bg-surface text-ink"
              >
                {T.edit}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirmId === item.id) {
                  act("delete", item.id);
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
      ))}
    </div>
  );
}
