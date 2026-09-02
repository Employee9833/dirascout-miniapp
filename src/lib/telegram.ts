// Thin wrapper around the Telegram WebApp SDK.
// Uses @telegram-apps/sdk when present; falls back to window.Telegram.WebApp.

import type { ThemeParams } from "./types";

export interface TelegramWebAppLike {
  initData: string;
  initDataUnsafe: { user?: { language_code?: string; id?: number } };
  themeParams: ThemeParams;
  ready: () => void;
  expand: () => void;
  close: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  MainButton: {
    setText: (t: string) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback: {
    selectionChanged: () => void;
    impactOccurred: (s: "light" | "medium" | "heavy") => void;
    notificationOccurred: (s: "error" | "success" | "warning") => void;
  };
  sendData: (data: string) => void;
}

export function getWebApp(): TelegramWebAppLike | null {
  const w = window as unknown as { Telegram?: { WebApp?: TelegramWebAppLike } };
  return w.Telegram?.WebApp ?? null;
}

export function initTelegram(): TelegramWebAppLike | null {
  const tg = getWebApp();
  if (!tg) return null;
  tg.ready();
  tg.expand();
  const tp = tg.themeParams;
  if (tp?.bg_color) document.documentElement.style.setProperty("--tg-bg", tp.bg_color);
  if (tp?.text_color) document.documentElement.style.setProperty("--tg-fg", tp.text_color);
  if (tp?.hint_color) document.documentElement.style.setProperty("--tg-hint", tp.hint_color);
  if (tp?.button_color) document.documentElement.style.setProperty("--tg-accent", tp.button_color);
  if (tp?.button_text_color)
    document.documentElement.style.setProperty("--tg-accent-text", tp.button_text_color);
  // 2026-08-29 review: was typed on ThemeParams but never actually read --
  // --tg-card stayed hardcoded #fafafa forever, so every card/field/pill
  // (tailwind.config.js's `surface`/`tint` tokens) rendered white even in a
  // dark Telegram theme, against a now-correctly-dark --tg-bg page.
  if (tp?.secondary_bg_color)
    document.documentElement.style.setProperty("--tg-card", tp.secondary_bg_color);
  return tg;
}

export function getLang(): "ru" | "he" | "en" {
  const tg = getWebApp();
  const lc =
    tg?.initDataUnsafe?.user?.language_code ??
    (navigator.language || "ru").slice(0, 2);
  const l = lc.slice(0, 2);
  return l === "he" || l === "en" ? l : "ru";
}

export function hapticSelection(): void {
  getWebApp()?.HapticFeedback.selectionChanged();
}

export function hapticImpact(s: "light" | "medium" | "heavy" = "light"): void {
  getWebApp()?.HapticFeedback.impactOccurred(s);
}

// The signed initData string, sent on every REST request as
// X-Telegram-Init-Data (see apiClient.ts's tmaFetch) -- NEVER logged, NEVER
// stored beyond the request that needs it (plan v2 §8).
//
// P3 (2026-09-01): replaces the old sendData() path entirely. sendData()
// silently does nothing when the Mini App was launched from an inline
// keyboard button (only the Keyboard-button launch mode supports it --
// official Telegram behavior, confirmed live 2026-08-31; commit ca6e2cc
// already moved every launch button to inline), so every action that used
// to go through it -- wizard submit, toggle, delete, edit -- was silently a
// no-op for anyone who opened the app the normal way. REST replaces it, not
// just for the write path but structurally: it also means the app can READ
// live state (subscriptionsStore.fetchAll) instead of only ever seeing the
// snapshot baked into the launch URL.
export function getInitData(): string {
  return getWebApp()?.initData ?? "";
}
