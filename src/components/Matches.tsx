import { useEffect, useState } from "react";
import { useMatchesStore, feedKey } from "../store/matchesStore";
import type { MatchProfile, MatchQuality } from "../lib/types";
import { hapticSelection } from "../lib/telegram";
import ListingCard from "./ListingCard";

type Lang = "ru" | "he" | "en";

const I18N = {
  ru: {
    title: "Совпадения",
    empty: "Совпадений пока нет.",
    emptyHint: "Они появятся, когда монитор найдёт подходящее объявление.",
    loading: "Загружаем…",
    exact: "Точные",
    partial: "Неточные",
    noneExact: "Точных совпадений пока нет.",
    nonePartial: "Неточных совпадений нет.",
    partialHint: "Подходят по заданным фильтрам, но объявление не указало часть данных.",
    paused: "⏸ на паузе",
    never: "пока ничего",
    sessionExpired: "Сессия истекла — переоткройте Mini App",
  },
  he: {
    title: "התאמות",
    empty: "אין עדיין התאמות.",
    emptyHint: "הן יופיעו כשהמוניטור ימצא מודעה מתאימה.",
    loading: "טוען…",
    exact: "מדויקות",
    partial: "חלקיות",
    noneExact: "אין עדיין התאמות מדויקות.",
    nonePartial: "אין התאמות חלקיות.",
    partialHint: "מתאימות למסננים, אבל המודעה לא ציינה חלק מהפרטים.",
    paused: "⏸ מושהה",
    never: "עדיין כלום",
    sessionExpired: "הסשן פג — פתחו את האפליקציה מחדש",
  },
  en: {
    title: "Matches",
    empty: "No matches yet.",
    emptyHint: "They show up once the monitor finds a listing that fits.",
    loading: "Loading…",
    exact: "Exact",
    partial: "Partial",
    noneExact: "No exact matches yet.",
    nonePartial: "No partial matches.",
    partialHint: "They fit your filters, but the listing left some details out.",
    paused: "⏸ paused",
    never: "nothing yet",
    sessionExpired: "Session expired — reopen the Mini App",
  },
} as const;

function ProfileRow({ p, T, onOpen }: {
  p: MatchProfile;
  T: (typeof I18N)[Lang];
  onOpen: (p: MatchProfile) => void;
}) {
  const total = p.exact + p.partial;
  return (
    <button
      type="button"
      onClick={() => { hapticSelection(); onOpen(p); }}
      className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-start last:border-b-0"
      disabled={total === 0}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[16px] text-ink">{p.name}</span>
        <span className="text-[13px] text-muted">
          {total === 0 ? T.never : (
            <>
              {p.exact > 0 && <span className="text-emerald-600 dark:text-emerald-400">{p.exact} ✓</span>}
              {p.exact > 0 && p.partial > 0 && " · "}
              {p.partial > 0 && <span className="text-amber-600 dark:text-amber-400">{p.partial} ⚠️</span>}
            </>
          )}
          {!p.active && ` · ${T.paused}`}
        </span>
      </span>
      {total > 0 && <span className="text-[15px] text-muted">›</span>}
    </button>
  );
}

export default function Matches({ lang, onBack }: { lang: Lang; onBack?: () => void }) {
  const T = I18N[lang];
  const { profiles, profilesLoading, feeds, feedLoading, error, sessionExpired,
          loadProfiles, loadFeed } = useMatchesStore();
  const [open, setOpen] = useState<MatchProfile | null>(null);
  const [tab, setTab] = useState<MatchQuality>("exact");

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  // Opening a search lands on whichever tab actually HAS something -- a
  // search with only partial matches would otherwise open on an empty
  // "Exact" tab and read as broken.
  function openProfile(p: MatchProfile) {
    const start: MatchQuality = p.exact > 0 ? "exact" : "partial";
    setOpen(p);
    setTab(start);
    loadFeed(p.id, start);
  }

  function switchTab(q: MatchQuality) {
    if (!open) return;
    hapticSelection();
    setTab(q);
    loadFeed(open.id, q);
  }

  if (sessionExpired) {
    return <p className="px-4 py-6 text-[14px] text-red-500">{T.sessionExpired}</p>;
  }

  // --- one search's feed -------------------------------------------------
  if (open) {
    const cards = feeds[feedKey(open.id, tab)];
    return (
      <div className="pb-4">
        <header className="mb-3 px-4">
          <button
            type="button"
            onClick={() => { hapticSelection(); setOpen(null); onBack?.(); }}
            className="mb-2 text-[13px] text-accent"
          >
            ‹ {T.title}
          </button>
          <h1 className="truncate text-xl font-semibold">{open.name}</h1>
        </header>

        <div className="mb-3 flex gap-1.5 px-4">
          {(["exact", "partial"] as MatchQuality[]).map((q) => {
            const n = q === "exact" ? open.exact : open.partial;
            const on = tab === q;
            return (
              <button
                key={q}
                type="button"
                onClick={() => switchTab(q)}
                className={`flex-1 rounded-btn px-3 py-2 text-[14px] font-medium ${
                  on ? "bg-accent text-accent-text" : "bg-surface text-sub shadow-border"
                }`}
              >
                {q === "exact" ? T.exact : T.partial} {n > 0 && `(${n})`}
              </button>
            );
          })}
        </div>

        {tab === "partial" && (
          <p className="mb-3 px-4 text-[12px] text-muted">{T.partialHint}</p>
        )}

        {error && <p className="px-4 text-[14px] text-red-500">{error}</p>}
        {cards === undefined && feedLoading && (
          <p className="px-4 text-[14px] text-muted">{T.loading}</p>
        )}
        {cards !== undefined && cards.length === 0 && (
          <p className="px-4 text-[14px] text-muted">
            {tab === "exact" ? T.noneExact : T.nonePartial}
          </p>
        )}
        <div className="space-y-3 px-4">
          {(cards ?? []).map((c) => (
            <ListingCard key={c.match_id} card={c} lang={lang} />
          ))}
        </div>
      </div>
    );
  }

  // --- the index: searches and what each has found -----------------------
  return (
    <div className="pb-4">
      <h1 className="mb-3 px-4 text-xl font-semibold">{T.title}</h1>
      {error && <p className="px-4 text-[14px] text-red-500">{error}</p>}
      {profilesLoading && profiles.length === 0 && (
        <p className="px-4 text-[14px] text-muted">{T.loading}</p>
      )}
      {!profilesLoading && profiles.length === 0 && !error && (
        <div className="px-4">
          <p className="text-[15px] text-ink">{T.empty}</p>
          <p className="mt-1 text-[13px] text-muted">{T.emptyHint}</p>
        </div>
      )}
      {profiles.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-surface">
          {profiles.map((p) => (
            <ProfileRow key={p.id} p={p} T={T} onOpen={openProfile} />
          ))}
        </div>
      )}
    </div>
  );
}
