type AnalyticsEventName = "process_success" | "process_error" | "export_download" | "repeat_use";
type AnalyticsParams = Record<string, string | number | boolean>;

const APP_ID = "image-format-converter";
const APP_VERSION = "0.1.0";
const SHELL_VERSION = "2026.1.1";
const SUCCESS_COUNT_KEY = `miniapps.analytics.${APP_ID}.successCount`;
const ALLOWED_EVENTS = new Set<AnalyticsEventName>(["process_success", "process_error", "export_download", "repeat_use"]);

function pageLanguage(): "tr" | "en" {
  return window.location.pathname.includes("/apps-en/") || document.documentElement.lang === "en" ? "en" : "tr";
}

function eventSource(): "home_grid" | "deeplink" {
  return document.referrer ? "home_grid" : "deeplink";
}

function isLocalHost(): boolean {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

export function trackAppEvent(eventName: AnalyticsEventName, params: AnalyticsParams = {}): void {
  if (isLocalHost()) return;
  if (!ALLOWED_EVENTS.has(eventName)) return;

  const gtag = (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag;
  gtag?.("event", eventName, {
    app_id: APP_ID,
    app_version: APP_VERSION,
    shell_version: SHELL_VERSION,
    source: eventSource(),
    page_language: pageLanguage(),
    ...params,
  });
}

export function trackProcessSuccess(params: AnalyticsParams = {}): void {
  trackAppEvent("process_success", params);

  const currentCount = Number.parseInt(window.sessionStorage.getItem(SUCCESS_COUNT_KEY) || "0", 10);
  const nextCount = Number.isFinite(currentCount) ? currentCount + 1 : 1;
  window.sessionStorage.setItem(SUCCESS_COUNT_KEY, String(nextCount));

  if (nextCount >= 2) {
    trackAppEvent("repeat_use", { run_index: nextCount });
  }
}
