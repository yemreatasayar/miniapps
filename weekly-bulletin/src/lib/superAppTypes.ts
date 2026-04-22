export type MiniAppDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  logoText: string;
  accentColor: string;
  status: "ready" | "draft";
  createdAt: string;
};

export type Customer = {
  id: string;
  name: string;
  city: string;
  note: string;
  createdAt: string;
};

export type CustomerAppLink = {
  id: string;
  customerId: string;
  appId: string;
  connectedAt: string;
};

export type SecurityConfig = {
  pinHash: string;
  recoveryKeyHash: string;
  recoveryKeyPreview: string;
  configuredAt: string;
};

export type SuperAppState = {
  customers: Customer[];
  apps: MiniAppDefinition[];
  links: CustomerAppLink[];
  selectedCustomerId: string | null;
  security: SecurityConfig | null;
};
