import type { MenuItem, Product, TodayMenuPayload } from "@42day/types";
import { getAccessToken } from "./auth";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const token = await getAccessToken();
  const headers = isFormData
    ? { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    : {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

  const response = await fetch(`${apiBaseUrl}/dashboard${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(`dashboard_api_error:${response.status}`);
  }

  return response.json() as Promise<T>;
}

export type DashboardTenant = {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
};

export type DashboardMe = {
  user: {
    id: string;
    email?: string;
  };
  tenants: DashboardTenant[];
};

export type DashboardDiagnostics = {
  tenant: string;
  schema: string;
  productsTable: boolean;
  productImageColumn: boolean;
  productImagesBucket: boolean;
};

export function listTenants() {
  return request<DashboardTenant[]>("/tenants");
}

export function getMe() {
  return request<DashboardMe>("/me");
}

export function getDiagnostics(tenantSlug: string) {
  return request<DashboardDiagnostics>(`/${tenantSlug}/diagnostics`);
}

export function getTodayMenu(tenantSlug: string) {
  return request<TodayMenuPayload>(`/${tenantSlug}/menu/today`);
}

export function createProduct(tenantSlug: string, product: Partial<Product>) {
  return request<Product>(`/${tenantSlug}/products`, {
    method: "POST",
    body: JSON.stringify(product),
  });
}

export function uploadProductImage(tenantSlug: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return request<{ bucket: string; path: string; publicUrl: string }>(`/${tenantSlug}/uploads/product-image`, {
    method: "POST",
    body: formData,
    headers: {},
  });
}

export function updateProduct(tenantSlug: string, productId: string, patch: Partial<Product>) {
  return request<Product>(`/${tenantSlug}/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteProduct(tenantSlug: string, productId: string) {
  return request<{ ok: true }>(`/${tenantSlug}/products/${productId}`, {
    method: "DELETE",
  });
}

export function addMenuItem(tenantSlug: string, productId: string) {
  return request<MenuItem>(`/${tenantSlug}/menu/today/items`, {
    method: "POST",
    body: JSON.stringify({ productId }),
  });
}

export function updateMenuItem(tenantSlug: string, itemId: string, patch: Partial<MenuItem>) {
  return request<MenuItem>(`/${tenantSlug}/menu/today/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteMenuItem(tenantSlug: string, itemId: string) {
  return request<{ ok: true }>(`/${tenantSlug}/menu/today/items/${itemId}`, {
    method: "DELETE",
  });
}
