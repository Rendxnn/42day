export const BUSINESS_PROFILE_LINK_KINDS = [
  "menu",
  "google_review",
  "instagram",
  "tiktok",
  "website",
  "whatsapp",
  "phone",
  "facebook",
  "maps",
  "survey",
  "custom",
] as const;

export type BusinessProfileLinkKind = (typeof BUSINESS_PROFILE_LINK_KINDS)[number];
export type BusinessProfileStatus = "draft" | "published" | "disabled";

export type BusinessProfileLink = {
  id?: string;
  kind: BusinessProfileLinkKind;
  label?: string;
  href: string;
  enabled: boolean;
  sortOrder: number;
};

export type BusinessProfile = {
  id: string;
  creationRequestId?: string;
  slug: string;
  tenantId?: string;
  displayName: string;
  headline?: string;
  locationName?: string;
  address?: string;
  status: BusinessProfileStatus;
  revision: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type BusinessProfilePayload = {
  profile: Pick<BusinessProfile, "slug" | "displayName" | "headline" | "locationName" | "address">;
  links: Array<Pick<BusinessProfileLink, "kind" | "label" | "href" | "sortOrder">>;
};

export type CreateBusinessProfileRequest = {
  requestId: string;
  slug?: string;
  displayName: string;
  headline?: string;
  locationName?: string;
  address?: string;
  tenantId?: string | null;
};

export type UpdateBusinessProfileRequest = {
  revision: number;
  displayName: string;
  headline?: string;
  locationName?: string;
  address?: string;
  links: BusinessProfileLink[];
};

export type BusinessProfileResponse = {
  profile: BusinessProfile;
  links: BusinessProfileLink[];
  activeQrCount?: number;
};
