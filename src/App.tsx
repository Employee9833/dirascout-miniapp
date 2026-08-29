import { useEffect, useState } from "react";
import { initTelegram, hapticImpact, hapticSelection } from "./lib/telegram";
import { useWizardStore } from "./store/wizardStore";
import { submitSearch } from "./lib/apiClient";
import { getLang } from "./lib/telegram";
import type { SearchPayload, ManageItem } from "./lib/types";
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
    saved: "Готово — данные отправлены боту",
  },
  he: {
    title: "חיפוש חדש",
    titleEdit: "ערוך חיפוש",
    next: "הבא",
    submit: "הצג הצעות",
    saved: "הנתונים נשלחו לבוט",
  },
  en: {
    title: "New search",
    titleEdit: "Edit search",
    next: "Next",
    submit: "Show options",
    saved: "Sent to the bot",
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

// Parse ?action=manage&data=<base64 JSON array> (bot.py's _encode_manage_url).
export function readManagePreload(): ManageItem[] | null {
  const p = new URLSearchParams(window.location.search);
  if (p.get("action") !== "manage") return null;
  const raw = p.get("data");
  if (!raw) return null;
  const items = decodeBase64Json<ManageItem[]>(raw);
  return Array.isArray(items) ? items : null;
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
  const toPayload = useWizardStore((s) => s.toPayload);

  const [nameError, setNameError] = useState(false);
  // "менеджер текущих подписок тоже должен быть в приложении" -- a second
  // top-level screen alongside the create/edit wizard, entered via its own
  // ?action=manage preload (bot.py's _encode_manage_url). Tapping ✏️ on a
  // row switches mode back to "wizard" with that profile's fields loaded
  // (see handleEditFromManage below) rather than reopening the Mini App.
  const [mode, setMode] = useState<"wizard" | "manage">(() =>
    readManagePreload() ? "manage" : "wizard"
  );
  const [manageItems] = useState<ManageItem[]>(() => readManagePreload() ?? []);

  useEffect(() => {
    if (mode !== "wizard") return;
    const pre = readPreload();
    if (pre) loadFromPreload(pre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEditFromManage(item: ManageItem) {
    loadFromPreload({ ...item.fields, profile_id: item.id });
    setMode("wizard");
  }

  // Native BackButton wiring. In manage mode there is no step to go back
  // to -- Telegram's own close/swipe already covers "leave the screen".
  useEffect(() => {
    if (!tg) return;
    const bb = tg.BackButton;
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
  }, [tg, mode, step, back]);

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
        submitSearch(toPayload());
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
  }, [tg, mode, step, next, toPayload, name, T.submit, T.next]);

  const steps = [StepNameCity, StepDistricts, StepRanges, StepFinal];
  const StepComp = steps[step];

  if (mode === "manage") {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col px-4 pb-24 pt-4">
        <ManageSubs items={manageItems} lang={lang} onEdit={handleEditFromManage} />
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
    </div>
  );
}
