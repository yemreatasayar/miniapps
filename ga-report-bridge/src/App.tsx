import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from "react";

type AppPage = "overview" | "reports" | "settings";
type DateRangeKey = "today" | "yesterday" | "7d" | "30d" | "month";
type ReportCategory = "overview" | "traffic" | "content" | "events" | "audience";
type TrendMetricKey = "sessions" | "users" | "views" | "conversions";
type SortDirection = "asc" | "desc";
type TableSortKey = "sessions" | "engagementRate" | "averageSessionDuration" | "conversions" | "views" | "users" | "viewsPerUser";

type AnalyticsAccount = {
  id: string;
  name: string;
  propertyId: string;
  siteUrl: string;
  status: "ready" | "needs-setup";
};

type Kpi = {
  users: number;
  newUsers: number;
  sessions: number;
  views: number;
  engagementRate: number;
  averageSessionDuration: number;
  conversions: number;
};

type TrendPoint = {
  rawDate?: string;
  date: string;
  users: number;
  newUsers?: number;
  sessions: number;
  views: number;
  engagementRate: number;
  averageSessionDuration?: number;
  conversions: number;
};

type ChannelPoint = {
  name: string;
  sessions: number;
  previousSessions: number;
  share: number;
  engagementRate: number;
  users: number;
  change: number;
};

type LandingPagePoint = {
  path: string;
  title: string;
  sessions: number;
  users: number;
  views: number;
  engagementRate: number;
  averageSessionDuration: number;
  conversions: number;
};

type TopPagePoint = {
  path: string;
  title: string;
  views: number;
  users: number;
  viewsPerUser: number;
  averageSessionDuration: number;
};

type ReportFile = {
  id: string;
  accountId: string;
  accountName: string;
  propertyId: string;
  title: string;
  description?: string;
  category: ReportCategory;
  date: string;
  startDate?: string;
  endDate?: string;
  rows: number;
  sizeKb: number;
  query: string;
  createdAt?: string;
  name?: string;
  status?: "ok" | "error" | "unavailable";
  warnings?: string[];
  errors?: string[];
  optional?: boolean;
  dashboardVisibility?: string;
  requestedDimensions?: string[];
  requestedMetrics?: string[];
  requestMetrics?: string[];
};

type HelperReport = {
  id: string;
  accountId: string;
  accountName: string;
  propertyId: string;
  date: string;
  startDate?: string;
  endDate?: string;
  category: ReportCategory;
  name: string;
  rows: number;
  sizeKb: number;
  createdAt?: string;
  displayName?: string;
  description?: string;
  status?: "ok" | "error" | "unavailable";
  warnings?: string[];
  errors?: string[];
  optional?: boolean;
  dashboardVisibility?: string;
  requestedDimensions?: string[];
  requestedMetrics?: string[];
  requestMetrics?: string[];
};

type HelperDashboard = Omit<AccountData, "reports">;

type HelperStatus = {
  ready: boolean;
  oauthClientConfigured: boolean;
  oauthClientExists: boolean;
  authorized: boolean;
  accountCount: number;
  dataDir: string;
  tokenPath: string;
};

type HelperConfigResponse = {
  ok: boolean;
  config: {
    oauthClientPath: string;
    accounts: HelperAccountConfig[];
  };
  status: HelperStatus;
};

type HelperDashboardResponse = {
  ok: boolean;
  dashboard: HelperDashboard;
};

type HelperSyncHistoryResponse = {
  ok: boolean;
  history: HelperSyncHistoryEntry[];
};

type HelperAccountConfig = {
  id: string;
  name: string;
  propertyId: string;
  siteUrl?: string;
};

type ToolUsageSummary = {
  profile: "miniapps" | "batchflow";
  available: boolean;
  topTools: Array<{ name: string; count: number }>;
  metrics: {
    success: number;
    errors: number;
    repeats: number;
    favorites: number;
    exports: number;
    newUsers: number;
  };
  funnel: {
    demoStarts: number;
    demoSuccesses: number;
    signUps: number;
    templateUploads: number;
    renderStarts: number;
    renderSuccesses: number;
    exports: number;
    leads: number;
    planSelections: number;
    purchases: number;
  };
};

type DataStatus = {
  timezone: string;
  freshness: string;
  thresholding: string;
  sampling: string;
  quota: string;
  warning: string;
  error: string;
};

type TrafficDetails = {
  uniqueHits: number;
  totalHits: number;
  referralKeyword: string;
  referralUrl: string;
  referralSessions: number;
};

type SyncDataQuality = {
  timezone: string;
  currencyCode: string;
  thresholding: boolean;
  sampling: boolean;
  dataLossFromOtherRow: boolean;
  quota: unknown;
};

type HelperSyncHistoryEntry = {
  key: string;
  accountId: string;
  accountName: string;
  propertyId: string;
  date: string;
  generatedAt: string;
  reportCount: number;
  rows: number;
  sizeKb: number;
  warnings: string[];
  errors: string[];
  dataQuality: SyncDataQuality | null;
  propertyMetadata: {
    property?: string;
    fetchedAt?: string;
    source?: string;
    stale?: boolean;
  } | null;
  statusCounts: Record<string, number>;
};

type AccountData = {
  kpi: Kpi;
  previousKpi: Kpi;
  trend: TrendPoint[];
  previousTrend: TrendPoint[];
  channels: ChannelPoint[];
  landingPages: LandingPagePoint[];
  topPages: TopPagePoint[];
  reports: ReportFile[];
  recentReports: HelperReport[];
  toolUsage: ToolUsageSummary;
  dataStatus: DataStatus;
  trafficDetails: TrafficDetails;
  lastSync: string;
  lastSyncAt: string;
};

type MetricDefinition = {
  id: string;
  label: string;
  description: string;
  kind: "count" | "percent" | "duration" | "ratio";
  current: number;
  previous: number;
  sparkline: number[];
};

type AppIconName =
  | "overview"
  | "reports"
  | "settings"
  | "sessions"
  | "users"
  | "views"
  | "events"
  | "newUsers"
  | "engagementRate"
  | "averageSessionDuration"
  | "keyEventRate";

type TableSortState = {
  key: TableSortKey;
  direction: SortDirection;
};

type SyncGroup = {
  id: string;
  title: string;
  date: string;
  createdAt: string;
  reports: ReportFile[];
  generatedAt: string;
  rows: number;
  sizeKb: number;
  warnings: string[];
  errors: string[];
  dataQuality: SyncDataQuality | null;
  propertyMetadata: HelperSyncHistoryEntry["propertyMetadata"];
  statusCounts: Record<string, number>;
};

type SyncHealth = {
  generatedAt: string;
  reportCount: number;
  warnings: string[];
  errors: string[];
  dataQuality: SyncDataQuality | null;
  propertyMetadata: HelperSyncHistoryEntry["propertyMetadata"];
  statusCounts: Record<string, number>;
};

const HELPER_URL = "http://127.0.0.1:4187";
const LOW_VOLUME_SESSION_THRESHOLD = 50;
const LOW_VOLUME_USER_THRESHOLD = 30;
const LOW_VOLUME_WARNING_TEXT = "Düşük veri hacmi nedeniyle dönemsel değişimler oynak olabilir.";
const TREND_METRICS: Array<{ key: TrendMetricKey; label: string }> = [
  { key: "sessions", label: "Oturumlar" },
  { key: "users", label: "Ziyaretçiler" },
  { key: "views", label: "Görüntülemeler" },
  { key: "conversions", label: "Önemli etkinlikler" },
];
const MAIN_NAV: Array<{ page: AppPage; label: string; icon: AppIconName }> = [
  { page: "overview", label: "Genel Bakış", icon: "overview" },
  { page: "reports", label: "Raporlar", icon: "reports" },
  { page: "settings", label: "Ayarlar", icon: "settings" },
];

const ranges: Array<{ key: DateRangeKey; label: string }> = [
  { key: "today", label: "Bugün" },
  { key: "yesterday", label: "Dün" },
  { key: "7d", label: "7 Gün" },
  { key: "30d", label: "30 Gün" },
  { key: "month", label: "Bu Ay" },
];

const categoryLabels: Record<ReportCategory, string> = {
  overview: "Özet",
  traffic: "Trafik",
  content: "İçerik",
  events: "Etkinlik",
  audience: "Kitle",
};

const reportNameLabels: Record<string, string> = {
  "overview_daily.csv": "Günlük genel bakış",
  "traffic_channels.csv": "Trafik kanalları",
  "source_medium.csv": "Kaynak / medium",
  "referral_urls.csv": "Referral URL'leri",
  "referral_keywords.csv": "Referral keyword",
  "landing_pages.csv": "Açılış sayfaları",
  "pages.csv": "Sayfa performansı",
  "events.csv": "Etkinlik özeti",
  "geo.csv": "Coğrafi dağılım",
  "device_browser.csv": "Cihaz ve tarayıcı",
};

const fallbackAccounts: AnalyticsAccount[] = [
  // Helper kapalıyken yalnızca bilinen gerçek property'yi göster. Demo hesaplar
  // bir bağlantı hatasını gerçek veri gibi göstermemeli.
  { id: "miniapps", name: "miniapps.tr", propertyId: "534353758", siteUrl: "miniapps.tr", status: "needs-setup" },
];

function emptyAccountData(account: AnalyticsAccount, reports: HelperReport[]): AccountData {
  const latestReport = reports
    .slice()
    .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)))[0];

  return {
    kpi: { users: 0, newUsers: 0, sessions: 0, views: 0, engagementRate: 0, averageSessionDuration: 0, conversions: 0 },
    previousKpi: { users: 0, newUsers: 0, sessions: 0, views: 0, engagementRate: 0, averageSessionDuration: 0, conversions: 0 },
    trend: [],
    previousTrend: [],
    channels: [],
    landingPages: [],
    topPages: [],
    reports: [],
    recentReports: [],
    toolUsage: {
      profile: account.id === "batchflow" ? "batchflow" : "miniapps",
      available: false,
      topTools: [],
      metrics: { success: 0, errors: 0, repeats: 0, favorites: 0, exports: 0, newUsers: 0 },
      funnel: { demoStarts: 0, demoSuccesses: 0, signUps: 0, templateUploads: 0, renderStarts: 0, renderSuccesses: 0, exports: 0, leads: 0, planSelections: 0, purchases: 0 },
    },
    dataStatus: {
      timezone: "Bilinmiyor",
      freshness: "Bekleniyor",
      thresholding: "Bilinmiyor",
      sampling: "Bilinmiyor",
      quota: "Bilinmiyor",
      warning: account.status === "ready" ? "Düşük veri hacmi nedeniyle dönemsel değişimler oynak olabilir." : "",
      error: "",
    },
    trafficDetails: {
      uniqueHits: 0,
      totalHits: 0,
      referralKeyword: "Yok",
      referralUrl: "Yok",
      referralSessions: 0,
    },
    lastSync: latestReport ? latestReport.date : account.status === "ready" ? "Henüz sync yok" : "Kurulum bekleniyor",
    lastSyncAt: latestReport?.createdAt || "",
  };
}

function sanitizeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeDashboardData(account: AnalyticsAccount, reports: HelperReport[], dashboard?: Partial<AccountData> & Record<string, unknown>): AccountData {
  const fallback = emptyAccountData(account, reports);
  const rawKpi = (dashboard?.kpi as Partial<Kpi> | undefined) ?? {};
  const rawPreviousKpi = (dashboard?.previousKpi as Partial<Kpi> | undefined) ?? {};
  const rawTrend = Array.isArray(dashboard?.trend) ? dashboard.trend : [];
  const rawPreviousTrend = Array.isArray(dashboard?.previousTrend) ? dashboard.previousTrend : [];
  const rawChannels = Array.isArray(dashboard?.channels) ? dashboard.channels : [];
  const rawLandingPages = Array.isArray(dashboard?.landingPages) ? dashboard.landingPages : [];
  const rawTopPages = Array.isArray(dashboard?.topPages) ? dashboard.topPages : [];
  const rawRecentReports = Array.isArray(dashboard?.recentReports) ? dashboard.recentReports : [];
  const rawToolUsage = (dashboard?.toolUsage as Partial<ToolUsageSummary> | undefined) ?? {};
  const rawToolMetrics = (rawToolUsage.metrics as Partial<ToolUsageSummary["metrics"]> | undefined) ?? {};
  const rawToolFunnel = (rawToolUsage.funnel as Partial<ToolUsageSummary["funnel"]> | undefined) ?? {};
  const rawDataStatus = (dashboard?.dataStatus as Partial<DataStatus> | undefined) ?? {};
  const rawTrafficDetails = (dashboard?.trafficDetails as Partial<TrafficDetails> | undefined) ?? {};

  return {
    ...fallback,
    lastSync: typeof dashboard?.lastSync === "string" ? dashboard.lastSync : fallback.lastSync,
    lastSyncAt: typeof dashboard?.lastSyncAt === "string" ? dashboard.lastSyncAt : fallback.lastSyncAt,
    kpi: {
      users: sanitizeNumber(rawKpi.users),
      newUsers: sanitizeNumber(rawKpi.newUsers),
      sessions: sanitizeNumber(rawKpi.sessions),
      views: sanitizeNumber(rawKpi.views),
      engagementRate: sanitizeNumber(rawKpi.engagementRate),
      averageSessionDuration: sanitizeNumber(rawKpi.averageSessionDuration),
      conversions: sanitizeNumber(rawKpi.conversions),
    },
    previousKpi: {
      users: sanitizeNumber(rawPreviousKpi.users),
      newUsers: sanitizeNumber(rawPreviousKpi.newUsers),
      sessions: sanitizeNumber(rawPreviousKpi.sessions),
      views: sanitizeNumber(rawPreviousKpi.views),
      engagementRate: sanitizeNumber(rawPreviousKpi.engagementRate),
      averageSessionDuration: sanitizeNumber(rawPreviousKpi.averageSessionDuration),
      conversions: sanitizeNumber(rawPreviousKpi.conversions),
    },
    trend: rawTrend.map((point) => ({
      rawDate: typeof point?.rawDate === "string" ? point.rawDate : undefined,
      date: typeof point?.date === "string" ? point.date : "",
      users: sanitizeNumber(point?.users),
      newUsers: sanitizeNumber(point?.newUsers),
      sessions: sanitizeNumber(point?.sessions),
      views: sanitizeNumber(point?.views),
      engagementRate: sanitizeNumber(point?.engagementRate),
      averageSessionDuration: sanitizeNumber(point?.averageSessionDuration),
      conversions: sanitizeNumber(point?.conversions),
    })),
    previousTrend: rawPreviousTrend.map((point) => ({
      rawDate: typeof point?.rawDate === "string" ? point.rawDate : undefined,
      date: typeof point?.date === "string" ? point.date : "",
      users: sanitizeNumber(point?.users),
      newUsers: sanitizeNumber(point?.newUsers),
      sessions: sanitizeNumber(point?.sessions),
      views: sanitizeNumber(point?.views),
      engagementRate: sanitizeNumber(point?.engagementRate),
      averageSessionDuration: sanitizeNumber(point?.averageSessionDuration),
      conversions: sanitizeNumber(point?.conversions),
    })),
    channels: rawChannels.map((channel) => ({
      name: typeof channel?.name === "string" ? channel.name : "Bilinmiyor",
      sessions: sanitizeNumber(channel?.sessions),
      previousSessions: sanitizeNumber(channel?.previousSessions),
      share: sanitizeNumber(channel?.share),
      engagementRate: sanitizeNumber(channel?.engagementRate),
      users: sanitizeNumber(channel?.users),
      change: sanitizeNumber(channel?.change),
    })),
    landingPages: rawLandingPages.map((page) => ({
      path: typeof page?.path === "string" ? page.path : "/",
      title: typeof page?.title === "string" ? page.title : (typeof page?.path === "string" ? page.path : "/"),
      sessions: sanitizeNumber(page?.sessions),
      users: sanitizeNumber(page?.users),
      views: sanitizeNumber(page?.views),
      engagementRate: sanitizeNumber(page?.engagementRate),
      averageSessionDuration: sanitizeNumber(page?.averageSessionDuration),
      conversions: sanitizeNumber(page?.conversions),
    })),
    topPages: rawTopPages.map((page) => ({
      path: typeof page?.path === "string" ? page.path : "/",
      title: typeof page?.title === "string" ? page.title : (typeof page?.path === "string" ? page.path : "/"),
      views: sanitizeNumber(page?.views),
      users: sanitizeNumber(page?.users),
      viewsPerUser: sanitizeNumber(page?.viewsPerUser),
      averageSessionDuration: sanitizeNumber(page?.averageSessionDuration),
    })),
    reports: fallback.reports,
    recentReports: rawRecentReports.map((report) => ({
      id: typeof report?.id === "string" ? report.id : `${account.id}-${Math.random().toString(36).slice(2)}`,
      accountId: typeof report?.accountId === "string" ? report.accountId : account.id,
      accountName: typeof report?.accountName === "string" ? report.accountName : account.name,
      propertyId: typeof report?.propertyId === "string" ? report.propertyId : account.propertyId,
      date: typeof report?.date === "string" ? report.date : fallback.lastSync,
      startDate: typeof report?.startDate === "string" ? report.startDate : undefined,
      endDate: typeof report?.endDate === "string" ? report.endDate : undefined,
      category: ["overview", "traffic", "content", "events", "audience"].includes(String(report?.category))
        ? report.category as ReportCategory
        : "overview",
      name: typeof report?.name === "string" ? report.name : "report.csv",
      rows: sanitizeNumber(report?.rows),
      sizeKb: sanitizeNumber(report?.sizeKb),
      createdAt: typeof report?.createdAt === "string" ? report.createdAt : undefined,
      displayName: typeof report?.displayName === "string" ? report.displayName : undefined,
      description: typeof report?.description === "string" ? report.description : undefined,
      status: ["ok", "error", "unavailable"].includes(String(report?.status)) ? report?.status as "ok" | "error" | "unavailable" : undefined,
      warnings: Array.isArray(report?.warnings) ? report.warnings.filter((item): item is string => typeof item === "string") : [],
      errors: Array.isArray(report?.errors) ? report.errors.filter((item): item is string => typeof item === "string") : [],
      optional: Boolean(report?.optional),
      dashboardVisibility: typeof report?.dashboardVisibility === "string" ? report.dashboardVisibility : undefined,
      requestedDimensions: Array.isArray(report?.requestedDimensions) ? report.requestedDimensions.filter((item): item is string => typeof item === "string") : [],
      requestedMetrics: Array.isArray(report?.requestedMetrics) ? report.requestedMetrics.filter((item): item is string => typeof item === "string") : [],
      requestMetrics: Array.isArray(report?.requestMetrics) ? report.requestMetrics.filter((item): item is string => typeof item === "string") : [],
    })),
    toolUsage: {
      profile: rawToolUsage.profile === "batchflow" || (!rawToolUsage.profile && account.id === "batchflow") ? "batchflow" : "miniapps",
      available: Boolean(rawToolUsage.available),
      topTools: Array.isArray(rawToolUsage.topTools)
        ? rawToolUsage.topTools.map((tool) => ({
          name: typeof tool?.name === "string" ? tool.name : "Bilinmiyor",
          count: sanitizeNumber(tool?.count),
        }))
        : [],
      metrics: {
        success: sanitizeNumber(rawToolMetrics.success),
        errors: sanitizeNumber(rawToolMetrics.errors),
        repeats: sanitizeNumber(rawToolMetrics.repeats),
        favorites: sanitizeNumber(rawToolMetrics.favorites),
        exports: sanitizeNumber(rawToolMetrics.exports),
        newUsers: sanitizeNumber(rawToolMetrics.newUsers),
      },
      funnel: {
        demoStarts: sanitizeNumber(rawToolFunnel.demoStarts),
        demoSuccesses: sanitizeNumber(rawToolFunnel.demoSuccesses),
        signUps: sanitizeNumber(rawToolFunnel.signUps),
        templateUploads: sanitizeNumber(rawToolFunnel.templateUploads),
        renderStarts: sanitizeNumber(rawToolFunnel.renderStarts),
        renderSuccesses: sanitizeNumber(rawToolFunnel.renderSuccesses),
        exports: sanitizeNumber(rawToolFunnel.exports),
        leads: sanitizeNumber(rawToolFunnel.leads),
        planSelections: sanitizeNumber(rawToolFunnel.planSelections),
        purchases: sanitizeNumber(rawToolFunnel.purchases),
      },
    },
    dataStatus: {
      timezone: typeof rawDataStatus.timezone === "string" ? rawDataStatus.timezone : fallback.dataStatus.timezone,
      freshness: typeof rawDataStatus.freshness === "string" ? rawDataStatus.freshness : fallback.dataStatus.freshness,
      thresholding: typeof rawDataStatus.thresholding === "string" ? rawDataStatus.thresholding : fallback.dataStatus.thresholding,
      sampling: typeof rawDataStatus.sampling === "string" ? rawDataStatus.sampling : fallback.dataStatus.sampling,
      quota: typeof rawDataStatus.quota === "string" ? rawDataStatus.quota : fallback.dataStatus.quota,
      warning: typeof rawDataStatus.warning === "string" ? rawDataStatus.warning : fallback.dataStatus.warning,
      error: typeof rawDataStatus.error === "string" ? rawDataStatus.error : fallback.dataStatus.error,
    },
    trafficDetails: {
      uniqueHits: sanitizeNumber(rawTrafficDetails.uniqueHits),
      totalHits: sanitizeNumber(rawTrafficDetails.totalHits),
      referralKeyword: typeof rawTrafficDetails.referralKeyword === "string" ? rawTrafficDetails.referralKeyword : "Yok",
      referralUrl: typeof rawTrafficDetails.referralUrl === "string" ? rawTrafficDetails.referralUrl : "Yok",
      referralSessions: sanitizeNumber(rawTrafficDetails.referralSessions),
    },
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("tr-TR").format(Math.round(value));
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: value >= 1000 ? 1 : 0 }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}

function formatPercentPoints(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} puan`;
}

function formatSignedPercent(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${delta}%`;
}

function formatSignedNumber(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${formatNumber(delta)}`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0 sn";
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  if (minutes === 0) return `${remainingSeconds} sn`;
  return `${minutes} dk ${String(remainingSeconds).padStart(2, "0")} sn`;
}

function formatSyncTimestamp(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}, ${hours}:${minutes}`;
}

