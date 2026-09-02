import { useEffect, useState } from "react";
import { initTelegram, hapticImpact, hapticSelection } from "./lib/telegram";
import { useWizardStore } from "./store/wizardStore";
import { useSubscriptionsStore } from "./store/subscriptionsStore";
import { getLang } from "./lib/telegram";
import type { SearchPayload, Subscription } from "./lib/types";
import StepNameCity from "./components/StepNameCity";
import StepDistricts from "./components/StepDistricts";
import StepRanges from "./components/StepRanges";
import StepFinal from "./components/StepFinal";
import ManageSubs from "./components/ManageSubs";

const I18N = {
  ru: {
    title: "Новый поиск",
    titleEdit: "Редактировать поиск",
    next: "Далее",
    submit: "Показать варианты",
    submitError: "Не удалось сохранить. Попробуйте ещё раз.",
    sessionExpired: "Сессия истекла — переоткройте Mini App",
  },
  he: {
    title: "חיפוש חדש",
    titleEdit: "ערוך חיפוש",
    next: "הבא",
    submit: "הצג הצעות",
    submitError: "השמירה נכשלה. נסו שוב.",
    sessionExpired: "הסשן פג — פתחו את האפליקציה מחדש",
  },
  en: {
    title: "New search",
    titleEdit: "Edit search",
    next: "Next",
    submit: "Show options",
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

  const step = useWizardStore((s) => s.step);
  const action = useWizardStore((s) => s.action);
  const name = useWizardStore((s) => s.name);
  const next = useWizardStore((s) => s.next);
  const back = useWizardStore((s) => s.back);
  const loadFromPreload = useWizardStore((s) => s.loadFromPreload);
  const resetWizard = useWizardStore((s) => s.reset);
  const toPayload = useWizardStore((s) => s.toPayload);

  const fetchAll = useSubscriptionsStore((s) => s.fetchAll);
  const createSub = useSubscriptionsStore((s) => s.create);
  const patchSub = useSubscriptionsStore((s) => s.patch);
  const subsSessionExpired = useSubscriptionsStore((s) => s.sessionExpired);

  const [nameError, setNameError] = useState(false);
  const [submitError, setSubmitError] = useState(false);
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

  useEffect(() => {
    if (initialMode === "manage") {
      fetchAll();
      return;
    }
    const pre = readPreload();
    if (pre) loadFromPreload(pre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEdit(item: Subscription) {
    resetWizard();
    loadFromPreload({ ...item, profile_id: item.id as number });
    setReturnToManage(true);
    setMode("wizard");
  }

  // Native BackButton wiring. In manage mode there is no step to go back
  // to -- Telegram's own close/swipe already covers "leave the screen".
  useEffect(() => {
    if (!tg) return;
    const bb = tg.BackButton;
    // Reached the wizard from the manage list (returnToManage) -- step 0's
    // back arrow goes back to that list instead of hiding, since there IS
    // somewhere to go back to now (unlike a fresh bot-launched wizard).
    if (mode === "wizard" && step === 0 && returnToManage) {
      bb.show();
      const handler = () => {
        hapticImpact("light");
        setMode("manage");
      };
      bb.onClick(handler);
      return () => bb.offClick(handler);
    }
    if (mode !== "wizard" || step === 0) {
      bb.hide();
    } else {
      bb.show();
      const handler = () => {
        hapticImpact("light");
        back();
      };
      bb.onClick(handler);
      return () => bb.offClick(handler);
    }
  }, [tg, mode, step, back, returnToManage]);

  // Native MainButton: drives Next / Submit.
  //
  // `name` MUST be in the deps array (found in review, confirmed with a
  // failing test before this fix): tg.MainButton.onClick registers a plain
  // JS callback with Telegram's native SDK, not a React element -- it holds
  // whatever closure `handler` had at the moment this effect last ran, and
  // that only happens when a LISTED dep changes. Without `name` here, the
  // handler keeps referencing whatever `name` was when the user first
  // landed on step 0 (usually "") for as long as `step`/`tg` don't change --
  // typing into the name field never re-runs this effect, so the check on
  // line ~106 always saw the STALE value. In practice this made "Далее"
  // permanently reject step 0 for anyone who typed a name normally (type,
  // then tap), a real showstopper for the new-profile flow, and the same
  // stale check runs on an edit's preloaded name too (loadFromPreload sets
  // `name` in a separate effect that also doesn't retrigger this one).
  useEffect(() => {
    if (!tg) return;
    // Manage mode has no single Next/Submit action -- each row's own
    // buttons act immediately (see ManageSubs), so the native MainButton
    // has nothing to drive here.
    if (mode !== "wizard") {
      tg.MainButton.hide();
      return;
    }
    const mb = tg.MainButton;
    const isFinal = step === 3;
    mb.setText(isFinal ? T.submit : T.next);
    mb.show();
    mb.enable();
    const handler = () => {
      hapticSelection();
      if (isFinal) {
        setSubmitError(false);
        mb.disable();
        // toPayload()'s "action"/"profile_id" are extra, harmless keys as
        // far as the store/API are concerned (api_server.py's own
        // _miniapp_to_fields already allowlists specific keys and ignores
        // the rest) -- passed through as-is rather than stripped.
        const payload = toPayload();
        const req =
          action === "edit" && payload.profile_id != null
            ? patchSub(payload.profile_id, payload)
            : createSub(payload);
        req.then((result) => {
          mb.enable();
          // create() resolves null on failure; patch() has no return value
          // to check, so a failed patch is read off the store's own error/
          // sessionExpired flags instead (set synchronously by the store
          // before this .then() runs, since both are awaited promises).
          const failed =
            (action !== "edit" && result === null) ||
            useSubscriptionsStore.getState().error !== null ||
            useSubscriptionsStore.getState().sessionExpired;
          if (failed) {
            setSubmitError(true);
            return;
          }
          if (returnToManage) {
            setMode("manage");
            fetchAll();
          } else {
            tg.close();
          }
        });
      } else {
        if (step === 0 && !name.trim()) {
          setNameError(true);
          return;
        }
        setNameError(false);
        next();
      }
    };
    mb.onClick(handler);
    return () => mb.offClick(handler);
  }, [tg, mode, step, next, toPayload, name, T.submit, T.next, action, createSub, patchSub, returnToManage, fetchAll]);

  const steps = [StepNameCity, StepDistricts, StepRanges, StepFinal];
  const StepComp = steps[step];

  if (mode === "manage") {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col px-4 pb-24 pt-4">
        <ManageSubs lang={lang} onEdit={openEdit} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-4 pb-24 pt-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">
          {action === "edit" ? T.titleEdit : T.title}
        </h1>
        <div className="mt-2 flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${
                i <= step ? "bg-accent" : "bg-line"
              }`}
            />
          ))}
        </div>
      </header>
      <main className="flex-1">
        <StepComp />
      </main>
      {nameError && (
        <p className="mt-3 text-[13px] text-red-500">
          {lang === "he"
            ? "נא להזין שם לחיפוש"
            : lang === "en"
            ? "Please enter a search name"
            : "Введите название поиска"}
        </p>
      )}
      {subsSessionExpired && (
        <p className="mt-3 text-[13px] text-red-500">{T.sessionExpired}</p>
      )}
      {submitError && !subsSessionExpired && (
        <p className="mt-3 text-[13px] text-red-500">{T.submitError}</p>
      )}
    </div>
  );
}
