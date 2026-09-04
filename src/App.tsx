import { useEffect, useRef, useState } from "react";
import { initTelegram, hapticImpact, hapticSelection } from "./lib/telegram";
import { useWizardStore } from "./store/wizardStore";
import { useSubscriptionsStore } from "./store/subscriptionsStore";
import { getLang } from "./lib/telegram";
import type { SearchPayload, Subscription } from "./lib/types";
import { CITY_PROFILE_NAME } from "./lib/types";
import StepRanges from "./components/StepRanges";
import StepFinal from "./components/StepFinal";
import ManageSubs from "./components/ManageSubs";
import Hub from "./components/Hub";
import LocationPane from "./components/LocationPane";
import type { PaneKey } from "./store/wizardStore";

// Which editor each hub row opens, and what the header says while it is
// open. The editors are the ORIGINAL wizard step components, each narrowed
// by its own `only` prop -- the hub replaced the navigation between them,
// not the fields themselves.
const PANES: Record<PaneKey, { node: () => JSX.Element; title: Record<"ru" | "he" | "en", string> }> = {
  location: { node: () => <LocationPane />, title: { ru: "Локация", he: "מיקום", en: "Location" } },
  price: { node: () => <StepRanges only="price" />, title: { ru: "Цена", he: "מחיר", en: "Price" } },
  rooms: { node: () => <StepRanges only="rooms" />, title: { ru: "Комнаты", he: "חדרים", en: "Rooms" } },
  sqm: { node: () => <StepRanges only="sqm" />, title: { ru: "Площадь", he: "שטח", en: "Area" } },
  floor: { node: () => <StepRanges only="floor" />, title: { ru: "Этаж", he: "קומה", en: "Floor" } },
  mamad: { node: () => <StepFinal only="mamad" />, title: { ru: "Мамад", he: 'ממ"ד', en: "Safe room" } },
  quality: { node: () => <StepFinal only="quality" />, title: { ru: "Точность", he: "דיוק", en: "Match quality" } },
};

const I18N = {
  ru: {
    title: "Новый поиск",
    titleEdit: "Редактировать поиск",
    done: "Готово",
    submit: "Сохранить поиск",
    submitError: "Не удалось сохранить. Попробуйте ещё раз.",
    sessionExpired: "Сессия истекла — переоткройте Mini App",
  },
  he: {
    title: "חיפוש חדש",
    titleEdit: "ערוך חיפוש",
    done: "סיום",
    submit: "שמור חיפוש",
    submitError: "השמירה נכשלה. נסו שוב.",
    sessionExpired: "הסשן פג — פתחו את האפליקציה מחדש",
  },
  en: {
    title: "New search",
    titleEdit: "Edit search",
    done: "Done",
    submit: "Save search",
    submitError: "Could not save. Please try again.",
    sessionExpired: "Session expired — reopen the Mini App",
  },
} as const;

