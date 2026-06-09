import type { Context } from "hono";
import type {
  HumanInterventionStatus,
  Menu,
  OrderLineItemOptionsSnapshot,
  OrderStatus,
} from "@42day/types";
import type { ApiBindings } from "../../lib/bindings";

export type TenantStatus = "active" | "inactive" | "suspended";

export type TenantRow = {
  id: string;
  name?: string;
  slug: string;
  schema_name: string;
  status?: TenantStatus;
  timezone?: string;
  currency?: string;
  automation_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type TenantUserRow = {
  tenant_id: string;
  user_id: string;
  role: "encargado" | "trabajador";
  status: "active" | "inactive";
  created_at?: string;
};

export type AdminAuthUser = {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string | null;
  user_metadata?: {
    name?: string;
    username?: string;
    source?: string;
  };
  app_metadata?: Record<string, unknown>;
};

export type LocationRow = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  delivery_fee_fixed: number;
  transfer_payment_instructions?: string | null;
  pickup_enabled?: boolean;
  delivery_enabled?: boolean;
  automation_enabled?: boolean;
  is_active: boolean;
};

export type ProductRow = {
  id: string;
  name: string;
  description?: string;
  base_price: number;
  category?: string;
  emoji?: string | null;
  product_type?: "simple" | "composite" | null;
  image_url?: string;
  is_active: boolean;
};

export type ProductOptionRow = {
  id: string;
  product_id: string;
  name: string;
  description?: string | null;
  type: "single" | "multiple" | "text";
  is_required: boolean;
  min_select: number;
  max_select: number;
  sort_order?: number | null;
  display_mode?: "list" | "buttons" | "swatches" | "text" | null;
};

export type ProductOptionValueRow = {
  id: string;
  option_id: string;
  name: string;
  description?: string | null;
  price_delta: number;
  is_active: boolean;
  sort_order?: number | null;
};

export type MenuRow = {
  id: string;
  location_id: string;
  date: string;
  name: string;
  status: Menu["status"];
  published_at?: string;
};

export type MenuItemRow = {
  id: string;
  menu_id: string;
  product_id?: string;
  combo_id?: string;
  display_name?: string;
  price_override?: number;
  available_quantity?: number;
  is_available: boolean;
  sort_order: number;
};

export type CustomerRow = {
  id: string;
  phone: string;
  name?: string;
};

export type OrderRow = {
  id: string;
  draft_order_id?: string | null;
  customer_id: string;
  location_id?: string | null;
  status: OrderStatus;
  fulfillment_type: "delivery" | "pickup";
  service_timing?: "asap" | "scheduled" | null;
  scheduled_for?: string | null;
  delivery_address?: string | null;
  delivery_address_id?: string | null;
  payment_method: "cash" | "transfer";
  payment_proof_file_id?: string | null;
  subtotal: number;
  delivery_fee: number;
  discount_total: number;
  total: number;
  restaurant_reviewed_at?: string | null;
  restaurant_reviewed_by?: string | null;
  restaurant_confirmed_at?: string | null;
  restaurant_confirmed_by?: string | null;
  restaurant_review_note?: string | null;
  restaurant_review_metadata?: Record<string, unknown> | null;
  customer_notified_at?: string | null;
  customer_notification_status?: "pending" | "sent" | "failed" | null;
  customer_notification_error?: string | null;
  payment_confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type DraftOrderRow = {
  id: string;
  conversation_id?: string | null;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  menu_item_id?: string | null;
  product_id?: string | null;
  combo_id?: string | null;
  category_snapshot?: string | null;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  options_snapshot?: OrderLineItemOptionsSnapshot | null;
  notes?: string | null;
  line_total: number;
};

export type PaymentProofRow = {
  id: string;
  conversation_id?: string | null;
  message_id?: string | null;
  draft_order_id?: string | null;
  order_id?: string | null;
  storage_bucket: string;
  storage_path: string;
  provider_media_id?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  status: "received" | "stored" | "review_pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

export type AlertRow = {
  id: string;
  conversation_id?: string | null;
  draft_order_id?: string | null;
  order_id?: string | null;
  type: string;
  status: HumanInterventionStatus;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  resolved_at?: string | null;
};

export type OrderNotificationContext = {
  order: OrderRow;
  customer: CustomerRow;
  draftOrder?: DraftOrderRow;
  location?: LocationRow;
};

export type AuthUser = {
  id: string;
  email?: string;
  app_metadata?: {
    role?: string;
    system_admin?: boolean;
  };
};

export type DashboardVariables = {
  authUser: AuthUser;
  authorizedTenants: TenantRow[];
  tenant: TenantRow;
};

export type DashboardContext = Context<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>;

export type GeminiMenuProduct = {
  name: string;
  description?: string;
  basePrice: number;
  category?: string;
  confidence?: number;
};
