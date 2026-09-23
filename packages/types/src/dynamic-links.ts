export const DYNAMIC_LINK_DESTINATION_TYPES = [
  "google_review",
  "website",
  "menu",
  "whatsapp",
  "instagram",
  "profile",
] as const;

export type DynamicLinkDestinationType = (typeof DYNAMIC_LINK_DESTINATION_TYPES)[number];

export const DYNAMIC_LINK_STATUSES = ["available", "active", "suspended", "archived"] as const;

export type DynamicLinkStatus = (typeof DYNAMIC_LINK_STATUSES)[number];

export const DYNAMIC_LINK_SORT_FIELDS = ["updatedAt", "createdAt", "code", "label", "status"] as const;
export type DynamicLinkSortField = (typeof DYNAMIC_LINK_SORT_FIELDS)[number];
export type DynamicLinkSortDirection = "asc" | "desc";

export type DynamicLinkPageInfo = {
  hasNext: boolean;
  nextCursor?: string;
};

export type DynamicLinkUnit = {
  id: string;
  publicCode: string;
  publicUrl: string;
  batchId?: string;
  batchLabel?: string;
  label: string;
  tenantId?: string;
  tenantName?: string;
  locationId?: string;
  locationLabelSnapshot?: string;
  destinationType?: DynamicLinkDestinationType;
  destinationUrl?: string;
  profileId?: string;
  status: DynamicLinkStatus;
  revision: number;
  nfcUid?: string;
  qrPrintedAt?: string;
  nfcProgrammedAt?: string;
  nfcVerifiedAt?: string;
  nfcLockedAt?: string;
  activatedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type DynamicLinkPage = {
  units: DynamicLinkUnit[];
  totalCount: number;
  pageInfo: DynamicLinkPageInfo;
};

export type DynamicLinkBatch = {
  id: string;
  label: string;
  supplierReference?: string;
  notes?: string;
  createdAt: string;
  unitCount?: number;
};

export type DynamicLinkAuditEvent = {
  id: string;
  unitId: string;
  actorUserId?: string;
  eventType: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

/** Public dashboard contract. Omit tenantId to preserve; use null to clear it and its location. */
export type QuickDynamicLinkConfigurationRequest = {
  revision: number;
  label: string;
  destinationUrl?: string;
  tenantId?: string | null;
  target?: QuickDynamicLinkTarget;
};

export type QuickDynamicLinkProfileTarget = {
  kind: "profile";
  profileId?: string;
  creationRequestId?: string;
  slug?: string;
  displayName?: string;
  headline?: string;
  locationName?: string;
  address?: string;
  tenantId?: string | null;
  links?: Array<{ kind: string; label?: string; href: string; enabled: boolean; sortOrder?: number }>;
};

export type QuickDynamicLinkRedirectTarget = {
  kind: "redirect";
  destinationUrl: string;
  tenantId?: string | null;
};

export type QuickDynamicLinkTarget = QuickDynamicLinkProfileTarget | QuickDynamicLinkRedirectTarget;

export type BulkDynamicLinkUnitReference = { id: string; revision: number };
export type BulkDynamicLinkTarget =
  | { kind: "profile"; profileId: string }
  | { kind: "redirect"; destinationType: Exclude<DynamicLinkDestinationType, "profile">; destinationUrl: string; associationMode: "preserve" | "clear" | "set"; tenantId?: string };
export type BulkDynamicLinkPreflightRequest = { units: BulkDynamicLinkUnitReference[]; target: BulkDynamicLinkTarget };
export type BulkDynamicLinkPreflightItem = DynamicLinkUnit & { reason?: string };
export type BulkDynamicLinkPreflightResponse = {
  eligible: BulkDynamicLinkPreflightItem[];
  protected: BulkDynamicLinkPreflightItem[];
  excluded: Array<Partial<BulkDynamicLinkPreflightItem> & { id: string; reason: string }>;
  target: BulkDynamicLinkTarget;
};
export type BulkDynamicLinkApplyRequest = BulkDynamicLinkPreflightRequest & { operationId: string; consentedActiveUnitIds: string[] };
export type BulkDynamicLinkApplyResponse = { operationId: string; status: string; units: Array<{ id: string; publicCode: string; revision: number }>; completedAt: string };

export type NfcHandoffResponse = {
  provider: "nfc_cool";
  handoffUrl: string;
  shortcutName: "Escribir NFC ParaHoy";
  setupUrl: "https://nfc.cool/developers/";
};
export type NfcHandoffConsumeResponse = { sessionId: string; unitId: string; reportedUid?: string; reportedAt?: string };

export type GoogleReviewSourceKind =
  | "maps_short_link"
  | "maps_business_url"
  | "direct_review_url";

export type ResolveGoogleReviewDestinationRequest = {
  destinationUrl: string;
};

export type GoogleReviewResolution = {
  sourceKind: GoogleReviewSourceKind;
  reviewUrl: string;
  candidateLabel?: string;
  confirmationRequired: true;
};

export type ResolveGoogleReviewDestinationResponse = {
  resolution: GoogleReviewResolution;
};
