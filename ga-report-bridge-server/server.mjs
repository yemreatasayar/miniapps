import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { REPORT_DEFINITIONS, serializeReportDefinition } from "./report-definitions.mjs";

const require = createRequire(import.meta.url);
const archiver = require("archiver");
const moduleDirectory = dirname(fileURLToPath(import.meta.url));

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.MINIAPPS_GA_BRIDGE_PORT || "4187", 10);
// OAuth token and report archive belong to the repository-level local store,
// independent from the helper's current working directory.
const DATA_DIR = resolve(process.env.MINIAPPS_GA_BRIDGE_DATA_DIR || join(moduleDirectory, "..", ".data"));
const REPORTS_DIR = join(DATA_DIR, "reports");
const CONFIG_PATH = join(DATA_DIR, "config.json");
const INDEX_PATH = join(DATA_DIR, "index.json");
const METADATA_CACHE_PATH = join(DATA_DIR, "property-metadata-cache.json");
const SCHEDULER_STATE_PATH = join(DATA_DIR, "scheduler-state.json");
const OAUTH_CLIENT_PATH = join(DATA_DIR, "oauth-client.json");
const TOKEN_PATH = join(DATA_DIR, "oauth-token.json");
const APP_URL = process.env.MINIAPPS_GA_BRIDGE_APP_URL || "http://127.0.0.1:4326/";
const OAUTH_CALLBACK_URL = `http://${HOST}:${PORT}/api/auth/callback`;
const OAUTH_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];
const METADATA_CACHE_TTL_MS = Number.parseInt(process.env.MINIAPPS_GA_BRIDGE_METADATA_TTL_MS || `${6 * 60 * 60 * 1000}`, 10);
const AUTO_SYNC_ENABLED = process.env.MINIAPPS_GA_BRIDGE_AUTO_SYNC !== "0";
const AUTO_SYNC_HOUR = Number.parseInt(process.env.MINIAPPS_GA_BRIDGE_AUTO_SYNC_HOUR || "23", 10);
const AUTO_SYNC_MINUTE = Number.parseInt(process.env.MINIAPPS_GA_BRIDGE_AUTO_SYNC_MINUTE || "55", 10);
const REPORT_DEFINITION_BY_FILENAME = new Map(REPORT_DEFINITIONS.map((definition) => [definition.filename, definition]));
const pendingOAuthStates = new Map();
let autoSyncInProgress = false;

function isLocalOrigin(origin) {
  if (!origin) return false;

  try {
    const url = new URL(origin);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": isLocalOrigin(origin) ? origin : "http://127.0.0.1:4326",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "Content-Disposition",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

function sendJson(response, statusCode, data, origin) {
  response.writeHead(statusCode, {
    ...corsHeaders(origin),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data));
}

function sendText(response, statusCode, text, origin, fileName = "report.csv") {
  response.writeHead(statusCode, {
    ...corsHeaders(origin),
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
  });
  response.end(text);
}

function sendZip(response, origin, fileName) {
  response.writeHead(200, {
    ...corsHeaders(origin),
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
  });
}

function defaultConfig() {
  return {
    oauthClientPath: "",
    accounts: [],
  };
}

async function ensureDataDirs() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  if (!existsSync(CONFIG_PATH)) {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(defaultConfig(), null, 2), "utf8");
  }
  if (!existsSync(INDEX_PATH)) {
    await fs.writeFile(INDEX_PATH, JSON.stringify({ reports: [] }, null, 2), "utf8");
  }
  if (!existsSync(METADATA_CACHE_PATH)) {
    await fs.writeFile(METADATA_CACHE_PATH, JSON.stringify({ properties: {} }, null, 2), "utf8");
  }
  if (!existsSync(SCHEDULER_STATE_PATH)) {
    await fs.writeFile(SCHEDULER_STATE_PATH, JSON.stringify({ lastRunDate: "", lastRunAt: "", lastError: "" }, null, 2), "utf8");
  }
}

async function readJson(path, fallback) {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(path, data) {
  await fs.writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function readConfig() {
  await ensureDataDirs();
  const config = await readJson(CONFIG_PATH, defaultConfig());
  return {
    oauthClientPath: typeof (config.oauthClientPath || config.credentialPath) === "string" ? String(config.oauthClientPath || config.credentialPath) : "",
    accounts: Array.isArray(config.accounts) ? config.accounts.map(normalizeAccount).filter(Boolean) : [],
  };
}

function normalizeAccount(account) {
  if (!account || typeof account !== "object") return null;
  const id = String(account.id || account.propertyId || "").trim();
  const propertyId = String(account.propertyId || "").trim();
  const name = String(account.name || id || propertyId || "").trim();
  const siteUrl = String(account.siteUrl || "").trim();
  if (!id || !propertyId || !name) return null;
  return { id, name, propertyId, siteUrl };
}

function normalizeOAuthClientDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object") {
    throw new Error("OAuth client JSON gecersiz.");
  }

  const client = descriptor.installed || descriptor.web;
  if (!client?.client_id || !client?.client_secret) {
    throw new Error("OAuth client JSON gecersiz. Desktop app Client ID JSON dosyasi gerekli.");
  }

  return descriptor;
}

async function updateConfig(partial) {
  const current = await readConfig();
  let nextOauthClientPath = typeof (partial.oauthClientPath || partial.credentialPath) === "string"
    ? String(partial.oauthClientPath || partial.credentialPath).trim()
    : current.oauthClientPath;

  if (partial.oauthClientJson) {
    const normalizedDescriptor = normalizeOAuthClientDescriptor(partial.oauthClientJson);
    await writeJson(OAUTH_CLIENT_PATH, normalizedDescriptor);
    nextOauthClientPath = OAUTH_CLIENT_PATH;
  }

  const next = {
    oauthClientPath: nextOauthClientPath,
    accounts: Array.isArray(partial.accounts) ? partial.accounts.map(normalizeAccount).filter(Boolean) : current.accounts,
  };
  await writeJson(CONFIG_PATH, next);
  return next;
}

async function readIndex() {
  await ensureDataDirs();
  const index = await readJson(INDEX_PATH, { reports: [] });
  return { reports: Array.isArray(index.reports) ? index.reports : [] };
}

async function writeIndex(index) {
  await writeJson(INDEX_PATH, index);
}

async function readMetadataCache() {
  await ensureDataDirs();
  const cache = await readJson(METADATA_CACHE_PATH, { properties: {} });
  return {
    properties: cache?.properties && typeof cache.properties === "object" ? cache.properties : {},
  };
}

async function writeMetadataCache(cache) {
  await writeJson(METADATA_CACHE_PATH, cache);
}

async function readSchedulerState() {
  await ensureDataDirs();
  const state = await readJson(SCHEDULER_STATE_PATH, { lastRunDate: "", lastRunAt: "", lastError: "" });
  return {
    lastRunDate: typeof state?.lastRunDate === "string" ? state.lastRunDate : "",
    lastRunAt: typeof state?.lastRunAt === "string" ? state.lastRunAt : "",
    lastError: typeof state?.lastError === "string" ? state.lastError : "",
  };
}

async function writeSchedulerState(state) {
  await writeJson(SCHEDULER_STATE_PATH, state);
}

