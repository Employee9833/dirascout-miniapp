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

// Submit the collected payload. For now this goes straight to the bot via
// sendData (the existing integration). The network layer in apiClient.ts is
// the future path to a real backend; sendSearch() is the single seam to swap.
export function submitViaSendData(payload: unknown): void {
  const tg = getWebApp();
  if (!tg) {
    // Dev fallback when opened outside Telegram.
    console.log("[mini-app] sendData payload:", JSON.stringify(payload, null, 2));
    return;
  }
  tg.sendData(JSON.stringify(payload));
}