// Standard base64 (bot uses base64.b64encode + quote). atob handles the
// +/= alphabet; URLSearchParams already unquoted %2B back to +. Shared by
// both preload readers below -- only the query-param contract differs.
function decodeBase64Json<T>(raw: string): T | null {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const bin = window.atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const json = new TextDecoder("utf-8").decode(bytes);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// Parse ?action=edit&pid=<id>&data=<base64 JSON> for preload.
// Exported for direct unit testing (round-trip against the bot's encoding).
export function readPreload(): Partial<SearchPayload> | null {
  const p = new URLSearchParams(window.location.search);
  if (p.get("action") !== "edit") return null;
  const raw = p.get("data");
  if (!raw) return null;
  return decodeBase64Json<Partial<SearchPayload>>(raw);
}

export default function App() {
  const tg = initTelegram();
  const lang = getLang();
  const T = I18N[lang];

  const pane = useWizardStore((s) => s.pane);
  const action = useWizardStore((s) => s.action);
  const name = useWizardStore((s) => s.name);
  const openPane = useWizardStore((s) => s.openPane);
  const closePane = useWizardStore((s) => s.closePane);
  const loadFromPreload = useWizardStore((s) => s.loadFromPreload);
  const resetWizard = useWizardStore((s) => s.reset);
  const toPayload = useWizardStore((s) => s.toPayload);

  const fetchAll = useSubscriptionsStore((s) => s.fetchAll);
  const createSub = useSubscriptionsStore((s) => s.create);
  const patchSub = useSubscriptionsStore((s) => s.patch);
  const subsSessionExpired = useSubscriptionsStore((s) => s.sessionExpired);

  // Holds the actual server/network message, not a boolean -- a generic
  // "could not save, try again" (found live 2026-09-02) told the user
  // nothing when the real reason was e.g. "«rooms_min»/«rooms_max»: от не
  // может быть больше чем до", which retrying can never fix.
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Belt-and-suspenders against a double-tap creating two profiles:
  // mb.disable() is the primary guard, but Telegram's own docs never state
  // whether the native button actually suppresses the tap event while
  // isActive=false (found in audit, 2026-09-02 -- the docs describe the
  // property, not that guarantee), so this doesn't rely on it. A plain
  // useState boolean would also work for the check, but re-render timing
  // between two rapid taps is exactly what a ref sidesteps.
  const submitting = useRef(false);
  // "менеджер текущих подписок тоже должен быть в приложении" -- a second
  // top-level screen alongside the create/edit wizard. Mutable now (2026-09-01,
  // REST): tapping ✏️ on a manage row loads that subscription straight into
  // the wizard store and switches here, in-app -- no bot round trip needed
  // (GET /api/subscriptions already returned the full row, unlike the old
  // sendData "edit_open" hop, which also silently never fired for an
  // inline-launched app; see lib/telegram.ts's getInitData docstring).
  // `returnToManage` remembers whether a successful wizard submit should go
  // back to the list (edit-in-place) or close the app (a fresh launch).
  const initialMode: "wizard" | "manage" =
    new URLSearchParams(window.location.search).get("action") === "manage" ? "manage" : "wizard";
  const [mode, setMode] = useState<"wizard" | "manage">(initialMode);
  const [returnToManage, setReturnToManage] = useState(false);

  // What the launch URL asks for, decided once. The bot builds four
  // distinct entry points and they are NOT interchangeable:
  //   ?action=new    -> a blank create form (the "＋ новый поиск" button)
  //   ?action=edit   -> that ONE profile, preloaded from the deep link
  //   ?action=manage -> the subscriptions list
  //   (no action)    -> the user's one main filter (2026-09-04)
  //
  // Found live 2026-09-04, immediately after shipping the hub: only `manage`
  // and `edit` were checked, so `?action=new` fell through to the main-filter
  // branch and silently opened the user's EXISTING search instead. Creating a
  // second search became impossible -- every attempt edited the first one.
  const launchAction = new URLSearchParams(window.location.search).get("action");

  useEffect(() => {
    if (initialMode === "manage") {
      fetchAll();
      return;
    }
    if (launchAction === "new") return;   // blank form, load nothing
    const pre = readPreload();
    if (pre) {
      loadFromPreload(pre);
      return;
    }
    // A bare launch opens the main filter: the first profile that is not the
    // bot-owned personal City one (matching.CITY_PROFILE_NAME), which the API
    // refuses Mini App writes to -- offering it here would put the user in a
    // form whose every save is rejected.
    fetchAll().then(() => {
      const items = useSubscriptionsStore.getState().items;
      const main = items.find((i) => i.name !== CITY_PROFILE_NAME);
      if (main) loadFromPreload({ ...main, profile_id: main.id as number });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hebrew is a first-class language here, not an afterthought -- but
  // index.html hardcodes lang="ru" (it has to be static, getLang() only
  // knows the user's language after Telegram.WebApp initializes) and
  // nothing anywhere ever set `dir`, so a Hebrew user always got an
  // ltr-rendered page: text alignment, the step-indicator dots' fill
  // direction, everything reading in the wrong order (found in audit,
  // 2026-09-02 -- no dir/rtl usage existed anywhere in the frontend).
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
  }, [lang]);

  function openEdit(item: Subscription) {
    resetWizard();
    loadFromPreload({ ...item, profile_id: item.id as number });
    setReturnToManage(true);
    setMode("wizard");
  }

  // Native BackButton wiring. Three destinations, most specific first:
  // an open pane goes back to the hub; a hub reached FROM the manage list
  // goes back to that list; anything else has nowhere to go and hides it
  // (Telegram's own close/swipe already covers "leave the screen").
  useEffect(() => {
    if (!tg) return;
    const bb = tg.BackButton;
    let handler: (() => void) | null = null;
    if (mode === "wizard" && pane !== null) {
      handler = () => { hapticImpact("light"); closePane(); };
    } else if (mode === "wizard" && returnToManage) {
      handler = () => { hapticImpact("light"); setMode("manage"); };
    }
    if (!handler) {
      bb.hide();
      return;
    }
    bb.show();
    const h = handler;
    bb.onClick(h);
    return () => bb.offClick(h);
  }, [tg, mode, pane, closePane, returnToManage]);

  // Native MainButton: "Готово" closes an open pane, "Сохранить" submits
  // from the hub.
  //
  // `name` MUST be in the deps array (found in review 2026-08-29, confirmed
  // with a failing test before the fix): tg.MainButton.onClick registers a
  // plain JS callback with Telegram's native SDK, not a React element -- it
  // holds whatever closure `handler` had when this effect last ran, and that
  // only happens when a LISTED dep changes. Typing into the name field does
  // not re-run this effect, so without `name` here the empty-name check
  // below reads a stale "" forever and save is rejected for everyone who
  // typed a name normally. Still true on the hub, where the name now lives
  // behind its own pane.
  useEffect(() => {
    if (!tg) return;
    // Manage mode has no single action -- each row's own buttons act
    // immediately (see ManageSubs), so the MainButton has nothing to drive.
    if (mode !== "wizard") {
      tg.MainButton.hide();
      return;
    }
    const mb = tg.MainButton;
    const inPane = pane !== null;
    mb.setText(inPane ? T.done : T.submit);
    mb.show();
    mb.enable();
    const handler = () => {
      hapticSelection();
      if (inPane) {
        closePane();
        return;
      }
      // No empty-name gate any more: the user never types a name, and
      // toPayload() derives one from the criteria (see the store's
      // autoName). The API still requires a non-empty one.
      if (submitting.current) return;
      submitting.current = true;
      setSubmitError(null);
      mb.disable();
      // toPayload()'s "action"/"profile_id" are extra, harmless keys as far
      // as the store/API are concerned (_miniapp_to_fields allowlists
      // specific keys and ignores the rest) -- passed through as-is.
      const payload = toPayload();
      const req =
        action === "edit" && payload.profile_id != null
          ? patchSub(payload.profile_id, payload)
          : createSub(payload);
      req.then((result) => {
        submitting.current = false;
        mb.enable();
        // create() resolves null on failure; patch() has no return value to
        // check, so a failed patch is read off the store's own error/
        // sessionExpired flags instead (set synchronously before this
        // .then() runs, since both are awaited promises). Both failure
        // paths always set `error` before resolving, UNLESS it was a 401 --
        // that is `subsSessionExpired`, shown as its own message.
        const storeError = useSubscriptionsStore.getState().error;
        const failed =
          (action !== "edit" && result === null) ||
          storeError !== null ||
          useSubscriptionsStore.getState().sessionExpired;
        if (failed) {
          setSubmitError(storeError ?? T.submitError);
          return;
        }
        if (returnToManage) {
          setMode("manage");
          fetchAll();
        } else {
          tg.close();
        }
      });
    };
    mb.onClick(handler);
    return () => mb.offClick(handler);
  }, [tg, mode, pane, closePane, toPayload, name, T.submit, T.done, T.submitError,
      action, createSub, patchSub, returnToManage, fetchAll]);

  if (mode === "manage") {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col px-4 pb-24 pt-4">
        <ManageSubs lang={lang} onEdit={openEdit} />
      </div>
    );
  }

  const active = pane !== null ? PANES[pane] : null;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col pb-24 pt-4">
      <header className="mb-4 px-4">
        <h1 className="text-xl font-semibold">
          {active ? active.title[lang] : action === "edit" ? T.titleEdit : T.title}
        </h1>
      </header>
      <main className={`flex-1 ${active ? "px-4" : ""}`}>
        {active ? active.node() : <Hub onOpen={openPane} />}
      </main>
      <div className="px-4">
      {subsSessionExpired && (
        <p className="mt-3 text-[13px] text-red-500">{T.sessionExpired}</p>
      )}
      {submitError && !subsSessionExpired && (
        <p className="mt-3 text-[13px] text-red-500">{submitError}</p>
      )}
      </div>
    </div>
  );
}