function getConfigStatus(config) {
  const oauthClientExists = Boolean(config.oauthClientPath && existsSync(resolve(config.oauthClientPath)));
  const tokenExists = existsSync(TOKEN_PATH);
  return {
    dataDir: DATA_DIR,
    oauthClientConfigured: Boolean(config.oauthClientPath),
    oauthClientExists,
    authorized: tokenExists,
    accountCount: config.accounts.length,
    tokenPath: TOKEN_PATH,
    ready: oauthClientExists && tokenExists && config.accounts.length > 0,
    autoSync: {
      enabled: AUTO_SYNC_ENABLED,
      hour: AUTO_SYNC_HOUR,
      minute: AUTO_SYNC_MINUTE,
    },
  };
}

function normalizePropertyName(propertyId) {
  const raw = String(propertyId || "").trim();
  if (raw.startsWith("properties/")) return raw;
  return `properties/${raw}`;
}

async function readOAuthTokens() {
  return readJson(TOKEN_PATH, null);
}

async function writeOAuthTokens(tokens) {
  await writeJson(TOKEN_PATH, tokens);
}

async function readOAuthClientDescriptor(config) {
  if (!config.oauthClientPath) {
    throw new Error("OAuth client JSON yolu tanımlı değil.");
  }

  const clientPath = resolve(config.oauthClientPath);
  if (!existsSync(clientPath)) {
    throw new Error(`OAuth client JSON bulunamadı: ${clientPath}`);
  }

  const descriptor = await readJson(clientPath, null);
  const normalizedDescriptor = normalizeOAuthClientDescriptor(descriptor);
  const client = normalizedDescriptor.installed || normalizedDescriptor.web;

  return {
    clientId: client.client_id,
    clientSecret: client.client_secret,
  };
}

async function createOAuthClient(config) {
  const { clientId, clientSecret } = await readOAuthClientDescriptor(config);
  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri: OAUTH_CALLBACK_URL,
  });
}

async function getClient(config) {
  const oauthClient = await createOAuthClient(config);
  const tokens = await readOAuthTokens();

  if (!tokens?.refresh_token && !tokens?.access_token) {
    throw new Error("Google yetkisi eksik. Once OAuth baglantisini tamamla.");
  }

  oauthClient.setCredentials(tokens);
  const auth = new GoogleAuth({
    authClient: oauthClient,
    scopes: OAUTH_SCOPES,
  });
  return new BetaAnalyticsDataClient({ auth, scopes: OAUTH_SCOPES });
}

function cleanupPendingOAuthStates() {
  const cutoff = Date.now() - (15 * 60 * 1000);
  for (const [state, entry] of pendingOAuthStates.entries()) {
    if (entry.createdAt < cutoff) pendingOAuthStates.delete(state);
  }
}

function getSafeReturnUrl(rawValue) {
  const fallback = new URL(APP_URL);

  try {
    const url = new URL(rawValue || APP_URL);
    if (!isLocalOrigin(url.origin)) return fallback;
    return url;
  } catch {
    return fallback;
  }
}

function withAuthResult(returnUrl, status, detail = "") {
  const url = new URL(returnUrl.toString());
  url.searchParams.set("auth", status);
  if (detail) url.searchParams.set("auth_detail", detail);
  return url.toString();
}

async function startOAuthFlow(response, origin, params) {
  const config = await readConfig();
  const oauthClient = await createOAuthClient(config);
  const returnUrl = getSafeReturnUrl(params.get("returnTo"));
  const state = crypto.randomUUID();
  cleanupPendingOAuthStates();
  pendingOAuthStates.set(state, { returnUrl: returnUrl.toString(), createdAt: Date.now() });

  const authUrl = oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: OAUTH_SCOPES,
    state,
  });

  response.writeHead(302, {
    ...corsHeaders(origin),
    Location: authUrl,
  });
  response.end();
}

async function completeOAuthFlow(response, origin, params) {
  cleanupPendingOAuthStates();
  const state = String(params.get("state") || "");
  const entry = pendingOAuthStates.get(state);
  const returnUrl = getSafeReturnUrl(entry?.returnUrl);
  pendingOAuthStates.delete(state);

  const oauthError = String(params.get("error") || "");
  if (oauthError) {
    response.writeHead(302, {
      ...corsHeaders(origin),
      Location: withAuthResult(returnUrl, "error", oauthError),
    });
    response.end();
    return;
  }

  const code = String(params.get("code") || "");
  if (!entry || !code) {
    response.writeHead(302, {
      ...corsHeaders(origin),
      Location: withAuthResult(returnUrl, "error", "oauth_state"),
    });
    response.end();
    return;
  }

  const config = await readConfig();
  const oauthClient = await createOAuthClient(config);
  const { tokens } = await oauthClient.getToken(code);
  await writeOAuthTokens(tokens);

  response.writeHead(302, {
    ...corsHeaders(origin),
    Location: withAuthResult(returnUrl, "success"),
  });
  response.end();
}

function safeTimeZone(timeZone) {
  const candidate = String(timeZone || "").trim();
  if (!candidate) return "";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "";
  }
}

function formatIsoDateInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone) || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateRangeFromBody(body) {
  const startDate = typeof body.startDate === "string" && body.startDate ? body.startDate : "yesterday";
  const endDate = typeof body.endDate === "string" && body.endDate ? body.endDate : startDate;
  const archiveDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : "";
  return { startDate, endDate, archiveDate };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(preset, rows) {
  const headers = [...definitionDimensionOutputNames(preset), ...definitionMetricOutputNames(preset)];
  const lines = [headers.map(csvEscape).join(",")];

  for (const row of rows) {
    const dimensions = row.dimensionValues?.map((item) => item.value ?? "") ?? [];
    const metrics = row.metricValues?.map((item) => item.value ?? "") ?? [];
    lines.push([...dimensions, ...metrics].map(csvEscape).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function numberFromRow(row, key) {
  const value = Number.parseFloat(String(row?.[key] ?? "0"));
  return Number.isFinite(value) ? value : 0;
}

function formatGaDateLabel(value) {
  const text = String(value || "");
  if (/^\d{8}$/.test(text)) return `${text.slice(4, 6)}-${text.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.slice(5);
  return text;
}

function accountReportDir(accountId, date) {
  return join(REPORTS_DIR, accountId, date);
}

async function getLatestKnownPropertyTimezone(accountId) {
  const index = await readIndex();
  const dates = [...new Set(
    index.reports
      .filter((report) => report.accountId === accountId && /^\d{4}-\d{2}-\d{2}$/.test(String(report.date || "")))
      .map((report) => report.date),
  )].sort((a, b) => String(b).localeCompare(String(a)));

  for (const date of dates) {
    const manifest = await readJson(join(accountReportDir(accountId, date), "manifest.json"), null);
    const timeZone = safeTimeZone(manifest?.dataQuality?.timezone);
    if (timeZone) return timeZone;
  }

  return safeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
}

async function resolveSyncDateRange(account, dateRange) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateRange.archiveDate || ""))) {
    return dateRange;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateRange.endDate || ""))) {
    return { ...dateRange, archiveDate: dateRange.endDate };
  }

  const timeZone = safeTimeZone(account.timezone) || await getLatestKnownPropertyTimezone(account.id);
  return { ...dateRange, archiveDate: formatIsoDateInTimeZone(new Date(), timeZone) };
}

function resolveMetricRequestName(definition, name) {
  const metric = definition.metrics.find((item) => {
    if (typeof item === "string") return item === name;
    return item.name === name || item.output === name;
  });

  return normalizeDefinitionMetric(metric || name).requestName;
}

function resolveDimensionRequestName(definition, name) {
  const dimension = definition.dimensions.find((item) => {
    if (typeof item === "string") return item === name;
    return item.name === name || item.output === name;
  });

  return normalizeDefinitionDimension(dimension || name).requestName;
}

function buildOrderBys(definition, ordering = []) {
  return ordering.map((item) => {
    if (item.type === "dimension") {
      return { desc: Boolean(item.desc), dimension: { dimensionName: resolveDimensionRequestName(definition, item.name) } };
    }

    return { desc: Boolean(item.desc), metric: { metricName: resolveMetricRequestName(definition, item.name) } };
  });
}

function clonePlainObject(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function normalizeDefinitionMetric(metric) {
  if (typeof metric === "string") {
    return { requestName: metric, outputName: metric };
  }

  return {
    requestName: metric.name,
    outputName: metric.output || metric.name,
  };
}

function normalizeDefinitionDimension(dimension) {
  if (typeof dimension === "string") {
    return { requestName: dimension, outputName: dimension };
  }

  return {
    requestName: dimension.name,
    outputName: dimension.output || dimension.name,
  };
}

function definitionDimensionRequestNames(definition) {
  return definition.dimensions.map((dimension) => normalizeDefinitionDimension(dimension).requestName);
}

function definitionDimensionOutputNames(definition) {
  return definition.dimensions.map((dimension) => normalizeDefinitionDimension(dimension).outputName);
}

function definitionMetricRequestNames(definition) {
  return definition.metrics.map((metric) => normalizeDefinitionMetric(metric).requestName);
}

function definitionMetricOutputNames(definition) {
  return definition.metrics.map((metric) => normalizeDefinitionMetric(metric).outputName);
}

function normalizeResponseMetadata(metadata) {
  if (!metadata) return null;

  return {
    dataLossFromOtherRow: Boolean(metadata.dataLossFromOtherRow),
    currencyCode: metadata.currencyCode || "",
    timeZone: metadata.timeZone || "",
    subjectToThresholding: Boolean(metadata.subjectToThresholding),
    samplingMetadatas: Array.isArray(metadata.samplingMetadatas)
      ? metadata.samplingMetadatas.map((item) => clonePlainObject(item))
      : [],
    schemaRestrictionResponse: clonePlainObject(metadata.schemaRestrictionResponse),
  };
}

function normalizePropertyQuota(propertyQuota) {
  return clonePlainObject(propertyQuota);
}

function metadataAvailabilitySnapshot(metadata) {
  const dimensions = Array.isArray(metadata?.dimensions) ? metadata.dimensions.map((item) => String(item.apiName || "")).filter(Boolean) : [];
  const metrics = Array.isArray(metadata?.metrics) ? metadata.metrics.map((item) => String(item.apiName || "")).filter(Boolean) : [];

  return {
    dimensions,
    metrics,
    dimensionCount: dimensions.length,
    metricCount: metrics.length,
  };
}

function emptyMetadataAvailability() {
  return { dimensions: [], metrics: [], dimensionCount: 0, metricCount: 0 };
}

function metadataCacheEntryIsFresh(entry) {
  if (!entry?.fetchedAt) return false;
  const fetchedAt = new Date(entry.fetchedAt).getTime();
  if (!Number.isFinite(fetchedAt)) return false;
  return (Date.now() - fetchedAt) <= METADATA_CACHE_TTL_MS;
}

async function getPropertyMetadataSnapshot(client, account) {
  const property = normalizePropertyName(account.propertyId);
  const cache = await readMetadataCache();
  const cachedEntry = cache.properties?.[property];

  if (metadataCacheEntryIsFresh(cachedEntry)) {
    return {
      property,
      fetchedAt: cachedEntry.fetchedAt,
      available: cachedEntry.available || emptyMetadataAvailability(),
      error: "",
      source: "cache",
      stale: false,
    };
  }

  try {
    const [metadata] = await client.getMetadata({ name: `${property}/metadata` });
    const snapshot = {
      property,
      fetchedAt: new Date().toISOString(),
      available: metadataAvailabilitySnapshot(metadata),
      error: "",
      source: "live",
      stale: false,
    };
    cache.properties[property] = {
      fetchedAt: snapshot.fetchedAt,
      available: snapshot.available,
    };
    await writeMetadataCache(cache);
    return snapshot;
  } catch (error) {
    if (cachedEntry) {
      return {
        property,
        fetchedAt: cachedEntry.fetchedAt,
        available: cachedEntry.available || emptyMetadataAvailability(),
        error: error instanceof Error ? error.message : "Property metadata alınamadı.",
        source: "cache-fallback",
        stale: true,
      };
    }

    return {
      property,
      fetchedAt: new Date().toISOString(),
      available: emptyMetadataAvailability(),
      error: error instanceof Error ? error.message : "Property metadata alınamadı.",
      source: "unavailable",
      stale: false,
    };
  }
}

async function checkDefinitionCompatibility(client, property, definition, availability) {
  if (availability.dimensionCount === 0 && availability.metricCount === 0) return defaultCompatibility();

  const availableDimensions = new Set(availability.dimensions);
  const availableMetrics = new Set(availability.metrics);
  const requestDimensions = definitionDimensionRequestNames(definition);
  const missingDimensions = requestDimensions.filter((name) => !availableDimensions.has(name));
  const requestMetrics = definitionMetricRequestNames(definition);
  const missingMetrics = requestMetrics.filter((name) => !availableMetrics.has(name));

  if (missingDimensions.length > 0 || missingMetrics.length > 0) {
    return {
      compatible: false,
      status: "unavailable",
      missingDimensions,
      missingMetrics,
      incompatibleDimensions: [],
      incompatibleMetrics: [],
      reason: "Property metadata bu rapor alanlarının tamamını desteklemiyor.",
    };
  }

  const [response] = await client.checkCompatibility({
    property,
    dimensions: requestDimensions.map((name) => ({ name })),
    metrics: requestMetrics.map((name) => ({ name })),
    compatibilityFilter: "COMPATIBLE",
  });

  const compatibleDimensions = new Set(
    (response.dimensionCompatibilities || [])
      .filter((item) => String(item.compatibility || "") === "COMPATIBLE")
      .map((item) => String(item.dimensionMetadata?.apiName || "")),
  );
  const compatibleMetrics = new Set(
    (response.metricCompatibilities || [])
      .filter((item) => String(item.compatibility || "") === "COMPATIBLE")
      .map((item) => String(item.metricMetadata?.apiName || "")),
  );

  const incompatibleDimensions = requestDimensions.filter((name) => !compatibleDimensions.has(name));
  const incompatibleMetrics = requestMetrics.filter((name) => !compatibleMetrics.has(name));

  return {
    compatible: incompatibleDimensions.length === 0 && incompatibleMetrics.length === 0,
    status: incompatibleDimensions.length === 0 && incompatibleMetrics.length === 0 ? "compatible" : "unavailable",
    missingDimensions,
    missingMetrics,
    incompatibleDimensions,
    incompatibleMetrics,
    reason: incompatibleDimensions.length === 0 && incompatibleMetrics.length === 0
      ? ""
      : "Dimension / metric kombinasyonu bu property için uyumlu değil.",
  };
}

function defaultCompatibility() {
  return {
    compatible: true,
    status: "compatible",
    missingDimensions: [],
    missingMetrics: [],
    incompatibleDimensions: [],
    incompatibleMetrics: [],
    reason: "",
  };
}

function createManifestReportEntry(account, dateRange, definition, overrides = {}) {
  return {
    id: `${account.id}-${dateRange.archiveDate}-${definition.id}`,
    reportId: definition.id,
    displayName: definition.displayName,
    description: definition.description,
    filename: definition.filename,
    category: definition.category,
    dashboardVisibility: definition.dashboardVisibility,
    optional: Boolean(definition.optional),
    requestedDimensions: definitionDimensionOutputNames(definition),
    requestDimensions: definitionDimensionRequestNames(definition),
    requestedMetrics: definitionMetricOutputNames(definition),
    requestMetrics: definitionMetricRequestNames(definition),
    requestedDateRange: {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      archiveDate: dateRange.archiveDate,
    },
    status: "ok",
    rows: 0,
    sizeKb: 0,
    warnings: [],
    errors: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createSyncManifest(account, dateRange, propertyMetadata) {
  return {
    account: {
      id: account.id,
      name: account.name,
      propertyId: account.propertyId,
      siteUrl: account.siteUrl || "",
    },
    generatedAt: new Date().toISOString(),
    requestedDateRange: {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      archiveDate: dateRange.archiveDate,
    },
    reportCount: 0,
    reportList: [],
    warnings: [],
    errors: [],
    propertyMetadata,
    dataQuality: {
      timezone: "",
      currencyCode: "",
      thresholding: false,
      sampling: false,
      dataLossFromOtherRow: false,
      quota: null,
    },
  };
}

function applyDataQualityToManifest(manifest, metadata, quota) {
  if (metadata?.timeZone && !manifest.dataQuality.timezone) {
    manifest.dataQuality.timezone = metadata.timeZone;
  }

  if (metadata?.currencyCode && !manifest.dataQuality.currencyCode) {
    manifest.dataQuality.currencyCode = metadata.currencyCode;
  }

  if (metadata?.subjectToThresholding) {
    manifest.dataQuality.thresholding = true;
  }

  if (metadata?.dataLossFromOtherRow) {
    manifest.dataQuality.dataLossFromOtherRow = true;
  }

  if (Array.isArray(metadata?.samplingMetadatas) && metadata.samplingMetadatas.length > 0) {
    manifest.dataQuality.sampling = true;
  }

  if (quota && !manifest.dataQuality.quota) {
    manifest.dataQuality.quota = quota;
  }
}

function buildDimensionFilter(filters) {
  if (!filters?.eventNameIn?.length) return undefined;

  return {
    filter: {
      fieldName: "eventName",
      inListFilter: {
        values: filters.eventNameIn,
        caseSensitive: true,
      },
    },
  };
}

function buildRunReportRequest(account, dateRange, definition) {
  const request = {
    dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
    dimensions: definitionDimensionRequestNames(definition).map((name) => ({ name })),
    metrics: definitionMetricRequestNames(definition).map((name) => ({ name })),
    orderBys: buildOrderBys(definition, definition.ordering),
    returnPropertyQuota: true,
    limit: 100000,
  };
  const dimensionFilter = buildDimensionFilter(definition.filters);
  if (dimensionFilter) {
    request.dimensionFilter = dimensionFilter;
  }
  return request;
}

function processRunReportResponse(definition, response) {
  const rows = response.rows ?? [];
  return {
    csv: rowsToCsv(definition, rows),
    rowCount: rows.length,
    metadata: normalizeResponseMetadata(response.metadata),
    propertyQuota: normalizePropertyQuota(response.propertyQuota),
  };
}

async function runReportDefinition(client, account, dateRange, definition) {
  const [response] = await client.runReport({
    property: normalizePropertyName(account.propertyId),
    ...buildRunReportRequest(account, dateRange, definition),
  });
  return processRunReportResponse(definition, response);
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function runDefinitionsInBatches(client, account, dateRange, definitions) {
  const property = normalizePropertyName(account.propertyId);
  const results = new Map();
  const errors = new Map();

  for (const chunk of chunkArray(definitions, 5)) {
    try {
      const [response] = await client.batchRunReports({
        property,
        requests: chunk.map((definition) => buildRunReportRequest(account, dateRange, definition)),
      });

      chunk.forEach((definition, index) => {
        const reportResponse = response.reports?.[index];
        if (!reportResponse) {
          errors.set(definition.id, new Error(`Batch response eksik: ${definition.id}`));
          return;
        }
        results.set(definition.id, processRunReportResponse(definition, reportResponse));
      });
    } catch (batchError) {
      for (const definition of chunk) {
        try {
          results.set(definition.id, await runReportDefinition(client, account, dateRange, definition));
        } catch (error) {
          errors.set(definition.id, error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }

  return { results, errors };
}

async function syncAccount(accountId, dateRange) {
  const config = await readConfig();
  const account = config.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error(`Hesap bulunamadı: ${accountId}`);

  const resolvedDateRange = await resolveSyncDateRange(account, dateRange);
  const client = await getClient(config);
  const dir = accountReportDir(account.id, resolvedDateRange.archiveDate);
  await fs.mkdir(dir, { recursive: true });

  const index = await readIndex();
  const nextReports = index.reports.filter((report) => !(report.accountId === account.id && report.date === resolvedDateRange.archiveDate));
  const propertyMetadata = await getPropertyMetadataSnapshot(client, account);
  const manifest = createSyncManifest(account, resolvedDateRange, propertyMetadata);
  if (propertyMetadata.error) {
    manifest.warnings.push(`Property metadata alınamadı: ${propertyMetadata.error}`);
  }
  const property = normalizePropertyName(account.propertyId);
  const manifestReports = [];
  const definitions = REPORT_DEFINITIONS.slice();
  const runnableDefinitions = [];
  const compatibilityById = new Map();
  const compatibilityWarningsById = new Map();

  for (const definition of definitions) {
    const baseEntry = createManifestReportEntry(account, resolvedDateRange, definition);
    let compatibility = defaultCompatibility();

    try {
      compatibility = await checkDefinitionCompatibility(client, property, definition, propertyMetadata.available);
      compatibilityById.set(definition.id, compatibility);

      if (!compatibility.compatible) {
        const warning = compatibility.reason || "Bu property için kullanılamıyor.";
        manifestReports.push({
          ...baseEntry,
          status: "unavailable",
          warnings: [warning],
          compatibility,
        });
        manifest.warnings.push(`${definition.displayName}: ${warning}`);
        continue;
      }

      runnableDefinitions.push(definition);
    } catch (error) {
      const warning = error instanceof Error ? error.message : "Compatibility kontrolü yapılamadı.";
      compatibilityWarningsById.set(definition.id, `Compatibility kontrolü atlandı: ${warning}`);
      compatibilityById.set(definition.id, compatibility);
      runnableDefinitions.push(definition);
    }
  }

  const batchOutcome = await runDefinitionsInBatches(client, account, resolvedDateRange, runnableDefinitions);

  for (const definition of runnableDefinitions) {
    const baseEntry = createManifestReportEntry(account, resolvedDateRange, definition);
    const compatibility = compatibilityById.get(definition.id) || defaultCompatibility();

    try {
      const compatibilityWarnings = compatibilityWarningsById.has(definition.id)
        ? [compatibilityWarningsById.get(definition.id)]
        : [];
      const result = batchOutcome.results.get(definition.id);
      if (!result) {
        throw batchOutcome.errors.get(definition.id) || new Error("Rapor sonucu üretilemedi.");
      }
      const filePath = join(dir, definition.filename);
      await fs.writeFile(filePath, result.csv, "utf8");
      const stat = await fs.stat(filePath);
      const createdAt = new Date().toISOString();
      const rows = result.rowCount;
      const indexEntry = {
        id: `${account.id}-${resolvedDateRange.archiveDate}-${definition.id}`,
        accountId: account.id,
        accountName: account.name,
        propertyId: account.propertyId,
        date: resolvedDateRange.archiveDate,
        startDate: resolvedDateRange.startDate,
        endDate: resolvedDateRange.endDate,
        category: definition.category,
        name: definition.filename,
        rows,
        sizeKb: Math.max(1, Math.round(stat.size / 1024)),
        path: filePath,
        createdAt,
      };

      manifestReports.push({
        ...baseEntry,
        status: "ok",
        rows,
        sizeKb: indexEntry.sizeKb,
        createdAt,
        warnings: compatibilityWarnings,
        metadata: result.metadata,
        propertyQuota: result.propertyQuota,
        compatibility,
      });
      if (compatibilityWarnings.length > 0) {
        manifest.warnings.push(`${definition.displayName}: ${compatibilityWarnings[0]}`);
      }
      nextReports.push(indexEntry);
      applyDataQualityToManifest(manifest, result.metadata, result.propertyQuota);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bilinmeyen hata";
      const failedEntry = {
        ...baseEntry,
        status: compatibility.compatible ? "error" : "unavailable",
        warnings: compatibility.compatible || !compatibility.reason ? [] : [compatibility.reason],
        errors: [message],
        compatibility,
      };
      manifestReports.push(failedEntry);
      manifest.errors.push(`${definition.displayName}: ${message}`);
    }
  }

  manifest.reportList = manifestReports;
  manifest.reportCount = manifestReports.filter((report) => report.status === "ok").length;
  await writeJson(join(dir, "manifest.json"), manifest);
  await writeIndex({ reports: nextReports.sort((a, b) => `${b.date}${b.name}`.localeCompare(`${a.date}${a.name}`)) });
  return manifestReports;
}

function filterReports(index, params) {
  const accountId = params.get("accountId");
  const date = params.get("date");
  const query = (params.get("q") || "").toLowerCase();

  return index.reports.filter((report) => {
    if (accountId && report.accountId !== accountId) return false;
    if (date && report.date !== date) return false;
    if (!query) return true;
    return [report.name, report.category, report.date, report.accountName, report.propertyId]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

async function enrichReports(reports) {
  const manifestReportMaps = new Map();

  async function manifestReportMapFor(accountId, date) {
    const key = `${accountId}:${date}`;
    if (manifestReportMaps.has(key)) return manifestReportMaps.get(key);

    const manifest = await readManifest(accountId, date);
    const reportMap = new Map(
      (Array.isArray(manifest?.reportList) ? manifest.reportList : [])
        .map((report) => [report.filename, report]),
    );
    manifestReportMaps.set(key, reportMap);
    return reportMap;
  }

  return Promise.all(reports.map(async (report) => {
    const definition = REPORT_DEFINITION_BY_FILENAME.get(report.name);
    const serializedDefinition = definition ? serializeReportDefinition(definition) : null;
    const manifestReportMap = await manifestReportMapFor(report.accountId, report.date);
    const manifestReport = manifestReportMap.get(report.name);

    return {
      ...report,
      reportId: manifestReport?.reportId || definition?.id || report.name,
      displayName: manifestReport?.displayName || definition?.displayName || report.name,
      description: manifestReport?.description || definition?.description || "",
      status: manifestReport?.status || "ok",
      warnings: manifestReport?.warnings || [],
      errors: manifestReport?.errors || [],
      optional: manifestReport?.optional ?? Boolean(definition?.optional),
      dashboardVisibility: manifestReport?.dashboardVisibility || definition?.dashboardVisibility || "reports-only",
      requestedDimensions: manifestReport?.requestedDimensions || (definition ? definitionDimensionOutputNames(definition) : []),
      requestDimensions: manifestReport?.requestDimensions || (definition ? definitionDimensionRequestNames(definition) : []),
      requestedMetrics: manifestReport?.requestedMetrics || serializedDefinition?.metrics || [],
      requestMetrics: manifestReport?.requestMetrics || serializedDefinition?.requestMetrics || [],
    };
  }));
}

async function rowsForReport(reports, name) {
  const report = reports.find((item) => item.name === name);
  if (!report?.path) return [];

  try {
    return parseCsv(await fs.readFile(report.path, "utf8"));
  } catch {
    return [];
  }
}

async function readManifest(accountId, date) {
  try {
    return await readJson(join(accountReportDir(accountId, date), "manifest.json"), null);
  } catch {
    return null;
  }
}

async function buildSyncHistory(params) {
  const index = await readIndex();
  const filteredReports = filterReports(index, params);
  const groups = new Map();

  for (const report of filteredReports) {
    const key = `${report.accountId}:${report.date}`;
    const existing = groups.get(key) || {
      key,
      accountId: report.accountId,
      accountName: report.accountName,
      propertyId: report.propertyId,
      date: report.date,
      latestCreatedAt: report.createdAt || `${report.date}T00:00:00Z`,
      reportCount: 0,
      rows: 0,
      sizeKb: 0,
      manifest: null,
    };

    existing.reportCount += 1;
    existing.rows += Number(report.rows || 0);
    existing.sizeKb += Number(report.sizeKb || 0);
    if ((report.createdAt || "") > existing.latestCreatedAt) {
      existing.latestCreatedAt = report.createdAt;
    }
    groups.set(key, existing);
  }

  const entries = await Promise.all([...groups.values()].map(async (group) => {
    const manifest = await readManifest(group.accountId, group.date);
    const reportList = Array.isArray(manifest?.reportList) ? manifest.reportList : [];
    const statusCounts = reportList.reduce((sum, report) => {
      const status = String(report.status || "unknown");
      sum[status] = (sum[status] || 0) + 1;
      return sum;
    }, {});

    return {
      key: group.key,
      accountId: group.accountId,
      accountName: group.accountName,
      propertyId: group.propertyId,
      date: group.date,
      generatedAt: manifest?.generatedAt || group.latestCreatedAt,
      reportCount: group.reportCount,
      rows: group.rows,
      sizeKb: group.sizeKb,
      warnings: manifest?.warnings || [],
      errors: manifest?.errors || [],
      dataQuality: manifest?.dataQuality || null,
      propertyMetadata: manifest?.propertyMetadata || null,
      statusCounts,
    };
  }));

  return entries.sort((left, right) => String(right.generatedAt || "").localeCompare(String(left.generatedAt || "")));
}

function emptyDashboardSummary(accountId) {
  return {
    accountId,
    lastSync: "Henüz sync yok",
    lastSyncAt: "",
    kpi: { users: 0, newUsers: 0, sessions: 0, views: 0, engagementRate: 0, averageSessionDuration: 0, conversions: 0 },
    previousKpi: { users: 0, newUsers: 0, sessions: 0, views: 0, engagementRate: 0, averageSessionDuration: 0, conversions: 0 },
    trend: [],
    previousTrend: [],
    channels: [],
    landingPages: [],
    topPages: [],
    recentReports: [],
    toolUsage: { available: false, topTools: [], metrics: { success: 0, errors: 0, repeats: 0, favorites: 0, exports: 0 } },
    dataStatus: {
      timezone: "Bilinmiyor",
      freshness: "Bilinmiyor",
      thresholding: "Bilinmiyor",
      sampling: "Bilinmiyor",
      quota: "Bilinmiyor",
      warning: "",
      error: "",
    },
  };
}

function percentageChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function percentPointChange(current, previous) {
  return Number((current - previous).toFixed(3));
}

function safeRatio(numerator, denominator) {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

const MINIAPPS_PRODUCT_EVENTS = new Set([
  "tool_open",
  "process_success",
  "process_error",
  "repeat_use",
  "favorite_add",
  "favorite_remove",
  "export_download",
]);

function summarizeToolUsage(toolUsageRows, eventRows) {
  const eventMetricsByName = Object.fromEntries(
    eventRows.map((row) => [String(row.eventName || ""), Math.round(numberFromRow(row, "eventCount"))]),
  );

  if (toolUsageRows.length > 0) {
    const metrics = { success: 0, errors: 0, repeats: 0, favorites: 0, exports: 0, newUsers: 0 };
    const toolsById = new Map();

    for (const row of toolUsageRows) {
      const eventName = String(row.eventName || "");
      const appId = String(row.appId || "unknown");
      const count = Math.round(numberFromRow(row, "eventCount"));
      if (!MINIAPPS_PRODUCT_EVENTS.has(eventName)) continue;

      if (eventName === "process_success") metrics.success += count;
      if (eventName === "process_error") metrics.errors += count;
      if (eventName === "repeat_use") metrics.repeats += count;
      if (eventName === "favorite_add") metrics.favorites += count;
      if (eventName === "export_download") metrics.exports += count;

      const current = toolsById.get(appId) || { name: appId, count: 0 };
      current.count += count;
      toolsById.set(appId, current);
    }

    return {
      available: toolsById.size > 0,
      topTools: [...toolsById.values()].sort((a, b) => b.count - a.count).slice(0, 5),
      metrics,
    };
  }

  const customToolEvents = eventRows
    .filter((row) => MINIAPPS_PRODUCT_EVENTS.has(String(row.eventName || "")))
    .map((row) => ({ name: String(row.eventName || ""), count: Math.round(numberFromRow(row, "eventCount")) }))
    .filter((row) => row.name)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    available: customToolEvents.length > 0,
    topTools: customToolEvents,
    metrics: {
      success: eventMetricsByName.process_success || 0,
      errors: eventMetricsByName.process_error || 0,
      repeats: eventMetricsByName.repeat_use || 0,
      favorites: eventMetricsByName.favorite_add || 0,
      exports: eventMetricsByName.export_download || 0,
      newUsers: eventMetricsByName.first_visit || 0,
    },
  };
}

function parseGaDate(value) {
  const text = String(value || "");
  if (/^\d{8}$/.test(text)) {
    const year = Number.parseInt(text.slice(0, 4), 10);
    const month = Number.parseInt(text.slice(4, 6), 10) - 1;
    const day = Number.parseInt(text.slice(6, 8), 10);
    return new Date(Date.UTC(year, month, day));
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T00:00:00Z`);
  }

  return null;
}

function formatIsoDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value) {
  const date = parseGaDate(value);
  if (!date) return String(value || "");
  return `${String(date.getUTCDate()).padStart(2, "0")} ${["Ocak", "Subat", "Mart", "Nisan", "Mayis", "Haziran", "Temmuz", "Agustos", "Eylul", "Ekim", "Kasim", "Aralik"][date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function fillDateSeries(rows) {
  if (rows.length === 0) return [];

  const datedRows = rows
    .map((row) => ({ row, date: parseGaDate(row.date) }))
    .filter((item) => item.date);

  if (datedRows.length === 0) return [];

  datedRows.sort((left, right) => left.date - right.date);
  const byIsoDate = new Map(datedRows.map((item) => [formatIsoDate(item.date), item.row]));
  const series = [];
  const cursor = new Date(datedRows[0].date);
  const endDate = datedRows[datedRows.length - 1].date;

  while (cursor <= endDate) {
    const isoDate = formatIsoDate(cursor);
    const row = byIsoDate.get(isoDate) || { date: isoDate };
    series.push({
      rawDate: isoDate,
      label: formatGaDateLabel(isoDate),
      users: Math.round(numberFromRow(row, "totalUsers")),
      newUsers: Math.round(numberFromRow(row, "newUsers")),
      sessions: Math.round(numberFromRow(row, "sessions")),
      views: Math.round(numberFromRow(row, "screenPageViews")),
      engagementRate: numberFromRow(row, "engagementRate"),
      averageSessionDuration: numberFromRow(row, "averageSessionDuration"),
      conversions: Math.round(numberFromRow(row, "conversions")),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return series;
}

function alignSeriesToLength(series, length) {
  if (series.length === length) return series;
  if (series.length > length) return series.slice(series.length - length);

  const padding = Array.from({ length: Math.max(0, length - series.length) }, (_, index) => ({
    rawDate: `pad-${index}`,
    label: "",
    users: 0,
    newUsers: 0,
    sessions: 0,
    views: 0,
    engagementRate: 0,
    averageSessionDuration: 0,
    conversions: 0,
  }));
  return [...padding, ...series];
}

function summarizeOverviewRows(rows) {
  const totals = rows.reduce((sum, row) => ({
    users: sum.users + numberFromRow(row, "totalUsers"),
    newUsers: sum.newUsers + numberFromRow(row, "newUsers"),
    sessions: sum.sessions + numberFromRow(row, "sessions"),
    views: sum.views + numberFromRow(row, "screenPageViews"),
    engagementWeighted: sum.engagementWeighted + (numberFromRow(row, "engagementRate") * numberFromRow(row, "sessions")),
    durationWeighted: sum.durationWeighted + (numberFromRow(row, "averageSessionDuration") * numberFromRow(row, "sessions")),
    conversions: sum.conversions + numberFromRow(row, "conversions"),
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

async function buildDashboardSummary(accountId) {
  const index = await readIndex();
  const accountReports = index.reports.filter((report) => report.accountId === accountId);
  const reportDates = [...new Set(accountReports.map((report) => report.date))].sort((a, b) => b.localeCompare(a));
  if (reportDates.length === 0) return emptyDashboardSummary(accountId);

  const reportsByDate = new Map(reportDates.map((date) => [
    date,
    accountReports.filter((report) => report.date === date),
  ]));

  const overviewRowsByDate = new Map();
  for (const date of reportDates) {
    const rows = await rowsForReport(reportsByDate.get(date) || [], "overview_daily.csv");
    overviewRowsByDate.set(date, rows);
  }

  const latestAttemptDate = reportDates[0];
  const latestAttemptManifest = await readManifest(accountId, latestAttemptDate);
  const usableDates = reportDates.filter((date) => (overviewRowsByDate.get(date) || []).length > 0);
  const latestDate = usableDates[0] || latestAttemptDate;
  const previousDate = usableDates.find((date) => date !== latestDate) || reportDates.find((date) => date !== latestDate);
  const latestAttemptWasEmpty = latestAttemptDate !== latestDate;

  const reports = reportsByDate.get(latestDate) || [];
  const previousReports = previousDate ? (reportsByDate.get(previousDate) || []) : [];
  const manifest = await readManifest(accountId, latestDate);
  const overviewRows = overviewRowsByDate.get(latestDate) || [];
  const previousOverviewRows = previousDate ? (overviewRowsByDate.get(previousDate) || []) : [];
  const channelRows = await rowsForReport(reports, "traffic_channels.csv");
  const previousChannelRows = await rowsForReport(previousReports, "traffic_channels.csv");
  const landingRows = await rowsForReport(reports, "landing_pages.csv");
  const pageRows = await rowsForReport(reports, "pages.csv");
  const eventRows = await rowsForReport(reports, "events.csv");
  const toolUsageRows = await rowsForReport(reports, "tool_usage.csv");
  const referralUrlRows = await rowsForReport(reports, "referral_urls.csv");
  const referralKeywordRows = await rowsForReport(reports, "referral_keywords.csv");

  const kpi = summarizeOverviewRows(overviewRows);
  const previousKpi = previousOverviewRows.length > 0 ? summarizeOverviewRows(previousOverviewRows) : kpi;

  const trendSeries = fillDateSeries(overviewRows);
  const previousTrendSeries = alignSeriesToLength(fillDateSeries(previousOverviewRows), trendSeries.length);

  const trend = trendSeries.map((row) => ({
    rawDate: row.rawDate,
    date: row.label,
    users: row.users,
    newUsers: row.newUsers,
    sessions: row.sessions,
    views: row.views,
    engagementRate: row.engagementRate,
    averageSessionDuration: row.averageSessionDuration,
    conversions: row.conversions,
  }));

  const previousTrend = previousTrendSeries.map((row, index) => ({
    rawDate: trendSeries[index]?.rawDate || row.rawDate,
    date: trendSeries[index]?.label || row.label,
    users: row.users,
    newUsers: row.newUsers,
    sessions: row.sessions,
    views: row.views,
    engagementRate: row.engagementRate,
    averageSessionDuration: row.averageSessionDuration,
    conversions: row.conversions,
  }));

  const previousChannelsByName = Object.fromEntries(previousChannelRows.map((row) => [
    String(row.sessionDefaultChannelGroup || "Unassigned"),
    {
      sessions: Math.round(numberFromRow(row, "sessions")),
      engagedSessions: Math.round(numberFromRow(row, "engagedSessions")),
      totalUsers: Math.round(numberFromRow(row, "totalUsers")),
    },
  ]));

  const totalChannelSessions = channelRows.reduce((sum, row) => sum + Math.round(numberFromRow(row, "sessions")), 0);

  const channels = channelRows
    .map((row) => ({
      name: String(row.sessionDefaultChannelGroup || "Unassigned"),
      sessions: Math.round(numberFromRow(row, "sessions")),
      previousSessions: previousChannelsByName[String(row.sessionDefaultChannelGroup || "Unassigned")]?.sessions ?? 0,
      share: safeRatio(Math.round(numberFromRow(row, "sessions")), totalChannelSessions),
      engagementRate: safeRatio(Math.round(numberFromRow(row, "engagedSessions")), Math.round(numberFromRow(row, "sessions"))),
      users: Math.round(numberFromRow(row, "totalUsers")),
      change: percentageChange(
        Math.round(numberFromRow(row, "sessions")),
        previousChannelsByName[String(row.sessionDefaultChannelGroup || "Unassigned")]?.sessions ?? 0,
      ),
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 6);

  const landingPages = landingRows
    .map((row) => ({
      path: String(row.landingPagePlusQueryString || "/"),
      title: String(row.landingPagePlusQueryString || "/"),
      sessions: Math.round(numberFromRow(row, "sessions")),
      users: Math.round(numberFromRow(row, "totalUsers")),
      views: Math.round(numberFromRow(row, "screenPageViews")),
      engagementRate: safeRatio(Math.round(numberFromRow(row, "engagedSessions")), Math.round(numberFromRow(row, "sessions"))),
      averageSessionDuration: numberFromRow(row, "averageSessionDuration"),
      conversions: Math.round(numberFromRow(row, "conversions")),
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 8);

  const topPages = pageRows
    .map((row) => {
      const views = Math.round(numberFromRow(row, "screenPageViews"));
      const users = Math.round(numberFromRow(row, "totalUsers"));
      return {
        path: String(row.pagePathPlusQueryString || "/"),
        title: String(row.pageTitle || row.pagePathPlusQueryString || "/"),
        views,
        users,
        viewsPerUser: safeRatio(views, users),
        averageSessionDuration: numberFromRow(row, "averageSessionDuration"),
      };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);

  const toolUsage = summarizeToolUsage(toolUsageRows, eventRows);
  toolUsage.metrics.newUsers = toolUsage.metrics.newUsers || kpi.newUsers || 0;
  if (kpi.conversions === 0 && toolUsage.metrics.success > 0) {
    kpi.conversions = toolUsage.metrics.success;
    if (trend.length > 0 && trend.every((point) => point.conversions === 0)) {
      trend[trend.length - 1] = {
        ...trend[trend.length - 1],
        conversions: toolUsage.metrics.success,
      };
    }
  }

  const topReferralUrl = referralUrlRows
    .filter((row) => String(row.pageReferrer || "").trim())
    .sort((a, b) => numberFromRow(b, "sessions") - numberFromRow(a, "sessions"))[0];
  const topReferralKeyword = referralKeywordRows
    .filter((row) => String(row.sessionManualTerm || "").trim())
    .sort((a, b) => numberFromRow(b, "sessions") - numberFromRow(a, "sessions"))[0];
  const referralChannel = channels.find((channel) => channel.name.toLowerCase().includes("referral"));

  const createdAtValues = reports
    .map((report) => report.createdAt)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));

  const recentReports = reports
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 4);

  const lowVolumeWarning = kpi.sessions < 50 || kpi.users < 30
    ? "Düşük veri hacmi nedeniyle dönemsel değişimler oynak olabilir."
    : "";
  const emptyLatestAttemptWarning = latestAttemptWasEmpty
    ? `Son senkronizasyon (${latestAttemptDate}) boş veri döndürdü; dashboard son dolu arşivden (${latestDate}) gösteriliyor.`
    : "";

  const dataStatus = {
    timezone: manifest?.dataQuality?.timezone || "Bilinmiyor",
    freshness: latestDate === formatIsoDate(new Date()) ? "Bugun" : latestDate,
    thresholding: manifest?.dataQuality?.thresholding ? "Tespit edildi" : "Görünmüyor",
    sampling: manifest?.dataQuality?.sampling ? "Tespit edildi" : "Görünmüyor",
    quota: manifest?.dataQuality?.quota ? "Takip ediliyor" : "Bilinmiyor",
    warning: (manifest?.propertyMetadata?.stale ? "Metadata cache kullanılıyor. " : "") + (emptyLatestAttemptWarning || manifest?.warnings?.[0] || lowVolumeWarning),
    error: manifest?.errors?.[0] || latestAttemptManifest?.errors?.[0] || "",
  };

  return {
    accountId,
    lastSync: latestDate,
    lastSyncAt: createdAtValues[0] || "",
    kpi,
    previousKpi,
    trend,
    previousTrend,
    channels,
    landingPages,
    topPages,
    recentReports,
    toolUsage,
    dataStatus,
    trafficDetails: {
      uniqueHits: kpi.users,
      totalHits: kpi.views,
      referralKeyword: topReferralKeyword ? String(topReferralKeyword.sessionManualTerm || "") : "Yok",
      referralUrl: topReferralUrl ? String(topReferralUrl.pageReferrer || "") : "Yok",
      referralSessions: referralChannel?.sessions || Math.round(numberFromRow(topReferralUrl || {}, "sessions")),
    },
  };
}

async function exportReport(response, origin, params) {
  const index = await readIndex();
  const reportId = params.get("id");
  const report = index.reports.find((item) => item.id === reportId);
  if (!report) {
    sendJson(response, 404, { ok: false, message: "Rapor bulunamadı." }, origin);
    return;
  }

  const csv = await fs.readFile(report.path, "utf8");
  sendText(response, 200, csv, origin, report.name);
}

async function exportBundle(response, origin, params) {
  const index = await readIndex();
  const reports = filterReports(index, params);
  if (reports.length === 0) {
    sendJson(response, 404, { ok: false, message: "Paketlenecek rapor bulunamadı." }, origin);
    return;
  }

  const accountId = params.get("accountId") || "all";
  const date = params.get("date") || "range";
  const uniqueManifestKeys = [...new Set(reports.map((report) => `${report.accountId}:${report.date}`))];
  const manifests = (await Promise.all(uniqueManifestKeys.map(async (key) => {
    const [manifestAccountId, manifestDate] = key.split(":");
    return readManifest(manifestAccountId, manifestDate);
  }))).filter(Boolean);
  sendZip(response, origin, `${accountId}-${date}-ga-reports.zip`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (error) => response.destroy(error));
  archive.pipe(response);

  archive.append(JSON.stringify({
    exportedAt: new Date().toISOString(),
    requestedAccountId: accountId,
    requestedDate: date,
    reportCount: reports.length,
    reports,
    warnings: manifests.flatMap((manifest) => manifest.warnings || []),
    errors: manifests.flatMap((manifest) => manifest.errors || []),
    manifests,
  }, null, 2), { name: "manifest.json" });
  archive.append(buildIndexMarkdown(reports), { name: "index.md" });

  for (const report of reports) {
    archive.append(createReadStream(report.path), { name: `${report.accountId}/${report.date}/${basename(report.path)}` });
  }

  await archive.finalize();
}

function buildIndexMarkdown(reports) {
  return [
    "# Analytica Export",
    "",
    "| Account | Date | Category | Report | Rows |",
    "| --- | --- | --- | --- | ---: |",
    ...reports.map((report) => `| ${report.accountName} | ${report.date} | ${report.category} | ${report.name} | ${report.rows} |`),
    "",
  ].join("\n");
}

function shouldRunAutoSync(now, schedulerState) {
  if (!AUTO_SYNC_ENABLED) return false;
  if (autoSyncInProgress) return false;
  const today = formatIsoDate(now);
  if (schedulerState.lastRunDate === today) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = AUTO_SYNC_HOUR * 60 + AUTO_SYNC_MINUTE;
  return currentMinutes >= targetMinutes;
}

async function runAutoSyncIfDue() {
  const now = new Date();
  const schedulerState = await readSchedulerState();
  if (!shouldRunAutoSync(now, schedulerState)) return;

  autoSyncInProgress = true;
  try {
    const config = await readConfig();
    if (!getConfigStatus(config).ready) return;

    // Geniş pencere senkronla (son 60 gün + bugün). Dashboard tek bir en güncel
    // arşivi gösterir ve frontend bu trendi seçili aralığa göre filtreler; dar
    // pencere senkronu 7 Gün/30 Gün/Bugün görünümlerini bozuyordu. 60 gün,
    // "30 Gün" görünümünün gerçek önceki-30-gün karşılaştırması için gerekli.
    const dateRange = { startDate: "60daysAgo", endDate: "today" };
    for (const account of config.accounts) {
      await syncAccount(account.id, dateRange);
    }

    await writeSchedulerState({
      lastRunDate: formatIsoDate(now),
      lastRunAt: now.toISOString(),
      lastError: "",
    });
  } catch (error) {
    await writeSchedulerState({
      lastRunDate: schedulerState.lastRunDate,
      lastRunAt: schedulerState.lastRunAt,
      lastError: error instanceof Error ? error.message : "Otomatik sync başarısız.",
    });
  } finally {
    autoSyncInProgress = false;
  }
}

function startAutoSyncScheduler() {
  if (!AUTO_SYNC_ENABLED) return;
  const interval = setInterval(() => {
    void runAutoSyncIfDue();
  }, 60 * 1000);
  interval.unref?.();
  void runAutoSyncIfDue();
}

async function handleRequest(request, response) {
  const origin = request.headers.origin;
  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    const config = await readConfig();
    sendJson(response, 200, { ok: true, ...getConfigStatus(config), scheduler: await readSchedulerState() }, origin);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/config") {
    const config = await readConfig();
    sendJson(response, 200, { ok: true, config, status: getConfigStatus(config), presets: REPORT_DEFINITIONS.map(serializeReportDefinition) }, origin);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/auth/start") {
    await startOAuthFlow(response, origin, url.searchParams);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/auth/callback") {
    await completeOAuthFlow(response, origin, url.searchParams);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/config") {
    const body = await readRequestJson(request);
    const config = await updateConfig(body);
    sendJson(response, 200, { ok: true, config, status: getConfigStatus(config) }, origin);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/accounts") {
    const config = await readConfig();
    sendJson(response, 200, { ok: true, accounts: config.accounts, status: getConfigStatus(config) }, origin);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/reports") {
    const index = await readIndex();
    sendJson(response, 200, { ok: true, reports: await enrichReports(filterReports(index, url.searchParams)) }, origin);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/sync-history") {
    sendJson(response, 200, { ok: true, history: await buildSyncHistory(url.searchParams) }, origin);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/dashboard") {
    const accountId = String(url.searchParams.get("accountId") || "").trim();
    if (!accountId) throw new Error("accountId gerekli.");
    sendJson(response, 200, { ok: true, dashboard: await buildDashboardSummary(accountId) }, origin);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sync") {
    const body = await readRequestJson(request);
    const accountId = String(body.accountId || "").trim();
    if (!accountId) throw new Error("accountId gerekli.");
    const reports = await syncAccount(accountId, dateRangeFromBody(body));
    sendJson(response, 200, { ok: true, reports }, origin);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/export") {
    await exportReport(response, origin, url.searchParams);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/export-bundle") {
    await exportBundle(response, origin, url.searchParams);
    return;
  }

  sendJson(response, 404, { ok: false, message: "Not found." }, origin);
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    sendJson(response, 500, { ok: false, message: error instanceof Error ? error.message : "Beklenmeyen hata." }, request.headers.origin);
  });
});

await ensureDataDirs();
startAutoSyncScheduler();

server.listen(PORT, HOST, () => {
  console.log(`ga-report-bridge-server listening on http://${HOST}:${PORT}`);
});
