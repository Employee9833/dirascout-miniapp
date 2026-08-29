// Network layer — PREPARED for a future backend, not yet wired to one.
//
// Today the Mini App delivers the search via Telegram's sendData() straight to
// the bot (see lib/telegram.ts -> submitViaSendData). This module is the seam:
// when a real API exists, implement submitSearch() with the fetch below and
// stop calling submitViaSendData. The initData interceptor is already correct
// per the spec (Authorization: Bearer <initData> on every request).

import { getWebApp, submitViaSendData } from "./telegram";
import type { SearchPayload } from "./types";

function initData(): string {
  return getWebApp()?.initData ?? "";
}

export interface ApiClient {
  submitSearch: (payload: SearchPayload) => Promise<void>;
}

/**
 * Future backend client. Unused until a server exists.
 * Sends initData as a Bearer token so the backend can verify the user.
 */
export async function postSearchToBackend(payload: SearchPayload): Promise<void> {
  const token = initData();
  const res = await fetch("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Search submit failed: ${res.status}`);
  }
}

// Current active submit: Telegram sendData -> bot. Kept here so the seam is
// one place. Swap to postSearchToBackend() once the backend is live.
export function submitSearch(payload: SearchPayload): void {
  submitViaSendData(payload);
}
