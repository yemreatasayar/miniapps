import { Customer, SecurityConfig, SuperAppState } from "./superAppTypes";

const SUPER_APP_STORAGE_KEY = "miniapps-super-app-state-v1";

function nowIso(): string {
  return new Date().toISOString();
}

function defaultCustomers(now: string): Customer[] {
  return [
    {
      id: "customer-mmo-istanbul",
      name: "MMO İstanbul Şubesi",
      city: "İstanbul",
      note: "İlk bağlı müşteri.",
      createdAt: now,
    },
  ];
}

export function createDefaultSuperAppState(): SuperAppState {
  const now = nowIso();
  const customers = defaultCustomers(now);
  const apps = [
    {
      id: "weekly-bulletin",
      name: "Weekly Bulletin",
      description: "Şube bülteni üretimi için lokal çalışan mini app.",
      category: "İletişim",
      logoText: "WB",
      accentColor: "#4f7cff",
      status: "ready" as const,
      createdAt: now,
    },
  ];

  return {
    customers,
    apps,
    links: [
      {
        id: crypto.randomUUID(),
        customerId: customers[0].id,
        appId: apps[0].id,
        connectedAt: now,
      },
    ],
    selectedCustomerId: customers[0].id,
    security: null,
  };
}

export function loadSuperAppState(): SuperAppState {
  try {
    const raw = localStorage.getItem(SUPER_APP_STORAGE_KEY);
    if (!raw) {
      return createDefaultSuperAppState();
    }

    const parsed = JSON.parse(raw) as Partial<SuperAppState>;
    const fallback = createDefaultSuperAppState();

    return {
      customers: parsed.customers ?? fallback.customers,
      apps: parsed.apps ?? fallback.apps,
      links: parsed.links ?? fallback.links,
      selectedCustomerId: parsed.selectedCustomerId ?? fallback.selectedCustomerId,
      security: parsed.security ?? null,
    };
  } catch {
    return createDefaultSuperAppState();
  }
}

export function saveSuperAppState(state: SuperAppState): void {
  localStorage.setItem(SUPER_APP_STORAGE_KEY, JSON.stringify(state));
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function createRecoveryKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const groups = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("")
  );

  return groups.join("-");
}

export async function createSecurityConfig(pin: string): Promise<{ security: SecurityConfig; recoveryKey: string }> {
  const recoveryKey = createRecoveryKey();
  const [pinHash, recoveryKeyHash] = await Promise.all([sha256(pin), sha256(recoveryKey)]);

  return {
    security: {
      pinHash,
      recoveryKeyHash,
      recoveryKeyPreview: recoveryKey.slice(-4),
      configuredAt: nowIso(),
    },
    recoveryKey,
  };
}

export async function matchesSecret(secret: string, hash: string): Promise<boolean> {
  return (await sha256(secret)) === hash;
}