function formatDateTime(value: string): string {
  if (!value) return "Bilinmiyor";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateOnly(value: string): string {
  if (!value) return "Bilinmiyor";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTimeOnly(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatSyncMetaLine(group: SyncGroup): string {
  const parts = [`${group.reports.length} rapor`, `${formatNumber(group.rows)} satır`, `${formatNumber(group.sizeKb)} KB`];
  if (group.dataQuality?.timezone) parts.push(group.dataQuality.timezone);
  return parts.join(" · ");
}

function metadataSourceLabel(source?: string): string {
  if (source === "cache") return "Cache";
  if (source === "cache-fallback") return "Cache yedeği";
  if (source === "live") return "Güncel";
  return "Bekleniyor";
}

function samplingLabel(enabled: boolean): string {
  return enabled ? "Var" : "Yok";
}

function thresholdingLabel(enabled: boolean): string {
  return enabled ? "Uygulandı" : "Uygulanmadı";
}

function normalizeFreshnessLabel(value: string): string {
  if (!value) return "Bilinmiyor";
  if (value === "Bugun") return "Bugün";
  return value;
}

function cleanLowVolumeWarning(message: string): string {
  if (!message) return "";
  return message
    .replace(LOW_VOLUME_WARNING_TEXT, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/^[,;:\-–.\s]+/, "")
    .replace(/[,;:\-–.\s]+$/, "")
    .trim();
}

function formatStatusCounts(statusCounts: Record<string, number>): string {
  const parts = [];
  if (statusCounts.ok) parts.push(`${statusCounts.ok} hazır`);
  if (statusCounts.unavailable) parts.push(`${statusCounts.unavailable} kullanılamıyor`);
  if (statusCounts.error) parts.push(`${statusCounts.error} hata`);
  return parts.join(" · ");
}

function changePercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function safeRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvForReport(report: ReportFile): string {
  return [
    "date,category,report,rows,size_kb",
    `${report.date},${categoryLabels[report.category]},${report.title},${report.rows},${report.sizeKb}`,
  ].join("\n");
}

function rangeLabel(range: DateRangeKey): string {
  return ranges.find((item) => item.key === range)?.label ?? "7 Gün";
}

function dateKeyForRange(range: DateRangeKey, offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (range === "month") return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

function reportDisplayName(name: string): string {
  return reportNameLabels[name] || name;
}

function reportMetaLine(report: ReportFile | HelperReport): string {
  const reportName = report.name || ("title" in report ? report.title : "");
  const parts = [reportName, `${report.rows} satır`, `${report.sizeKb} KB`];
  if (report.createdAt) parts.push(formatTimeOnly(report.createdAt));
  return parts.join(" · ");
}

function reportStatusMeta(report: Pick<ReportFile, "status" | "warnings" | "errors">): { label: string; tone: "neutral" | "warning" | "error" } | null {
  if (report.status === "error") return { label: "Hata", tone: "error" };
  if (report.status === "unavailable") return { label: "Bu property için kullanılamıyor", tone: "warning" };
  if ((report.warnings?.length || 0) > 0) return { label: "Uyarı var", tone: "warning" };
  return null;
}

function reportStatusDetail(report: Pick<ReportFile, "warnings" | "errors">): string {
  return report.errors?.[0] || report.warnings?.[0] || "";
}

function AppIcon({ name }: { name: AppIconName }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
    focusable: false,
  };

  const strokeProps = {
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "overview":
      return <svg {...common}><path {...strokeProps} d="M4 13.5h6.5V20H4zM13.5 4H20v16h-6.5zM4 4h6.5v6.5H4z" /></svg>;
    case "reports":
      return <svg {...common}><path {...strokeProps} d="M7 3.8h7.3L19 8.5V20a1.2 1.2 0 0 1-1.2 1.2H7A1.2 1.2 0 0 1 5.8 20V5A1.2 1.2 0 0 1 7 3.8Z" /><path {...strokeProps} d="M14 4v5h5M8.8 13h6.4M8.8 16.5h5" /></svg>;
    case "settings":
      return <svg {...common}><path {...strokeProps} d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" /><path {...strokeProps} d="M19.4 13.6v-3.2l-2.1-.5c-.2-.5-.4-.9-.7-1.3l1.1-1.8-2.3-2.3-1.8 1.1c-.4-.3-.8-.5-1.3-.7L11.8 3H8.6l-.5 2.1c-.5.2-.9.4-1.3.7L5 4.7 2.7 7l1.1 1.8c-.3.4-.5.8-.7 1.3L1 10.6v3.2l2.1.5c.2.5.4.9.7 1.3L2.7 17.4 5 19.7l1.8-1.1c.4.3.8.5 1.3.7l.5 2.1h3.2l.5-2.1c.5-.2.9-.4 1.3-.7l1.8 1.1 2.3-2.3-1.1-1.8c.3-.4.5-.8.7-1.3l2.1-.7Z" /></svg>;
    case "sessions":
      return <svg {...common}><path {...strokeProps} d="M5 12.5c0-4 3.1-7.2 7-7.2s7 3.2 7 7.2-3.1 7.2-7 7.2-7-3.2-7-7.2Z" /><path {...strokeProps} d="M12 8v5l3.4 1.8" /></svg>;
    case "users":
      return <svg {...common}><path {...strokeProps} d="M8.6 11.4a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3.4 20c.7-3.2 2.5-5 5.2-5s4.5 1.8 5.2 5" /><path {...strokeProps} d="M15.2 10.8a3 3 0 1 0 0-5.7M16.4 14.5c2 .5 3.4 2.2 4 5.5" /></svg>;
    case "views":
      return <svg {...common}><path {...strokeProps} d="M3.5 12s3-5.2 8.5-5.2S20.5 12 20.5 12s-3 5.2-8.5 5.2S3.5 12 3.5 12Z" /><path {...strokeProps} d="M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z" /></svg>;
    case "events":
      return <svg {...common}><path {...strokeProps} d="M12 3.8 14.4 9l5.6.7-4.1 3.9 1 5.5L12 16.4 7.1 19.1l1-5.5L4 9.7 9.6 9 12 3.8Z" /></svg>;
    case "newUsers":
      return <svg {...common}><path {...strokeProps} d="M9 11.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM3.8 20c.7-3.1 2.5-4.8 5.2-4.8" /><path {...strokeProps} d="M17 8v7M13.5 11.5h7" /></svg>;
    case "engagementRate":
      return <svg {...common}><path {...strokeProps} d="M4.5 19.5 19.5 4.5" /><path {...strokeProps} d="M7.5 9.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM16.5 18.9a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" /></svg>;
    case "averageSessionDuration":
      return <svg {...common}><path {...strokeProps} d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" /><path {...strokeProps} d="M12 8.5V13l3 1.8M9.5 2.8h5" /></svg>;
    case "keyEventRate":
      return <svg {...common}><path {...strokeProps} d="M4.5 18.5 18.8 4.2" /><path {...strokeProps} d="M6 7.5h5M8.5 5v5M14 16.5h5" /></svg>;
    default:
      return null;
  }
}

function metricTotalFromKpi(kpi: Kpi, key: TrendMetricKey): number {
  if (key === "sessions") return kpi.sessions;
  if (key === "users") return kpi.users;
  if (key === "views") return kpi.views;
  return kpi.conversions;
}

function createSparkline(values: number[]) {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const width = 120;
  const height = 30;
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  return values
    .map((value, index) => {
      const x = step * index;
      const ratio = max === min ? 0.5 : (value - min) / (max - min);
      const y = height - ratio * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function createSparklineEndPoint(values: number[]) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const width = 120;
  const height = 30;
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  const value = values[values.length - 1];
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  return {
    x: step * (values.length - 1),
    y: height - ratio * height,
  };
}

function createLinePath(values: number[], width = 640, height = 280, padding = 20) {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const chartHeight = height - padding * 2;
  const step = values.length === 1 ? 0 : (width - padding * 2) / (values.length - 1);

  return values
    .map((value, index) => {
      const x = padding + step * index;
      const ratio = max === min ? 0.5 : (value - min) / (max - min);
      const y = height - padding - ratio * chartHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function createAreaPath(values: number[], width = 640, height = 280, padding = 20) {
  const linePath = createLinePath(values, width, height, padding);
  if (!linePath) return "";
  const step = values.length === 1 ? 0 : (width - padding * 2) / (values.length - 1);
  const startX = padding;
  const endX = padding + step * (values.length - 1);
  const baseline = height - padding;
  return `${linePath} L ${endX.toFixed(2)} ${baseline.toFixed(2)} L ${startX.toFixed(2)} ${baseline.toFixed(2)} Z`;
}

function metricValueFromTrend(point: TrendPoint, key: TrendMetricKey) {
  return point[key];
}

function trendPointDateKey(point: TrendPoint): string {
  return point.rawDate || point.date;
}

function trendMatchesRange(point: TrendPoint, range: DateRangeKey): boolean {
  const key = trendPointDateKey(point);
  if (!key) return range === "7d";
  if (range === "today") return key === dateKeyForRange("today");
  if (range === "yesterday") return key === dateKeyForRange("yesterday", -1);
  if (range === "month") return key.startsWith(dateKeyForRange("month"));
  return true;
}

function aggregateKpiFromTrend(points: TrendPoint[]): Kpi {
  const totals = points.reduce((sum, point) => ({
    users: sum.users + point.users,
    newUsers: sum.newUsers + (point.newUsers || 0),
    sessions: sum.sessions + point.sessions,
    views: sum.views + point.views,
    engagementWeighted: sum.engagementWeighted + point.engagementRate * point.sessions,
    durationWeighted: sum.durationWeighted + (point.averageSessionDuration || 0) * point.sessions,
    conversions: sum.conversions + point.conversions,
  }), { users: 0, newUsers: 0, sessions: 0, views: 0, engagementWeighted: 0, durationWeighted: 0, conversions: 0 });

  return {
    users: Math.round(totals.users),
    newUsers: Math.round(totals.newUsers),
    sessions: Math.round(totals.sessions),
    views: Math.round(totals.views),
    engagementRate: totals.sessions > 0 ? totals.engagementWeighted / totals.sessions : 0,
    averageSessionDuration: totals.sessions > 0 ? totals.durationWeighted / totals.sessions : 0,
    conversions: Math.round(totals.conversions),
  };
}

function dataForRange(data: AccountData, range: DateRangeKey): AccountData {
  // Tüm aralıklar geniş (60 günlük) trend üzerinden türetilir. Önce seçili
  // aralığın [startIndex, endIndex) dilimi bulunur; sonra ÖNCEKİ DÖNEM aynı
  // sürekli trend'in hemen önceki N günlük penceresi olarak hesaplanır
  // (önceki sync'in örtüşen arşivi DEĞİL). Böylece "önceki dönemle karşılaştır"
  // gerçek dönem-üstü-dönem olur; örtüşen pencere yüzünden ~%0 çıkmaz.
  const all = data.trend;
  let startIndex = Math.max(0, all.length - 7);
  let endIndex = all.length;
  if (range === "30d") {
    startIndex = Math.max(0, all.length - 30);
  } else if (range !== "7d") {
    // today / yesterday / month: tarih filtresiyle eşleşen bitişik aralık.
    const flags = all.map((point) => trendMatchesRange(point, range));
    const first = flags.indexOf(true);
    if (first === -1) {
      startIndex = all.length;
      endIndex = all.length;
    } else {
      startIndex = first;
      endIndex = flags.lastIndexOf(true) + 1;
    }
  }

  const trend = all.slice(startIndex, endIndex);
  const len = trend.length;
  // Önceki dönem: current dilimden hemen önceki N gün. Geçmiş yetersizse
  // (ör. 30g ama henüz 60 gün veri yok) başa boş gün ekleyip hizala — böylece
  // en güncel önceki-gün, en güncel current-güne denk gelir.
  const rawPrevious = all.slice(Math.max(0, startIndex - len), startIndex);
  const padCount = Math.max(0, len - rawPrevious.length);
  const paddedPrevious = [
    ...Array.from({ length: padCount }, (_, index) => emptyTrendPoint(`prev-pad-${index}`)),
    ...rawPrevious,
  ];
  const previousTrend = alignComparisonTrend(trend, paddedPrevious);
  const kpi = aggregateKpiFromTrend(trend);
  const previousKpi = aggregateKpiFromTrend(previousTrend);
  return {
    ...data,
    kpi,
    previousKpi,
    trend,
    previousTrend,
    trafficDetails: {
      ...data.trafficDetails,
      uniqueHits: kpi.users,
      totalHits: kpi.views,
    },
  };
}

function emptyTrendPoint(date: string): TrendPoint {
  return {
    date,
    users: 0,
    sessions: 0,
    views: 0,
    engagementRate: 0,
    conversions: 0,
  };
}

function alignComparisonTrend(current: TrendPoint[], previous: TrendPoint[]): TrendPoint[] {
  return current.map((point, index) => {
    const previousPoint = previous[index];
    if (!previousPoint) return emptyTrendPoint(point.date);
    return {
      date: point.date,
      users: sanitizeNumber(previousPoint.users),
      sessions: sanitizeNumber(previousPoint.sessions),
      views: sanitizeNumber(previousPoint.views),
      engagementRate: sanitizeNumber(previousPoint.engagementRate),
      conversions: sanitizeNumber(previousPoint.conversions),
    };
  });
}

function toggleSort(current: TableSortState, key: TableSortKey): TableSortState {
  if (current.key !== key) return { key, direction: "desc" };
  return { key, direction: current.direction === "desc" ? "asc" : "desc" };
}

function sortLandingPages(rows: LandingPagePoint[], sort: TableSortState) {
  const sorted = rows.slice().sort((left, right) => {
    const leftValue = left[sort.key as keyof LandingPagePoint];
    const rightValue = right[sort.key as keyof LandingPagePoint];
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return sort.direction === "desc" ? rightValue - leftValue : leftValue - rightValue;
    }
    return String(leftValue).localeCompare(String(rightValue));
  });
  return sorted;
}

function sortTopPages(rows: TopPagePoint[], sort: TableSortState) {
  const sorted = rows.slice().sort((left, right) => {
    const leftValue = left[sort.key as keyof TopPagePoint];
    const rightValue = right[sort.key as keyof TopPagePoint];
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return sort.direction === "desc" ? rightValue - leftValue : leftValue - rightValue;
    }
    return String(leftValue).localeCompare(String(rightValue));
  });
  return sorted;
}

function groupReportsBySync(reports: ReportFile[]) {
  const map = new Map<string, SyncGroup>();

  for (const report of reports) {
    const key = `${report.accountId}:${report.date}`;
    const createdAt = report.createdAt || `${report.date}T00:00:00Z`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        id: key,
        title: formatDateTime(createdAt),
        date: report.date,
        createdAt,
        reports: [report],
        generatedAt: createdAt,
        rows: Number(report.rows || 0),
        sizeKb: Number(report.sizeKb || 0),
        warnings: [],
        errors: [],
        dataQuality: null,
        propertyMetadata: null,
        statusCounts: {},
      });
      continue;
    }

    existing.reports.push(report);
    existing.rows += Number(report.rows || 0);
    existing.sizeKb += Number(report.sizeKb || 0);
    if (createdAt > existing.createdAt) {
      existing.createdAt = createdAt;
      existing.title = formatDateTime(createdAt);
      existing.generatedAt = createdAt;
    }
  }

  return [...map.values()]
    .map((group) => ({
      ...group,
      reports: group.reports.sort((left, right) => reportDisplayName(left.title).localeCompare(reportDisplayName(right.title), "tr")),
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function buildMetricDelta(current: number, previous: number, kind: MetricDefinition["kind"]) {
  if (previous === 0 && current > 0) {
    return { tone: "new" as const, label: "Yeni", detail: "Önce veri yoktu", symbol: "•" };
  }

  if (current === previous) {
    return { tone: "neutral" as const, label: "Değişmedi", detail: "Önceki dönemle aynı", symbol: "—" };
  }

  if (kind === "percent" || kind === "ratio") {
    const diff = current - previous;
    return {
      tone: diff > 0 ? "positive" as const : "negative" as const,
      label: formatPercentPoints(diff),
      detail: `${formatPercent(previous)} önceki dönem`,
      symbol: diff > 0 ? "↑" : "↓",
    };
  }

  if (kind === "duration") {
    const diff = Math.round(current - previous);
    return {
      tone: diff > 0 ? "positive" as const : "negative" as const,
      label: `${diff >= 0 ? "+" : ""}${formatDuration(Math.abs(diff))}`,
      detail: `${formatDuration(previous)} önceki dönem`,
      symbol: diff > 0 ? "↑" : "↓",
    };
  }

  const absolute = current - previous;
  return {
    tone: absolute > 0 ? "positive" as const : "negative" as const,
    label: formatSignedNumber(absolute),
    detail: `${formatSignedPercent(changePercent(current, previous))} önceki dönem`,
    symbol: absolute > 0 ? "↑" : "↓",
  };
}

function filterReportsForPage(reports: ReportFile[], query: string, category: string, date: string, sort: SortDirection) {
  const normalizedQuery = query.trim().toLowerCase();
  return reports
    .filter((report) => (category === "all" ? true : report.category === category))
    .filter((report) => (date === "all" ? true : report.date === date))
    .filter((report) => {
      if (!normalizedQuery) return true;
      return [report.title, report.date, report.query, report.accountName, report.propertyId]
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    })
    .sort((left, right) => {
      const leftKey = left.createdAt || left.date;
      const rightKey = right.createdAt || right.date;
      return sort === "desc" ? rightKey.localeCompare(leftKey) : leftKey.localeCompare(rightKey);
    });
}

export default function App() {
  const oauthFileInputRef = useRef<HTMLInputElement>(null);
  const [activePage, setActivePage] = useState<AppPage>("overview");
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 1200));
  const [selectedAccountId, setSelectedAccountId] = useState(fallbackAccounts[0].id);
  const [range, setRange] = useState<DateRangeKey>("7d");
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [trendMetric, setTrendMetric] = useState<TrendMetricKey>("sessions");
  const [helperStatus, setHelperStatus] = useState<HelperStatus | null>(null);
  const [helperConfig, setHelperConfig] = useState<HelperConfigResponse["config"] | null>(null);
  const [helperAccounts, setHelperAccounts] = useState<AnalyticsAccount[]>([]);
  const [helperReports, setHelperReports] = useState<HelperReport[]>([]);
  const [helperSyncHistory, setHelperSyncHistory] = useState<HelperSyncHistoryEntry[]>([]);
  const [helperDashboards, setHelperDashboards] = useState<Record<string, AccountData>>({});
  const [lastSyncOverrides, setLastSyncOverrides] = useState<Record<string, string>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [oauthClientPath, setOauthClientPath] = useState("");
  const [reportQuery, setReportQuery] = useState("");
  const [reportCategoryFilter, setReportCategoryFilter] = useState<string>("all");
  const [reportDateFilter, setReportDateFilter] = useState<string>("all");
  const [reportSortDirection, setReportSortDirection] = useState<SortDirection>("desc");
  const [openSyncGroups, setOpenSyncGroups] = useState<Record<string, boolean>>({});
  const [landingSort, setLandingSort] = useState<TableSortState>({ key: "sessions", direction: "desc" });
  const [pageSort, setPageSort] = useState<TableSortState>({ key: "views", direction: "desc" });
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);
  const [accountDraft, setAccountDraft] = useState<HelperAccountConfig>({
    id: "",
    name: "",
    propertyId: "",
    siteUrl: "",
  });

  async function refreshHelperState() {
    setIsLoading(true);
    try {
      const [configResponse, reportsResponse, syncHistoryResponse] = await Promise.all([
        fetch(`${HELPER_URL}/api/config`, { cache: "no-store" }),
        fetch(`${HELPER_URL}/api/reports`, { cache: "no-store" }),
        fetch(`${HELPER_URL}/api/sync-history`, { cache: "no-store" }).catch(() => null),
      ]);

      if (!configResponse.ok || !reportsResponse.ok) throw new Error("Helper yanıt vermedi.");

      const configData = await configResponse.json() as HelperConfigResponse;
      const reportsData = await reportsResponse.json() as { ok: boolean; reports: HelperReport[] };
      const syncHistoryData = syncHistoryResponse && "ok" in syncHistoryResponse && syncHistoryResponse.ok
        ? await syncHistoryResponse.json() as HelperSyncHistoryResponse
        : { ok: false, history: [] };
      const dashboardEntries = await Promise.all(configData.config.accounts.map(async (account) => {
        const response = await fetch(`${HELPER_URL}/api/dashboard?accountId=${encodeURIComponent(account.id)}`, { cache: "no-store" });
        if (!response.ok) {
          return [account.id, emptyAccountData({ ...account, siteUrl: account.siteUrl || account.id, status: "ready" }, [])] as const;
        }
        const data = await response.json() as HelperDashboardResponse;
        const normalizedAccount = { ...account, siteUrl: account.siteUrl || account.id, status: "ready" } as AnalyticsAccount;
        const accountReports = (Array.isArray(reportsData.reports) ? reportsData.reports : []).filter((report) => report.accountId === account.id);
        return [account.id, normalizeDashboardData(normalizedAccount, accountReports, data.dashboard)] as const;
      }));

      const accounts = configData.config.accounts.map((account) => ({
        id: account.id,
        name: account.name,
        propertyId: account.propertyId,
        siteUrl: account.siteUrl || account.propertyId,
        status: configData.status.authorized ? "ready" : "needs-setup",
      })) satisfies AnalyticsAccount[];

      setHelperStatus(configData.status);
      setHelperConfig(configData.config);
      setOauthClientPath(configData.config.oauthClientPath);
      setHelperAccounts(accounts);
      setHelperReports(Array.isArray(reportsData.reports) ? reportsData.reports : []);
      setHelperSyncHistory(Array.isArray(syncHistoryData.history) ? syncHistoryData.history : []);
      setHelperDashboards(Object.fromEntries(dashboardEntries));

      if (accounts.length > 0 && !accounts.some((account) => account.id === selectedAccountId)) {
        setSelectedAccountId(accounts[0].id);
      }
    } catch {
      setHelperStatus(null);
      setHelperConfig(null);
      setHelperAccounts([]);
      setHelperReports([]);
      setHelperSyncHistory([]);
      setHelperDashboards({});
      setNotice("Analytica yardımcı servisine ulaşılamıyor. Servis yeniden başladığında kayıtlı Google bağlantısı ve raporlar otomatik olarak geri yüklenir.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshHelperState();
  }, []);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 1200) {
        setIsSidebarOpen(true);
      }
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const auth = url.searchParams.get("auth");
    const authDetail = url.searchParams.get("auth_detail");
    if (!auth) return;

    if (auth !== "success") {
      setNotice(authDetail ? `Google bağlantısı tamamlanamadı: ${authDetail}` : "Google bağlantısı tamamlanamadı.");
    }

    if (auth === "success") {
      void refreshHelperState();
    }

    url.searchParams.delete("auth");
    url.searchParams.delete("auth_detail");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const effectiveAccounts = helperAccounts.length > 0 ? helperAccounts : fallbackAccounts;
  const selectedAccount = effectiveAccounts.find((account) => account.id === selectedAccountId) ?? effectiveAccounts[0];
  const accountHelperReports = helperReports.filter((report) => report.accountId === selectedAccount.id);
  const baseCurrentData = helperAccounts.length > 0
    ? helperDashboards[selectedAccount.id] ?? emptyAccountData(selectedAccount, accountHelperReports)
    : emptyAccountData(selectedAccount, []);
  const currentData = useMemo(() => dataForRange(baseCurrentData, range), [baseCurrentData, range]);
  const displayedLastSync = lastSyncOverrides[selectedAccount.id] ?? (currentData.lastSyncAt ? formatDateTime(currentData.lastSyncAt) : currentData.lastSync);

  const archiveReports: ReportFile[] = helperAccounts.length > 0
    ? accountHelperReports.map((report) => ({
      id: report.id,
      accountId: report.accountId,
      accountName: report.accountName,
      propertyId: report.propertyId,
      title: report.displayName || reportDisplayName(report.name),
      description: report.description,
      category: report.category,
      date: report.date,
      startDate: report.startDate,
      endDate: report.endDate,
      rows: report.rows,
      sizeKb: report.sizeKb,
      query: `${report.accountName} ${report.propertyId} ${report.category} ${report.name} ${report.displayName || ""} ${report.description || ""} ${report.status || ""}`,
      createdAt: report.createdAt,
      name: report.name,
      status: report.status,
      warnings: report.warnings,
      errors: report.errors,
      optional: report.optional,
      dashboardVisibility: report.dashboardVisibility,
      requestedDimensions: report.requestedDimensions,
      requestedMetrics: report.requestedMetrics,
      requestMetrics: report.requestMetrics,
    }))
    : currentData.reports;

  const reportDateOptions = useMemo(() => [...new Set(archiveReports.map((report) => report.date))].sort((a, b) => b.localeCompare(a)), [archiveReports]);
  const filteredArchiveReports = useMemo(
    () => filterReportsForPage(archiveReports, reportQuery, reportCategoryFilter, reportDateFilter, reportSortDirection),
    [archiveReports, reportCategoryFilter, reportDateFilter, reportQuery, reportSortDirection],
  );
  const selectedAccountSyncHistory = useMemo(
    () => helperSyncHistory.filter((entry) => entry.accountId === selectedAccount.id),
    [helperSyncHistory, selectedAccount.id],
  );
  const syncGroups = useMemo(() => {
    const historyByKey = new Map(selectedAccountSyncHistory.map((entry) => [entry.key, entry]));
    return groupReportsBySync(filteredArchiveReports).map((group) => {
      const history = historyByKey.get(group.id);
      if (!history) return group;
      return {
        ...group,
        title: formatDateTime(history.generatedAt || group.createdAt),
        createdAt: history.generatedAt || group.createdAt,
        generatedAt: history.generatedAt || group.generatedAt,
        rows: history.rows || group.rows,
        sizeKb: history.sizeKb || group.sizeKb,
        warnings: history.warnings || [],
        errors: history.errors || [],
        dataQuality: history.dataQuality || null,
        propertyMetadata: history.propertyMetadata || null,
        statusCounts: history.statusCounts || {},
      };
    });
  }, [filteredArchiveReports, selectedAccountSyncHistory]);
  const latestSyncHealth: SyncHealth | null = selectedAccountSyncHistory[0]
    ? {
      generatedAt: selectedAccountSyncHistory[0].generatedAt,
      reportCount: selectedAccountSyncHistory[0].reportCount,
      warnings: selectedAccountSyncHistory[0].warnings || [],
      errors: selectedAccountSyncHistory[0].errors || [],
      dataQuality: selectedAccountSyncHistory[0].dataQuality || null,
      propertyMetadata: selectedAccountSyncHistory[0].propertyMetadata || null,
      statusCounts: selectedAccountSyncHistory[0].statusCounts || {},
    }
    : null;
  const landingRows = useMemo(() => sortLandingPages(currentData.landingPages, landingSort), [currentData.landingPages, landingSort]);
  const topPageRows = useMemo(() => sortTopPages(currentData.topPages, pageSort), [currentData.topPages, pageSort]);

  const mainMetrics: MetricDefinition[] = useMemo(() => {
    // Önemli etkinlikler = seçili dönemin keyEvents toplamı. Bu değer trend'den
    // dilimlenir; boş-arşiv (keyEvents=0, process_success>0) fallback'i zaten
    // server'da arşiv genelinde trend'e işleniyor. Burada GLOBAL toolUsage
    // toplamına düşmek YASAK — dar aralıkta (ör. Dün) gerçek 0'ı tüm-arşiv
    // toplamıyla ezip alt-küme > üst-küme paradoksu yaratıyordu.
    const fallbackKeyEvents = currentData.kpi.conversions;
    const fallbackKeyEventTrend = currentData.trend.some((point) => point.conversions > 0) || fallbackKeyEvents === 0
      ? currentData.trend.map((point) => point.conversions)
      : currentData.trend.map((_, index, rows) => (index === rows.length - 1 ? fallbackKeyEvents : 0));
    const currentTrendValues = {
      sessions: currentData.trend.map((point) => point.sessions),
      users: currentData.trend.map((point) => point.users),
      views: currentData.trend.map((point) => point.views),
      conversions: fallbackKeyEventTrend,
    };

    return [
      {
        id: "sessions",
        label: "Oturumlar",
        description: "Bir ziyaretçinin siteye gelip kısa bir süre içinde yaptığı etkileşim grubudur.",
        kind: "count",
        current: currentData.kpi.sessions,
        previous: currentData.previousKpi.sessions,
        sparkline: currentTrendValues.sessions,
      },
      {
        id: "users",
        label: "Ziyaretçiler",
        description: "Seçili dönem boyunca siteyle etkileşime geçen tekil ziyaretçi sayısı.",
        kind: "count",
        current: currentData.kpi.users,
        previous: currentData.previousKpi.users,
        sparkline: currentTrendValues.users,
      },
      {
        id: "views",
        label: "Görüntülemeler",
        description: "Sayfa ve ekran görüntüleme toplamı.",
        kind: "count",
        current: currentData.kpi.views,
        previous: currentData.previousKpi.views,
        sparkline: currentTrendValues.views,
      },
      {
        id: "events",
        label: "Önemli etkinlikler",
        description: "Kritik kabul edilen etkinliklerin toplamı. GA4 key event metriği gecikirse process_success sayımı kullanılır.",
        kind: "count",
        current: fallbackKeyEvents,
        previous: currentData.previousKpi.conversions,
        sparkline: currentTrendValues.conversions,
      },
    ];
  }, [currentData]);

  const secondaryMetrics: MetricDefinition[] = useMemo(() => {
    // Önemli etkinlikler = seçili dönemin keyEvents toplamı. Bu değer trend'den
    // dilimlenir; boş-arşiv (keyEvents=0, process_success>0) fallback'i zaten
    // server'da arşiv genelinde trend'e işleniyor. Burada GLOBAL toolUsage
    // toplamına düşmek YASAK — dar aralıkta (ör. Dün) gerçek 0'ı tüm-arşiv
    // toplamıyla ezip alt-küme > üst-küme paradoksu yaratıyordu.
    const fallbackKeyEvents = currentData.kpi.conversions;
    const currentKeyEventRate = safeRatio(fallbackKeyEvents, currentData.kpi.sessions);
    const previousKeyEventRate = safeRatio(currentData.previousKpi.conversions, currentData.previousKpi.sessions);
    const keyEventRateSparkline = currentData.trend.some((point) => point.conversions > 0) || fallbackKeyEvents === 0
      ? currentData.trend.map((point) => safeRatio(point.conversions, point.sessions))
      : currentData.trend.map((point, index, rows) => safeRatio(index === rows.length - 1 ? fallbackKeyEvents : 0, point.sessions));
    return [
      {
        id: "newUsers",
        label: "Yeni ziyaretçiler",
        description: "Seçili dönemde ilk kez görülen ziyaretçiler.",
        kind: "count",
        current: currentData.kpi.newUsers,
        previous: currentData.previousKpi.newUsers,
        sparkline: currentData.trend.map((point) => point.newUsers ?? 0),
      },
      {
        id: "engagementRate",
        label: "Etkileşim oranı",
        description: "Etkileşimli oturumların toplam oturuma oranı.",
        kind: "percent",
        current: currentData.kpi.engagementRate,
        previous: currentData.previousKpi.engagementRate,
        sparkline: currentData.trend.map((point) => point.engagementRate),
      },
      {
        id: "averageSessionDuration",
        label: "Ort. etkileşim süresi",
        description: "Oturum başına ortalama etkileşim süresi.",
        kind: "duration",
        current: currentData.kpi.averageSessionDuration,
        previous: currentData.previousKpi.averageSessionDuration,
        sparkline: currentData.trend.map((point) => point.averageSessionDuration ?? 0),
      },
      {
        id: "keyEventRate",
        label: "Oturum başına önemli etkinlik oranı",
        description: "Önemli etkinliklerin oturum sayısına oranı.",
        kind: "ratio",
        current: currentKeyEventRate,
        previous: previousKeyEventRate,
        sparkline: keyEventRateSparkline,
      },
    ];
  }, [currentData]);

  const alignedPreviousTrend = useMemo(
    () => alignComparisonTrend(currentData.trend, currentData.previousTrend),
    [currentData.trend, currentData.previousTrend],
  );
  const trendCurrentValues = currentData.trend.map((point) => metricValueFromTrend(point, trendMetric));
  const trendPreviousValues = alignedPreviousTrend.map((point) => metricValueFromTrend(point, trendMetric));
  const trendLinePath = createLinePath(trendCurrentValues);
  const trendAreaPath = createAreaPath(trendCurrentValues);
  const previousTrendPath = createLinePath(trendPreviousValues);
  const activeTrendIndex = hoveredTrendIndex ?? Math.max(0, trendCurrentValues.length - 1);
  const activeTrendPoint = currentData.trend[activeTrendIndex];
  const activePreviousTrendPoint = alignedPreviousTrend[activeTrendIndex];
  const lowVolumeMessage = currentData.dataStatus.warning.includes(LOW_VOLUME_WARNING_TEXT)
    ? LOW_VOLUME_WARNING_TEXT
    : (
      currentData.kpi.sessions < LOW_VOLUME_SESSION_THRESHOLD || currentData.kpi.users < LOW_VOLUME_USER_THRESHOLD
        ? LOW_VOLUME_WARNING_TEXT
        : ""
    );
  const nonVolumeWarning = cleanLowVolumeWarning(currentData.dataStatus.warning);
  const isReadyForOverview = helperStatus?.ready ?? false;

  function closeSidebarOnNarrowScreen() {
    if (typeof window !== "undefined" && window.innerWidth < 1200) {
      setIsSidebarOpen(false);
    }
  }

  function handleNavigation(page: AppPage) {
    setActivePage(page);
    closeSidebarOnNarrowScreen();
  }

  async function handleSync() {
    if (!helperStatus) {
      setNotice("Analytica yardımcı servisine ulaşılamıyor. Google bağlantın silinmedi; yerel helper yeniden başlatıldığında senkronizasyon kullanılabilir olacak.");
      return;
    }

    if (!helperStatus?.ready || selectedAccount.status !== "ready") {
      setNotice("GA4 bağlantısı hazır değil. OAuth client JSON, Google izni ve hesap tanımı gerekli.");
      return;
    }

    setIsSyncing(true);
    setNotice("");
    try {
      const response = await fetch(`${HELPER_URL}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Her zaman geniş bir pencere (son 60 gün + bugün) senkronla. Gösterilen
        // aralık (Bugün/Dün/7 Gün/30 Gün) yalnızca frontend filtresidir; bkz.
        // dataForRange. 60 gün, "30 Gün" görünümünün gerçek bir önceki-30-gün
        // ile karşılaştırılabilmesi için gerekli. Seçili dar aralıkla sync etmek
        // tek-günlük bir arşiv üretip dashboard'u sıfırlıyordu (örn. "Bugün" → 0).
        body: JSON.stringify({ accountId: selectedAccount.id, startDate: "60daysAgo", endDate: "today" }),
      });
      const payload = await response.json() as { ok: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Senkronizasyon başarısız.");
      await refreshHelperState();
      setLastSyncOverrides((current) => ({ ...current, [selectedAccount.id]: formatSyncTimestamp(new Date()) }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Senkronizasyon başarısız.");
    } finally {
      setIsSyncing(false);
    }
  }

  function exportReport(report: ReportFile) {
    const real = accountHelperReports.find((item) => item.id === report.id);
    if (real) {
      window.location.href = `${HELPER_URL}/api/export?id=${encodeURIComponent(real.id)}`;
      return;
    }
    downloadText(report.name || report.title, csvForReport(report));
  }

  function exportBundle(date?: string) {
    if (helperAccounts.length > 0) {
      const params = new URLSearchParams({ accountId: selectedAccount.id });
      if (date) params.set("date", date);
      window.location.href = `${HELPER_URL}/api/export-bundle?${params.toString()}`;
      return;
    }
    downloadText(`${selectedAccount.id}-${range}-manifest.csv`, filteredArchiveReports.map(csvForReport).join("\n"));
  }

  async function saveConfig(
    nextAccounts = helperConfig?.accounts ?? [],
    options: { stayInSettings?: boolean; oauthClientJson?: unknown } = {},
  ) {
    setIsSavingConfig(true);
    setNotice("");
    try {
      const response = await fetch(`${HELPER_URL}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oauthClientPath, oauthClientJson: options.oauthClientJson, accounts: nextAccounts }),
      });
      const payload = await response.json() as { ok: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Ayarlar kaydedilemedi.");
      await refreshHelperState();
      if (!options.stayInSettings) setActivePage("overview");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ayarlar kaydedilemedi.");
    } finally {
      setIsSavingConfig(false);
    }
  }

  async function addAccount() {
    const id = accountDraft.id.trim();
    const name = accountDraft.name.trim();
    const propertyId = accountDraft.propertyId.trim();
    if (!id || !name || !propertyId) {
      setNotice("Hesap için id, ad ve property ID gerekli.");
      return;
    }

    const current = helperConfig?.accounts ?? [];
    const nextAccount = { ...accountDraft, id, name, propertyId, siteUrl: accountDraft.siteUrl?.trim() };
    const nextAccounts = [...current.filter((account) => account.id !== id), nextAccount];
    await saveConfig(nextAccounts, { stayInSettings: true });
    setAccountDraft({ id: "", name: "", propertyId: "", siteUrl: "" });
  }

  async function removeAccount(accountId: string) {
    const nextAccounts = (helperConfig?.accounts ?? []).filter((account) => account.id !== accountId);
    await saveConfig(nextAccounts, { stayInSettings: true });
  }

  function startOAuth() {
    const returnTo = `${window.location.origin}${window.location.pathname}`;
    window.location.href = `${HELPER_URL}/api/auth/start?returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function importOAuthClientFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      await saveConfig(helperConfig?.accounts ?? [], { stayInSettings: true, oauthClientJson: parsed });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "OAuth client JSON okunamadı.");
    }
  }

  async function handleOAuthFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await importOAuthClientFile(file);
  }

  function toggleSyncGroup(groupId: string) {
    setOpenSyncGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }

  return (
    <main className={`analytica-shell ${isSidebarOpen ? "is-sidebar-open" : ""}`}>
      {isSidebarOpen ? <button type="button" className="sidebar-backdrop" aria-label="Menüyü kapat" onClick={() => setIsSidebarOpen(false)} /> : null}
      <aside className="sidebar">
        <div className="sidebar__brand">
          <img className="sidebar__logo" src={`${import.meta.env.BASE_URL}assets/analytica-logo.svg`} alt="Analytica" />
        </div>

        <nav className="sidebar__nav" aria-label="Ana gezinme">
          {MAIN_NAV.map((item) => (
            <button
              key={item.page}
              type="button"
              className={`sidebar__nav-item ${activePage === item.page ? "is-active" : ""}`}
              onClick={() => handleNavigation(item.page)}
            >
              <span className="sidebar__nav-icon">
                <AppIcon name={item.icon} />
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <section className="sidebar__workspace">
          <div className="sidebar__section-heading">
            <span>Workspace</span>
          </div>
          <div className="workspace-list">
            {effectiveAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className={`workspace-card ${selectedAccount.id === account.id ? "is-active" : ""}`}
                onClick={() => {
                  setSelectedAccountId(account.id);
                  if (account.status === "needs-setup") {
                    handleNavigation("settings");
                    return;
                  }
                  closeSidebarOnNarrowScreen();
                }}
              >
                <div className="workspace-card__header">
                  <strong>{account.name}</strong>
                  <span className={`workspace-card__state ${account.status === "ready" ? "is-ready" : "is-pending"}`}>
                    {account.status === "ready" ? "Hazır" : "Kurulum"}
                  </span>
                </div>
                <span>{account.propertyId}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="sidebar__status">
          <span>Bağlantı durumu</span>
          <strong>{helperStatus?.authorized ? "Google Analytics bağlı" : "Yetki bekleniyor"}</strong>
          <small>{helperStatus?.accountCount ?? effectiveAccounts.length} property görünüyor</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar__title">
            <button type="button" className="sidebar-toggle" onClick={() => setIsSidebarOpen((current) => !current)}>
              Menü
            </button>
            <h1>{selectedAccount.name}</h1>
            <div className="topbar__submeta">
              <span className="topbar__property-id">{selectedAccount.propertyId}</span>
              <span className="topbar__sync-meta">
                <span>Son senkronizasyon</span>
                <strong>{displayedLastSync}</strong>
              </span>
            </div>
          </div>

          {activePage !== "settings" ? (
            <div className="topbar__controls">
              <div className="topbar__actions">
                <button type="button" className="button button--primary" onClick={() => void handleSync()} disabled={!isReadyForOverview || isSyncing}>
                  {isSyncing ? "Güncelleniyor..." : "Verileri Güncelle"}
                </button>
              </div>
              <div className="topbar__control-row">
                <div className="range-switcher" aria-label="Tarih aralığı">
                  {ranges.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={range === item.key ? "is-active" : ""}
                      onClick={() => setRange(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className={`compare-toggle ${compareEnabled ? "is-active" : ""}`}
                  role="switch"
                  aria-checked={compareEnabled}
                  onClick={() => setCompareEnabled((current) => !current)}
                >
                  <span className="compare-toggle__knob" aria-hidden="true" />
                  Önceki dönemle karşılaştır
                </button>
              </div>
            </div>
          ) : (
            <div className="topbar__actions">
              <button type="button" className="button button--secondary" onClick={() => handleNavigation("overview")}>
                Genel Bakışa Dön
              </button>
            </div>
          )}
        </header>

        {notice ? (
          <div className={`notice ${notice.includes("başarısız") || notice.includes("tamamlanamadı") ? "is-error" : "is-info"}`}>
            {notice}
          </div>
        ) : null}

        {activePage === "overview" ? (
          <OverviewPage
            account={selectedAccount}
            data={currentData}
            latestSyncHealth={latestSyncHealth}
            isLoading={isLoading}
            compareEnabled={compareEnabled}
            currentRangeLabel={rangeLabel(range)}
            hoveredTrendIndex={hoveredTrendIndex}
            lowVolumeMessage={lowVolumeMessage}
            nonVolumeWarning={nonVolumeWarning}
            trendMetric={trendMetric}
            onHoverTrendIndex={setHoveredTrendIndex}
            onTrendMetricChange={setTrendMetric}
            onOpenReports={() => handleNavigation("reports")}
            onOpenSettings={() => handleNavigation("settings")}
            landingRows={landingRows}
            topPageRows={topPageRows}
            landingSort={landingSort}
            pageSort={pageSort}
            setLandingSort={setLandingSort}
            setPageSort={setPageSort}
            mainMetrics={mainMetrics}
            secondaryMetrics={secondaryMetrics}
            trendLinePath={trendLinePath}
            trendAreaPath={trendAreaPath}
            previousTrendPath={previousTrendPath}
            activeTrendPoint={activeTrendPoint}
            activePreviousTrendPoint={activePreviousTrendPoint}
          />
        ) : null}

        {activePage === "reports" ? (
          <ReportsPage
            isLoading={isLoading}
            filteredReports={filteredArchiveReports}
            reportDateOptions={reportDateOptions}
            reportQuery={reportQuery}
            reportCategoryFilter={reportCategoryFilter}
            reportDateFilter={reportDateFilter}
            reportSortDirection={reportSortDirection}
            syncGroups={syncGroups}
            openSyncGroups={openSyncGroups}
            onReportQueryChange={setReportQuery}
            onCategoryFilterChange={setReportCategoryFilter}
            onDateFilterChange={setReportDateFilter}
            onSortDirectionChange={setReportSortDirection}
            onToggleSyncGroup={toggleSyncGroup}
            onExportBundle={exportBundle}
            onExportReport={exportReport}
          />
        ) : null}

        {activePage === "settings" ? (
          <SettingsPage
            helperStatus={helperStatus}
            helperConfig={helperConfig}
            oauthClientPath={oauthClientPath}
            oauthFileInputRef={oauthFileInputRef}
            isSavingConfig={isSavingConfig}
            accountDraft={accountDraft}
            onOauthClientPathChange={setOauthClientPath}
            onHandleOAuthFileSelected={handleOAuthFileSelected}
            onOpenFilePicker={() => oauthFileInputRef.current?.click()}
            onSaveConfig={() => void saveConfig()}
            onStartOAuth={startOAuth}
            onAccountDraftChange={setAccountDraft}
            onAddAccount={() => void addAccount()}
            onRemoveAccount={(accountId) => void removeAccount(accountId)}
          />
        ) : null}
      </section>
    </main>
  );
}

function OverviewPage(props: {
  account: AnalyticsAccount;
  data: AccountData;
  latestSyncHealth: SyncHealth | null;
  isLoading: boolean;
  compareEnabled: boolean;
  currentRangeLabel: string;
  hoveredTrendIndex: number | null;
  lowVolumeMessage: string;
  nonVolumeWarning: string;
  trendMetric: TrendMetricKey;
  onHoverTrendIndex: (index: number | null) => void;
  onTrendMetricChange: (metric: TrendMetricKey) => void;
  onOpenReports: () => void;
  onOpenSettings: () => void;
  landingRows: LandingPagePoint[];
  topPageRows: TopPagePoint[];
  landingSort: TableSortState;
  pageSort: TableSortState;
  setLandingSort: (sort: TableSortState) => void;
  setPageSort: (sort: TableSortState) => void;
  mainMetrics: MetricDefinition[];
  secondaryMetrics: MetricDefinition[];
  trendLinePath: string;
  trendAreaPath: string;
  previousTrendPath: string;
  activeTrendPoint?: TrendPoint;
  activePreviousTrendPoint?: TrendPoint;
}) {
  const {
    data,
    latestSyncHealth,
    isLoading,
    compareEnabled,
    currentRangeLabel,
    hoveredTrendIndex,
    lowVolumeMessage,
    nonVolumeWarning,
    trendMetric,
    onHoverTrendIndex,
    onTrendMetricChange,
    onOpenReports,
    onOpenSettings,
    landingRows,
    topPageRows,
    landingSort,
    pageSort,
    setLandingSort,
    setPageSort,
    mainMetrics,
    secondaryMetrics,
    trendLinePath,
    trendAreaPath,
    previousTrendPath,
    activeTrendPoint,
    activePreviousTrendPoint,
  } = props;
  const trendCurrentTotal = metricTotalFromKpi(data.kpi, trendMetric);
  const trendPreviousTotal = metricTotalFromKpi(data.previousKpi, trendMetric);

  if (isLoading) {
    return <LoadingDashboard />;
  }

  return (
    <div className="page-stack">
      {lowVolumeMessage ? <div className="inline-alert"><span aria-hidden="true">i</span>{lowVolumeMessage}</div> : null}

      <section className="kpi-grid">
        {mainMetrics.map((metric) => (
          <MetricCard
            key={metric.id}
            metric={metric}
            compareEnabled={compareEnabled}
            featured={metric.id === "sessions"}
            onOpenSettings={onOpenSettings}
          />
        ))}
      </section>

      <section className="mini-metric-grid">
        {secondaryMetrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} compareEnabled={compareEnabled} compact onOpenSettings={onOpenSettings} />
        ))}
      </section>

      <section className="dashboard-grid dashboard-grid--primary">
        <article className="panel panel--chart">
          <div className="panel__header">
            <div>
              <h2>Performans akışı</h2>
            </div>
            <div className="metric-switcher">
              {TREND_METRICS.map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  className={trendMetric === metric.key ? "is-active" : ""}
                  onClick={() => onTrendMetricChange(metric.key)}
                >
                  {metric.label}
                </button>
              ))}
            </div>
          </div>

          <div className="trend-summary">
            <div>
              <span>Toplam</span>
              <strong>{formatNumber(trendCurrentTotal)}</strong>
            </div>
            <div>
              <span>Önceki dönem</span>
              <strong>{compareEnabled ? formatNumber(trendPreviousTotal) : "Kapalı"}</strong>
            </div>
          </div>

          <div className="trend-chart" role="img" aria-label={`${TREND_METRICS.find((item) => item.key === trendMetric)?.label} trendi`}>
            <svg viewBox="0 0 640 280" preserveAspectRatio="none">
              <defs>
                <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(227, 115, 0, 0.15)" />
                  <stop offset="100%" stopColor="rgba(227, 115, 0, 0.02)" />
                </linearGradient>
              </defs>
              <path className="trend-chart__area" d={trendAreaPath} />
              {compareEnabled && previousTrendPath ? <path className="trend-chart__line trend-chart__line--comparison" d={previousTrendPath} /> : null}
              <path className="trend-chart__line" d={trendLinePath} />
            </svg>

            {activeTrendPoint ? (
              <div className="trend-tooltip" aria-live="polite">
                <strong>{activeTrendPoint.date}</strong>
                <span>{TREND_METRICS.find((item) => item.key === trendMetric)?.label}: {formatNumber(metricValueFromTrend(activeTrendPoint, trendMetric))}</span>
                {compareEnabled && activePreviousTrendPoint ? (
                  <span>Önceki dönem: {formatNumber(metricValueFromTrend(activePreviousTrendPoint, trendMetric))}</span>
                ) : null}
              </div>
            ) : null}

            <div className="trend-chart__overlay">
              {data.trend.map((point, index) => (
                <button
                  key={`${point.date}-${index}`}
                  type="button"
                  className={`trend-chart__hitbox ${hoveredTrendIndex === index ? "is-active" : ""}`}
                  onMouseEnter={() => onHoverTrendIndex(index)}
                  onMouseLeave={() => onHoverTrendIndex(null)}
                  onFocus={() => onHoverTrendIndex(index)}
                  onBlur={() => onHoverTrendIndex(null)}
                  aria-label={`${point.date} ${formatCompactNumber(metricValueFromTrend(point, trendMetric))}`}
                />
              ))}
            </div>
          </div>

          <div className="trend-footer">
            {data.trend.map((point, index) => (
              <div key={`${point.date}-${index}`} className={`trend-footer__item ${hoveredTrendIndex === index ? "is-active" : ""}`}>
                <strong>{point.date}</strong>
                <span>{formatCompactNumber(metricValueFromTrend(point, trendMetric))}</span>
              </div>
            ))}
          </div>
        </article>

        <div className="dashboard-support-grid">
          <DataStatusCard
            dataStatus={data.dataStatus}
            lastSyncAt={data.lastSyncAt}
            rangeLabel={currentRangeLabel}
            syncHealth={latestSyncHealth}
            warning={nonVolumeWarning}
          />
          <ChannelsCard channels={data.channels} onOpenReports={onOpenReports} />
          <TrafficDetailsCard details={data.trafficDetails} />
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid--secondary">
        <TableCard
          title="En iyi açılış sayfaları"
          subtitle="İlk etkileşim noktaları"
          headers={[
            { key: "path", label: "Sayfa" },
            { key: "sessions", label: "Oturum", numeric: true },
            { key: "engagementRate", label: "Etkileşim oranı", numeric: true },
            { key: "averageSessionDuration", label: "Ort. etkileşim süresi", numeric: true },
            { key: "conversions", label: "Önemli etkinlik", numeric: true },
          ]}
          rows={landingRows}
          sort={landingSort}
          onSortChange={(key) => setLandingSort(toggleSort(landingSort, key))}
          renderCells={(row) => [
            <TablePageCell key="path" title={row.title || row.path} path={row.path} />,
            <span className="table-number">{formatNumber(row.sessions)}</span>,
            <span className="table-number">{formatPercent(row.engagementRate)}</span>,
            <span className="table-number">{formatDuration(row.averageSessionDuration)}</span>,
            <span className="table-number">{formatNumber(row.conversions)}</span>,
          ]}
        />

        <TableCard
          title="En çok görüntülenen sayfalar"
          subtitle="Sayfa bazlı ilgi yoğunluğu"
          headers={[
            { key: "title", label: "Sayfa" },
            { key: "views", label: "Görüntüleme", numeric: true },
            { key: "users", label: "Ziyaretçi", numeric: true },
            { key: "viewsPerUser", label: "Görüntüleme / ziyaretçi", numeric: true, description: "Bir ziyaretçinin ortalama kaç görüntüleme ürettiğini gösterir." },
            { key: "averageSessionDuration", label: "Ort. etkileşim süresi", numeric: true },
          ]}
          rows={topPageRows}
          sort={pageSort}
          onSortChange={(key) => setPageSort(toggleSort(pageSort, key))}
          renderCells={(row) => [
            <TablePageCell key="title" title={row.title} path={row.path} />,
            <span className="table-number">{formatNumber(row.views)}</span>,
            <span className="table-number">{formatNumber(row.users)}</span>,
            <span className="table-number">{row.viewsPerUser.toFixed(2)}</span>,
            <span className="table-number">{formatDuration(row.averageSessionDuration)}</span>,
          ]}
        />
      </section>

      <section className="dashboard-grid dashboard-grid--tertiary">
        <ToolUsageCard toolUsage={data.toolUsage} onOpenSettings={onOpenSettings} />

        <article className="panel settings-panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Raporlar</span>
              <h2>Son oluşturulanlar</h2>
            </div>
            <button type="button" className="button button--secondary" onClick={onOpenReports}>
              Tüm raporları gör
            </button>
          </div>

          <div className="report-preview-list">
            {data.recentReports.length > 0 ? data.recentReports.map((report) => (
              <div key={report.id} className="report-preview-row">
                <div className="report-row__content">
                  <strong>{report.displayName || reportDisplayName(report.name)}</strong>
                  <span>{reportMetaLine({ ...report, title: report.displayName || reportDisplayName(report.name) })}</span>
                </div>
                <span>{formatDateTime(report.createdAt || `${report.date}T00:00:00Z`)}</span>
              </div>
            )) : <EmptyState message="Henüz rapor üretilmedi." />}
          </div>
        </article>
      </section>
    </div>
  );
}

function ReportsPage(props: {
  isLoading: boolean;
  filteredReports: ReportFile[];
  reportDateOptions: string[];
  reportQuery: string;
  reportCategoryFilter: string;
  reportDateFilter: string;
  reportSortDirection: SortDirection;
  syncGroups: SyncGroup[];
  openSyncGroups: Record<string, boolean>;
  onReportQueryChange: (value: string) => void;
  onCategoryFilterChange: (value: string) => void;
  onDateFilterChange: (value: string) => void;
  onSortDirectionChange: (value: SortDirection) => void;
  onToggleSyncGroup: (groupId: string) => void;
  onExportBundle: (date?: string) => void;
  onExportReport: (report: ReportFile) => void;
}) {
  const {
    isLoading,
    filteredReports,
    reportDateOptions,
    reportQuery,
    reportCategoryFilter,
    reportDateFilter,
    reportSortDirection,
    syncGroups,
    openSyncGroups,
    onReportQueryChange,
    onCategoryFilterChange,
    onDateFilterChange,
    onSortDirectionChange,
    onToggleSyncGroup,
    onExportBundle,
    onExportReport,
  } = props;
  const latestGroup = syncGroups[0];

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel__header">
          <div>
            <span className="panel__eyebrow">Rapor arşivi</span>
            <h2>Raporlar</h2>
          </div>
          <button type="button" className="button button--primary" onClick={() => onExportBundle()}>
            Toplu indir
          </button>
        </div>

        <div className="filters-grid">
          <label className="field">
            <span>Arama</span>
            <input value={reportQuery} onChange={(event) => onReportQueryChange(event.target.value)} placeholder="Rapor ara" />
          </label>

          <label className="field">
            <span>Rapor türü</span>
            <select value={reportCategoryFilter} onChange={(event) => onCategoryFilterChange(event.target.value)}>
              <option value="all">Tümü</option>
              {Object.entries(categoryLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Tarih</span>
            <select value={reportDateFilter} onChange={(event) => onDateFilterChange(event.target.value)}>
              <option value="all">Tümü</option>
              {reportDateOptions.map((date) => (
                <option key={date} value={date}>{formatDateOnly(date)}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Sıralama</span>
            <select value={reportSortDirection} onChange={(event) => onSortDirectionChange(event.target.value as SortDirection)}>
              <option value="desc">En yeni</option>
              <option value="asc">En eski</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <span className="panel__eyebrow">Özet</span>
            <h2>En son oluşturulanlar</h2>
          </div>
          <span className="panel__meta">{syncGroups.length} senkronizasyon</span>
        </div>

        {latestGroup ? (
          <div className="reports-overview-strip">
            <div className="sync-health-pill">
              <span>Son sync</span>
              <strong>{formatDateTime(latestGroup.generatedAt || latestGroup.createdAt)}</strong>
            </div>
            <div className="sync-health-pill">
              <span>İçerik</span>
              <strong>{formatSyncMetaLine(latestGroup)}</strong>
            </div>
            <div className="sync-health-pill">
              <span>Durum</span>
              <strong>{formatStatusCounts(latestGroup.statusCounts) || "Özet yok"}</strong>
            </div>
          </div>
        ) : null}

        {isLoading ? <LoadingRows /> : (
          <div className="report-preview-list">
            {filteredReports.slice(0, 4).map((report) => (
              <div key={report.id} className="report-preview-row">
                <div className="report-row__content">
                  <strong>{report.title}</strong>
                  {report.description ? <small>{report.description}</small> : null}
                  <span>{reportMetaLine(report)}</span>
                  {reportStatusMeta(report) ? (
                    <div className="report-row__meta">
                      <span className={`info-badge info-badge--${reportStatusMeta(report)?.tone}`}>{reportStatusMeta(report)?.label}</span>
                    </div>
                  ) : null}
                  {reportStatusDetail(report) ? <small className="report-row__status">{reportStatusDetail(report)}</small> : null}
                </div>
                <button type="button" className="button button--secondary" onClick={() => onExportReport(report)}>
                  İndir
                </button>
              </div>
            ))}
            {filteredReports.length === 0 ? <EmptyState message="Filtrelerle eşleşen rapor bulunamadı." /> : null}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <span className="panel__eyebrow">Senkronizasyon geçmişi</span>
            <h2>Arşivlenmiş senkronizasyonlar</h2>
          </div>
        </div>

        {isLoading ? <LoadingRows /> : (
          <div className="sync-group-list">
            {syncGroups.length > 0 ? syncGroups.map((group) => {
              const isOpen = openSyncGroups[group.id] ?? false;
              return (
                <article key={group.id} className="sync-group">
                  <div className="sync-group__header">
                    <div>
                      <strong>{group.title}</strong>
                      <span>{formatSyncMetaLine(group)}</span>
                    </div>
                    <div className="sync-group__actions">
                      <button type="button" className="button button--secondary" onClick={() => onExportBundle(group.date)}>
                        ZIP indir
                      </button>
                      <button
                        type="button"
                        className="button button--secondary sync-group__toggle"
                        aria-expanded={isOpen}
                        onClick={() => onToggleSyncGroup(group.id)}
                      >
                        {isOpen ? "Detayları gizle" : "Detayları aç"}
                      </button>
                    </div>
                  </div>

                  {formatStatusCounts(group.statusCounts) ? (
                    <div className="sync-group__summary">{formatStatusCounts(group.statusCounts)}</div>
                  ) : null}

                  {group.errors[0] ? (
                    <div className="status-note is-error">{group.errors[0]}</div>
                  ) : null}

                  {!group.errors[0] && group.warnings[0] ? (
                    <div className="status-note is-warning">{group.warnings[0]}</div>
                  ) : null}

                  {isOpen ? (
                    <div className="sync-group__body">
                      <div className="sync-group__meta-grid">
                        <div className="sync-meta-card">
                          <span>Üretilme zamanı</span>
                          <strong>{formatDateTime(group.generatedAt || group.createdAt)}</strong>
                        </div>
                        <div className="sync-meta-card">
                          <span>Sampling</span>
                          <strong>{group.dataQuality?.sampling ? "Tespit edildi" : "Görünmüyor"}</strong>
                        </div>
                        <div className="sync-meta-card">
                          <span>Thresholding</span>
                          <strong>{group.dataQuality?.thresholding ? "Tespit edildi" : "Görünmüyor"}</strong>
                        </div>
                        <div className="sync-meta-card">
                          <span>Metadata kaynağı</span>
                          <strong>{group.propertyMetadata?.source === "cache" ? "Cache" : group.propertyMetadata?.source === "cache-fallback" ? "Cache fallback" : "Canlı"}</strong>
                        </div>
                      </div>

                      {group.reports.map((report) => (
                        <div key={report.id} className="report-row">
                          <div className="report-row__content">
                            <strong>{report.title}</strong>
                            {report.description ? <small>{report.description}</small> : null}
                            <span>{reportMetaLine(report)}</span>
                            {reportStatusMeta(report) ? (
                              <div className="report-row__meta">
                                <span className={`info-badge info-badge--${reportStatusMeta(report)?.tone}`}>{reportStatusMeta(report)?.label}</span>
                              </div>
                            ) : null}
                            {reportStatusDetail(report) ? <small className="report-row__status">{reportStatusDetail(report)}</small> : null}
                          </div>
                          <button type="button" className="button button--secondary" onClick={() => onExportReport(report)}>
                            İndir
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            }) : <EmptyState message="Henüz senkronizasyon geçmişi yok." />}
          </div>
        )}
      </section>
    </div>
  );
}

function SettingsPage(props: {
  helperStatus: HelperStatus | null;
  helperConfig: HelperConfigResponse["config"] | null;
  oauthClientPath: string;
  oauthFileInputRef: RefObject<HTMLInputElement>;
  isSavingConfig: boolean;
  accountDraft: HelperAccountConfig;
  onOauthClientPathChange: (value: string) => void;
  onHandleOAuthFileSelected: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onOpenFilePicker: () => void;
  onSaveConfig: () => void;
  onStartOAuth: () => void;
  onAccountDraftChange: (next: HelperAccountConfig | ((current: HelperAccountConfig) => HelperAccountConfig)) => void;
  onAddAccount: () => void;
  onRemoveAccount: (accountId: string) => void;
}) {
  const {
    helperStatus,
    helperConfig,
    oauthClientPath,
    oauthFileInputRef,
    isSavingConfig,
    accountDraft,
    onOauthClientPathChange,
    onHandleOAuthFileSelected,
    onOpenFilePicker,
    onSaveConfig,
    onStartOAuth,
    onAccountDraftChange,
    onAddAccount,
    onRemoveAccount,
  } = props;

  return (
    <div className="page-stack">
      <section className="settings-grid">
        <article className="panel settings-panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Bağlantı</span>
              <h2>OAuth ve helper ayarları</h2>
            </div>
            <button type="button" className="button button--secondary" onClick={onSaveConfig} disabled={isSavingConfig}>
              Kaydet
            </button>
          </div>

          <div className="status-grid">
            <StatusTile label="OAuth client" value={helperStatus?.oauthClientExists ? "Hazır" : "Bekleniyor"} detail={helperStatus?.dataDir ?? "ga-report-bridge-server/.data"} />
            <StatusTile label="Google izni" value={helperStatus?.authorized ? "Bağlı" : "Bekleniyor"} detail={helperStatus?.tokenPath ?? "ga-report-bridge-server/.data/oauth-token.json"} />
            <StatusTile label="Hesap sayısı" value={String(helperStatus?.accountCount ?? 0)} detail="Birden fazla property ekleyebilirsin." />
          </div>

          <label className="field">
            <span>OAuth client JSON yolu</span>
            <div className="inline-field">
              <input value={oauthClientPath} onChange={(event) => onOauthClientPathChange(event.target.value)} placeholder="/Users/.../google-oauth-client.json" />
              <button type="button" className="button button--secondary" onClick={onOpenFilePicker}>
                JSON seç
              </button>
              <input
                ref={oauthFileInputRef}
                className="hidden-file-input"
                type="file"
                accept=".json,application/json"
                onChange={(event) => void onHandleOAuthFileSelected(event)}
              />
            </div>
          </label>

          <div className="notice-card">
            <div>
              <strong>Google bağlantısı</strong>
              <p>İlk yetkilendirme sonrası token yerelde tutulur ve sync akışı tekrar giriş istemez.</p>
            </div>
            <button type="button" className="button button--primary" onClick={onStartOAuth} disabled={!oauthClientPath || isSavingConfig}>
              {helperStatus?.authorized ? "Yetkiyi yenile" : "Google ile bağlan"}
            </button>
          </div>
        </article>

        <article className="panel settings-panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">Property listesi</span>
              <h2>Workspace ayarları</h2>
            </div>
          </div>

          <div className="settings-subsection">
            <div className="settings-form-grid">
              <label className="field">
                <span>ID</span>
                <input value={accountDraft.id} onChange={(event) => onAccountDraftChange((current) => ({ ...current, id: event.target.value }))} placeholder="miniapps" />
              </label>
              <label className="field">
                <span>Ad</span>
                <input value={accountDraft.name} onChange={(event) => onAccountDraftChange((current) => ({ ...current, name: event.target.value }))} placeholder="miniapps.tr" />
              </label>
              <label className="field">
                <span>Property ID</span>
                <input value={accountDraft.propertyId} onChange={(event) => onAccountDraftChange((current) => ({ ...current, propertyId: event.target.value }))} placeholder="123456789" />
              </label>
              <label className="field">
                <span>Site</span>
                <input value={accountDraft.siteUrl} onChange={(event) => onAccountDraftChange((current) => ({ ...current, siteUrl: event.target.value }))} placeholder="miniapps.tr" />
              </label>
            </div>

            <div className="settings-actions">
              <button type="button" className="button button--primary" onClick={onAddAccount} disabled={isSavingConfig}>
                Hesap ekle
              </button>
            </div>
          </div>
        </article>

        <article className="panel settings-panel settings-panel--compact">
          <div className="panel__header">
            <div>
              <h2>Kayıtlı property</h2>
            </div>
            <span className="panel__meta">{helperConfig?.accounts.length ?? 0} kayıt</span>
          </div>

          <div className="configured-list">
            {(helperConfig?.accounts ?? []).length > 0 ? (helperConfig?.accounts ?? []).map((account) => (
              <div key={account.id} className="configured-row">
                <div>
                  <strong>{account.name}</strong>
                  <span>{account.propertyId} · {account.siteUrl || account.id}</span>
                </div>
                <button type="button" className="button button--secondary" onClick={() => onRemoveAccount(account.id)} disabled={isSavingConfig}>
                  Sil
                </button>
              </div>
            )) : <EmptyState message="Henüz Analytics hesabı eklenmedi." compact />}
          </div>
        </article>
      </section>
    </div>
  );
}

function MetricCard({ metric, compareEnabled, featured = false, compact = false, onOpenSettings }: { metric: MetricDefinition; compareEnabled: boolean; featured?: boolean; compact?: boolean; onOpenSettings: () => void }) {
  const delta = buildMetricDelta(metric.current, metric.previous, metric.kind);
  const sparkline = createSparkline(metric.sparkline);
  const sparklineEndPoint = createSparklineEndPoint(metric.sparkline);
  const hasValue = metric.current > 0;
  const displayValue = metric.kind === "percent" || metric.kind === "ratio"
    ? formatPercent(metric.current)
    : metric.kind === "duration"
      ? formatDuration(metric.current)
      : formatNumber(metric.current);
  const showEventEmptyState = metric.id === "events" && !hasValue;

  return (
	    <article className={`metric-card ${featured ? "is-featured" : ""} ${compact ? "is-compact" : ""}`}>
	      <div className="metric-card__header">
	        <span className="metric-card__label">
	          <span className="metric-card__icon">
	            <AppIcon name={metric.id as AppIconName} />
	          </span>
	          {metric.label}
	        </span>
	        <button type="button" className="info-badge" data-tooltip={metric.description} aria-label={metric.description}>i</button>
	      </div>
      <strong>{displayValue}</strong>
      {showEventEmptyState ? (
        <div className="metric-empty-state">
          <span>Henüz önemli etkinlik tanımlı değil.</span>
          <button type="button" onClick={onOpenSettings}>Kurulumu görüntüle</button>
        </div>
      ) : sparkline ? (
        <svg className="sparkline" viewBox="0 0 120 30" aria-hidden="true">
          <path d={sparkline} />
          {sparklineEndPoint ? <circle cx={sparklineEndPoint.x} cy={sparklineEndPoint.y} r="2.6" /> : null}
        </svg>
      ) : null}
      {compareEnabled ? (
        <div className="metric-card__footer">
          <em className={`metric-delta metric-delta--${delta.tone}`}><span>{delta.symbol}</span>{delta.label}</em>
          <small>{delta.detail}</small>
        </div>
      ) : null}
    </article>
  );
}

function DataStatusCard(props: {
  dataStatus: DataStatus;
  lastSyncAt: string;
  rangeLabel: string;
  syncHealth: SyncHealth | null;
  warning: string;
}) {
  const { dataStatus, lastSyncAt, rangeLabel, syncHealth, warning } = props;
  const readyReports = syncHealth?.statusCounts.ok || syncHealth?.reportCount || 0;
  const rows = [
    { label: "Son senkronizasyon", value: lastSyncAt ? formatDateTime(lastSyncAt) : "Bekleniyor" },
    { label: "Hazır rapor", value: `${readyReports} rapor` },
    { label: "Sampling", value: samplingLabel(Boolean(syncHealth?.dataQuality?.sampling)) },
    { label: "Thresholding", value: thresholdingLabel(Boolean(syncHealth?.dataQuality?.thresholding)) },
    { label: "Metadata", value: metadataSourceLabel(syncHealth?.propertyMetadata?.source) },
    { label: "Property saat dilimi", value: dataStatus.timezone },
  ];
  const quota = syncHealth?.dataQuality?.quota as Record<string, { remaining?: number }> | null | undefined;
  const detailRows = [
    { label: "Tarih aralığı", value: rangeLabel },
    { label: "Veri güncelliği", value: normalizeFreshnessLabel(dataStatus.freshness) },
    { label: "Metadata alınma zamanı", value: syncHealth?.propertyMetadata?.fetchedAt ? formatDateTime(syncHealth.propertyMetadata.fetchedAt) : "Bilinmiyor" },
    { label: "Günlük quota kalan", value: typeof quota?.tokensPerDay?.remaining === "number" ? formatNumber(quota.tokensPerDay.remaining) : "" },
    { label: "Saatlik quota kalan", value: typeof quota?.tokensPerHour?.remaining === "number" ? formatNumber(quota.tokensPerHour.remaining) : "" },
  ].filter((row) => row.value);

  return (
    <article className="panel data-status">
      <div className="panel__header">
        <div>
          <h2>Veri durumu</h2>
        </div>
      </div>

      <div className="status-list">
        {rows.map((row) => (
          <div key={row.label} className="status-list__row">
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>

      {detailRows.length > 0 ? (
        <details className="status-details">
          <summary>Detayları göster</summary>
          <div className="status-details__grid">
            {detailRows.map((row) => (
              <div key={row.label} className="sync-meta-card">
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {warning ? <div className="status-note is-warning">{warning}</div> : null}
      {syncHealth?.errors[0] || dataStatus.error ? <div className="status-note is-error">{syncHealth?.errors[0] || dataStatus.error}</div> : null}
    </article>
  );
}

function ChannelsCard({ channels, onOpenReports }: { channels: ChannelPoint[]; onOpenReports: () => void }) {
  const visibleChannels = channels.slice(0, 5);

  return (
    <article className="panel">
      <div className="panel__header">
        <div>
          <span className="panel__eyebrow">Trafik kanalları</span>
          <h2>Kanal kırılımı</h2>
        </div>
        <button type="button" className="button button--secondary" onClick={onOpenReports}>
          Tümünü gör
        </button>
      </div>

      <div className="channel-list">
        {visibleChannels.length > 0 ? visibleChannels.map((channel) => (
          <div key={channel.name} className="channel-row">
            <div className="channel-row__meta">
              <strong>{channel.name}</strong>
              <span>{formatNumber(channel.sessions)} oturum</span>
            </div>
            <div className="channel-row__stats">
              <span>{formatPercent(channel.share)}</span>
              <span>{formatPercent(channel.engagementRate)} etkileşim</span>
              <em className={`metric-delta metric-delta--${channel.change === 0 ? "neutral" : channel.change > 0 ? "positive" : "negative"}`}>
                {channel.previousSessions === 0 && channel.sessions > 0 ? "Yeni" : formatSignedPercent(channel.change)}
              </em>
            </div>
            <div className="channel-row__bar">
              <i style={{ width: `${Math.max(6, channel.share * 100)}%` }} />
            </div>
          </div>
        )) : <EmptyState message="Kanal verisi henüz oluşmadı." compact />}
      </div>
    </article>
  );
}

function TrafficDetailsCard({ details }: { details: TrafficDetails }) {
  return (
    <article className="panel traffic-details">
      <div className="panel__header">
        <div>
          <h2>Trafik ayrıntıları</h2>
        </div>
      </div>

      <div className="traffic-detail-grid">
        <MetricMini label="Tekil ziyaretçi" value={formatNumber(details.uniqueHits)} />
        <MetricMini label="Çoğul hit" value={formatNumber(details.totalHits)} />
        <MetricMini label="Referral keyword" value={details.referralKeyword || "Yok"} />
        <MetricMini label="Referral URL" value={details.referralUrl || "Yok"} />
      </div>
    </article>
  );
}

function ToolUsageCard({ toolUsage, onOpenSettings }: { toolUsage: ToolUsageSummary; onOpenSettings: () => void }) {
  const isBatchFlow = toolUsage.profile === "batchflow";
  return (
    <article className={`panel ${toolUsage.available ? "" : "panel--compact"}`}>
      <div className="panel__header">
        <div>
          <h2>{isBatchFlow ? "BatchFlow ürün hunisi" : "Araç kullanımı"}</h2>
        </div>
      </div>

      {toolUsage.available ? (
        <>
          {isBatchFlow ? (
            <div className="tool-grid">
              <MetricMini label="Demo başlatma" value={formatNumber(toolUsage.funnel.demoStarts)} />
              <MetricMini label="Demo başarısı" value={formatNumber(toolUsage.funnel.demoSuccesses)} />
              <MetricMini label="Kayıt" value={formatNumber(toolUsage.funnel.signUps)} />
              <MetricMini label="Üretim başarısı" value={formatNumber(toolUsage.funnel.renderSuccesses)} />
              <MetricMini label="Çıktı indirme" value={formatNumber(toolUsage.funnel.exports)} />
              <MetricMini label="Satın alma" value={formatNumber(toolUsage.funnel.purchases)} />
            </div>
          ) : (
            <div className="tool-grid">
              <MetricMini label="Başarılı işlem" value={formatNumber(toolUsage.metrics.success)} />
              <MetricMini label="Hata sayısı" value={formatNumber(toolUsage.metrics.errors)} />
              <MetricMini label="Favori ekleme" value={formatNumber(toolUsage.metrics.favorites)} />
              <MetricMini label="Kopyalama / indirme" value={formatNumber(toolUsage.metrics.exports)} />
              <MetricMini label="Tekrar kullanım" value={formatNumber(toolUsage.metrics.repeats)} />
            </div>
          )}

          <div className="tool-list">
            {toolUsage.topTools.map((tool) => (
              <div key={tool.name} className="tool-list__row">
                <strong>{tool.name}</strong>
                <span>{formatNumber(tool.count)} {isBatchFlow ? "etkinlik" : "kullanım"}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="onboarding-card">
          <strong>Araç kullanımını ölçün</strong>
          <p>Araç açma, başarılı işlem ve indirme etkinliklerini yapılandırarak ürün kullanımını takip edin.</p>
          <button type="button" className="button button--secondary" onClick={onOpenSettings}>
            Kurulumu görüntüle
          </button>
        </div>
      )}
    </article>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-mini">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function TablePageCell({ title, path }: { title: string; path: string }) {
  return (
    <div className="table-page">
      <strong title={title}>{title}</strong>
      <span className="table-path" title={path}>{path}</span>
    </div>
  );
}

function TableCard<RowType extends { path?: string; title?: string }>(props: {
  title: string;
  subtitle: string;
  headers: Array<{ key: TableSortKey | string; label: string; numeric?: boolean; description?: string }>;
  rows: RowType[];
  sort: TableSortState;
  onSortChange: (key: TableSortKey) => void;
  renderCells: (row: RowType) => Array<ReactNode>;
}) {
  const { title, subtitle, headers, rows, sort, onSortChange, renderCells } = props;

  return (
    <article className="panel panel--table">
      <div className="panel__header">
        <div>
          <span className="panel__eyebrow">{subtitle}</span>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header.label} className={header.numeric ? "is-numeric" : ""} title={header.description || header.label}>
                  {header.key === "path" || header.key === "title" ? (
                    header.label
                  ) : (
                    <button type="button" className={`sort-button ${header.numeric ? "is-numeric" : ""}`} onClick={() => onSortChange(header.key as TableSortKey)} title={header.description || header.label}>
                      {header.label}
                      <span>{sort.key === header.key ? (sort.direction === "desc" ? "↓" : "↑") : "↕"}</span>
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((row, index) => (
              <tr key={`${row.path || row.title || "row"}-${index}`}>
                {renderCells(row).map((cell, cellIndex) => (
                  <td key={cellIndex} className={headers[cellIndex]?.numeric ? "is-numeric" : ""}>{cell}</td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={headers.length}>
                  <EmptyState message="Bu tablo için veri henüz oluşmadı." compact />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function StatusTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="status-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function EmptyState({ message, compact = false }: { message: string; compact?: boolean }) {
  return <div className={`empty-state ${compact ? "is-compact" : ""}`}>{message}</div>;
}

function LoadingDashboard() {
  return (
    <div className="page-stack">
      <section className="kpi-grid">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton-card" />)}
      </section>
      <section className="mini-metric-grid">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton-card skeleton-card--mini" />)}
      </section>
      <section className="dashboard-grid dashboard-grid--primary">
        <div className="skeleton-card skeleton-card--chart" />
        <div className="stack">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      </section>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="loading-rows">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton-row" />)}
    </div>
  );
}
