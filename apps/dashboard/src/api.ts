import type {
  AutomationSettings,
  HumanInterventionAlert,
  MenuItem,
  OrderDetail,
  OrdersBucket,
  OrdersDashboardPayload,
  OrderStatus,
  Product,
  TodayMenuPayload,
} from "@42day/types";
import { getAccessToken } from "./auth";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export class DashboardApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly backendError?: string,
  ) {
    super(message);
  }
}

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
    const payload = await response.json().catch(() => undefined) as { error?: string } | undefined;
    const backendError = payload?.error;
    throw new DashboardApiError(
      backendError ? `${backendError} (${response.status})` : `dashboard_api_error:${response.status}`,
      response.status,
      path,
      backendError,
    );
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

export type DetectedMenuProduct = {
  name: string;
  description?: string;
  basePrice: number;
  category?: string;
  confidence?: number;
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

export function listOrders(tenantSlug: string, bucket: OrdersBucket = "pending_confirmation") {
  return request<OrdersDashboardPayload>(`/${tenantSlug}/orders?bucket=${bucket}`);
}

export function getOrder(tenantSlug: string, orderId: string) {
  return request<OrderDetail>(`/${tenantSlug}/orders/${orderId}`);
}

export function updateOrderStatus(
  tenantSlug: string,
  orderId: string,
  patch: {
    status?: OrderStatus;
    restaurantConfirmed?: boolean;
    paymentConfirmed?: boolean;
  },
) {
  return request(`/${tenantSlug}/orders/${orderId}/status`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function listAlerts(tenantSlug: string, status?: HumanInterventionAlert["status"]) {
  const suffix = status ? `?status=${status}` : "";
  return request<HumanInterventionAlert[]>(`/${tenantSlug}/alerts${suffix}`);
}

export function acknowledgeAlert(tenantSlug: string, alertId: string) {
  return request<HumanInterventionAlert>(`/${tenantSlug}/alerts/${alertId}/acknowledge`, {
    method: "PATCH",
  });
}

export function resolveAlert(tenantSlug: string, alertId: string) {
  return request<HumanInterventionAlert>(`/${tenantSlug}/alerts/${alertId}/resolve`, {
    method: "PATCH",
  });
}

export function getAutomationSettings(tenantSlug: string) {
  return request<AutomationSettings>(`/${tenantSlug}/settings/automation`);
}

export function updateAutomationSettings(tenantSlug: string, enabled: boolean) {
  return request<AutomationSettings>(`/${tenantSlug}/settings/automation`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
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

export function analyzeMenuImage(tenantSlug: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return request<{ products: DetectedMenuProduct[] }>(`/${tenantSlug}/uploads/menu-image/analyze`, {
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
