import { Hono } from "hono";
import type { Context } from "hono";
import type {
  AutomationSettings,
  HumanInterventionAlert,
  HumanInterventionStatus,
  Menu,
  MenuItem,
  OrderDetail,
  OrderLineItem,
  OrdersBucket,
  OrdersDashboardPayload,
  OrderStatus,
  OrderSummary,
  Product,
  TodayMenuPayload,
} from "@42day/types";
import type { ApiBindings } from "../lib/bindings";
import { createSupabaseRestClient, SupabaseRestError } from "../lib/supabase-rest";

type TenantRow = {
  id: string;
  name?: string;
  slug: string;
  schema_name: string;
  timezone?: string;
};

type TenantUserRow = {
  tenant_id: string;
  user_id: string;
  role: "encargado" | "trabajador";
  status: "active" | "inactive";
};

type LocationRow = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  delivery_fee_fixed: number;
  automation_enabled?: boolean;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  description?: string;
  base_price: number;
  category?: string;
  image_url?: string;
  is_active: boolean;
};

type MenuRow = {
  id: string;
  location_id: string;
  date: string;
  name: string;
  status: Menu["status"];
  published_at?: string;
};

type MenuItemRow = {
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

type CustomerRow = {
  id: string;
  phone: string;
  name?: string;
};

type OrderRow = {
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
  restaurant_confirmed_at?: string | null;
  payment_confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id?: string | null;
  combo_id?: string | null;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  options_snapshot?: Record<string, unknown> | null;
  notes?: string | null;
  line_total: number;
};

type AlertRow = {
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

type DashboardVariables = {
  authUser: AuthUser;
  authorizedTenants: TenantRow[];
  tenant: TenantRow;
};

type AuthUser = {
  id: string;
  email?: string;
};

type GeminiMenuProduct = {
  name: string;
  description?: string;
  basePrice: number;
  category?: string;
  confidence?: number;
};

export const dashboardRoutes = new Hono<{
  Bindings: ApiBindings;
  Variables: DashboardVariables;
}>();

dashboardRoutes.get("/tenants", async (c) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;
  const tenants = await getAuthorizedTenants(c.env, authUser.id);

  return c.json(
    tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      schemaName: tenant.schema_name,
    })),
  );
});

dashboardRoutes.get("/me", async (c) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;
  const tenants = await getAuthorizedTenants(c.env, authUser.id);

  return c.json({
    user: authUser,
    tenants: tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      schemaName: tenant.schema_name,
    })),
  });
});

dashboardRoutes.use("/:tenantSlug/*", async (c, next) => {
  const authUser = await requireAuthUser(c);
  if (authUser instanceof Response) return authUser;
  const supabase = createSupabaseRestClient(c.env);
  const tenants = await getAuthorizedTenants(c.env, authUser.id);
  const tenant = tenants.find((entry) => entry.slug === c.req.param("tenantSlug"));

  if (!tenant) {
    return c.json({ error: "tenant_not_found" }, 404);
  }

  c.set("authUser", authUser);
  c.set("authorizedTenants", tenants);
  c.set("tenant", tenant);
  await next();
});

dashboardRoutes.get("/:tenantSlug/menu/today", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const date = resolveBusinessDate(c.req.query("date"), tenant.timezone);
  const [location] = await supabase.select<LocationRow>({
    schema: tenant.schema_name,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  const [menu] = location
    ? await supabase.select<MenuRow>({
        schema: tenant.schema_name,
        table: "menus",
        query: {
          select: "id,location_id,date,name,status,published_at",
          location_id: `eq.${location.id}`,
          date: `eq.${date}`,
          limit: 1,
        },
      })
    : [];

  const products = await selectProducts(supabase, tenant.schema_name);

  const itemRows = menu
    ? await supabase.select<MenuItemRow>({
        schema: tenant.schema_name,
        table: "menu_items",
        query: {
          select: "id,menu_id,product_id,combo_id,display_name,price_override,available_quantity,is_available,sort_order",
          menu_id: `eq.${menu.id}`,
          order: "sort_order.asc",
        },
      })
    : [];

  const productById = new Map(products.map((product) => [product.id, mapProduct(product)]));
  const payload: TodayMenuPayload = {
    tenantSlug: tenant.slug,
    tenantSchema: tenant.schema_name,
    location: location ? mapLocation(location) : undefined,
    menu: menu ? mapMenu(menu) : undefined,
    items: itemRows.map((item) => mapMenuItem(item, productById.get(item.product_id ?? ""))),
    products: products.map(mapProduct),
  };

  return c.json(payload);
});

dashboardRoutes.get("/:tenantSlug/orders", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const bucket = parseOrdersBucket(c.req.query("bucket"));
  let orders: OrderRow[] = [];
  let customers: CustomerRow[] = [];
  let alerts: AlertRow[] = [];

  try {
    [orders, customers, alerts] = await Promise.all([
      supabase.select<OrderRow>({
        schema: tenant.schema_name,
        table: "orders",
        query: {
          select:
            "id,draft_order_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,payment_proof_file_id,subtotal,delivery_fee,discount_total,total,restaurant_confirmed_at,payment_confirmed_at,created_at,updated_at",
          order: "created_at.desc",
          limit: 200,
        },
      }),
      supabase.select<CustomerRow>({
        schema: tenant.schema_name,
        table: "customers",
        query: {
          select: "id,phone,name",
          limit: 500,
        },
      }),
      selectAlerts(supabase, tenant.schema_name, {
        limit: 200,
      }),
    ]);
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const summaries = orders.map((order) => mapOrderSummary(order, customerById.get(order.customer_id)));
  const filteredOrders = summaries.filter((order) => matchesOrdersBucket(order, bucket));
  const openAlerts = alerts.filter((alert) => alert.status === "open");
  const payload: OrdersDashboardPayload = {
    bucket,
    counts: {
      pendingConfirmation: summaries.filter((order) => matchesOrdersBucket(order, "pending_confirmation")).length,
      active: summaries.filter((order) => matchesOrdersBucket(order, "active")).length,
      history: summaries.filter((order) => matchesOrdersBucket(order, "history")).length,
      transferPendingReview: summaries.filter(
        (order) => order.paymentMethod === "transfer" && !order.paymentConfirmedAt,
      ).length,
      openAlerts: openAlerts.length,
    },
    orders: filteredOrders,
  };

  return c.json(payload);
});

dashboardRoutes.get("/:tenantSlug/orders/:orderId", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  let order: OrderRow | undefined;

  try {
    [order] = await supabase.select<OrderRow>({
      schema: tenant.schema_name,
      table: "orders",
      query: {
        select:
          "id,draft_order_id,customer_id,location_id,status,fulfillment_type,service_timing,scheduled_for,delivery_address,delivery_address_id,payment_method,payment_proof_file_id,subtotal,delivery_fee,discount_total,total,restaurant_confirmed_at,payment_confirmed_at,created_at,updated_at",
        id: `eq.${c.req.param("orderId")}`,
        limit: 1,
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return c.json({ error: "order_module_unavailable" }, 404);
    }

    throw error;
  }

  if (!order) {
    return c.json({ error: "order_not_found" }, 404);
  }

  const [customer, items] = await Promise.all([
    supabase.select<CustomerRow>({
      schema: tenant.schema_name,
      table: "customers",
      query: {
        select: "id,phone,name",
        id: `eq.${order.customer_id}`,
        limit: 1,
      },
    }),
    supabase.select<OrderItemRow>({
      schema: tenant.schema_name,
      table: "order_items",
      query: {
        select: "id,order_id,product_id,combo_id,name_snapshot,quantity,unit_price,options_snapshot,notes,line_total",
        order_id: `eq.${order.id}`,
      },
    }),
  ]);

  const detail: OrderDetail = {
    ...mapOrderSummary(order, customer[0]),
    locationId: order.location_id ?? undefined,
    deliveryAddress: order.delivery_address ?? undefined,
    deliveryAddressId: order.delivery_address_id ?? undefined,
    items: items.map(mapOrderLineItem),
  };

  return c.json(detail);
});

dashboardRoutes.patch("/:tenantSlug/orders/:orderId/status", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<{
    status?: OrderStatus;
    restaurantConfirmed?: boolean;
    paymentConfirmed?: boolean;
  }>();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    updated_at: now,
  };

  if (body.status !== undefined) {
    patch.status = body.status;
  }

  if (body.restaurantConfirmed === true) {
    patch.restaurant_confirmed_at = now;
  }

  if (body.restaurantConfirmed === false) {
    patch.restaurant_confirmed_at = null;
  }

  if (body.paymentConfirmed === true) {
    patch.payment_confirmed_at = now;
  }

  if (body.paymentConfirmed === false) {
    patch.payment_confirmed_at = null;
  }

  let order: OrderRow | undefined;

  try {
    [order] = await createSupabaseRestClient(c.env).updateReturning<OrderRow>({
      schema: tenant.schema_name,
      table: "orders",
      query: { id: `eq.${c.req.param("orderId")}` },
      patch,
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return c.json({ error: "order_module_unavailable" }, 404);
    }

    throw error;
  }

  if (!order) {
    return c.json({ error: "order_not_found" }, 404);
  }

  const [customer] = await createSupabaseRestClient(c.env).select<CustomerRow>({
    schema: tenant.schema_name,
    table: "customers",
    query: {
      select: "id,phone,name",
      id: `eq.${order.customer_id}`,
      limit: 1,
    },
  });

  return c.json(mapOrderSummary(order, customer));
});

dashboardRoutes.get("/:tenantSlug/alerts", async (c) => {
  const tenant = c.get("tenant");
  let alerts: AlertRow[] = [];

  try {
    alerts = await selectAlerts(createSupabaseRestClient(c.env), tenant.schema_name, {
      status: c.req.query("status") as HumanInterventionStatus | undefined,
      limit: 200,
    });
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  return c.json(alerts.map(mapAlert));
});

dashboardRoutes.patch("/:tenantSlug/alerts/:alertId/acknowledge", async (c) => {
  const tenant = c.get("tenant");
  let alert: AlertRow | undefined;

  try {
    [alert] = await createSupabaseRestClient(c.env).updateReturning<AlertRow>({
      schema: tenant.schema_name,
      table: "human_intervention_alerts",
      query: {
        id: `eq.${c.req.param("alertId")}`,
      },
      patch: {
        status: "acknowledged",
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return c.json({ error: "order_module_unavailable" }, 404);
    }

    throw error;
  }

  if (!alert) {
    return c.json({ error: "alert_not_found" }, 404);
  }

  return c.json(mapAlert(alert));
});

dashboardRoutes.patch("/:tenantSlug/alerts/:alertId/resolve", async (c) => {
  const tenant = c.get("tenant");
  let alert: AlertRow | undefined;

  try {
    [alert] = await createSupabaseRestClient(c.env).updateReturning<AlertRow>({
      schema: tenant.schema_name,
      table: "human_intervention_alerts",
      query: {
        id: `eq.${c.req.param("alertId")}`,
      },
      patch: {
        status: "resolved",
        resolved_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return c.json({ error: "order_module_unavailable" }, 404);
    }

    throw error;
  }

  if (!alert) {
    return c.json({ error: "alert_not_found" }, 404);
  }

  return c.json(mapAlert(alert));
});

dashboardRoutes.get("/:tenantSlug/settings/automation", async (c) => {
  const tenant = c.get("tenant");
  const [location] = await createSupabaseRestClient(c.env).select<LocationRow>({
    schema: tenant.schema_name,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,automation_enabled,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  const payload: AutomationSettings = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantAutomationEnabled: true,
    locationAutomationEnabled: location?.automation_enabled,
  };

  const [tenantRow] = await createSupabaseRestClient(c.env).select<TenantRow & { automation_enabled: boolean }>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,slug,schema_name,timezone,automation_enabled",
      id: `eq.${tenant.id}`,
      limit: 1,
    },
  });

  payload.tenantAutomationEnabled = tenantRow?.automation_enabled ?? true;

  return c.json(payload);
});

dashboardRoutes.patch("/:tenantSlug/settings/automation", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<{ enabled: boolean }>();
  const supabase = createSupabaseRestClient(c.env);
  const [location] = await supabase.select<LocationRow>({
    schema: tenant.schema_name,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,automation_enabled,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  await Promise.all([
    supabase.update({
      schema: "control",
      table: "tenants",
      values: {
        automation_enabled: body.enabled,
        updated_at: new Date().toISOString(),
      },
      query: {
        id: `eq.${tenant.id}`,
      },
    }),
    location
      ? supabase.update({
          schema: tenant.schema_name,
          table: "locations",
          values: {
            automation_enabled: body.enabled,
            updated_at: new Date().toISOString(),
          },
          query: {
            id: `eq.${location.id}`,
          },
        })
      : Promise.resolve([]),
  ]);

  return c.json({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantAutomationEnabled: body.enabled,
    locationAutomationEnabled: location ? body.enabled : undefined,
  } satisfies AutomationSettings);
});

dashboardRoutes.post("/:tenantSlug/products", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<Partial<Product>>();
  const supabase = createSupabaseRestClient(c.env);
  const rows = {
    name: body.name,
    description: body.description ?? null,
    base_price: body.basePrice ?? 0,
    category: body.category ?? null,
    ...(body.imageUrl !== undefined ? { image_url: body.imageUrl } : {}),
    is_active: body.isActive ?? true,
  };
  let productRows: ProductRow[];

  try {
    productRows = await supabase.insertReturning<ProductRow>({
      schema: tenant.schema_name,
      table: "products",
      rows,
    });
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 400 && error.body.includes("image_url")) {
      const { image_url: _imageUrl, ...rowsWithoutImage } = rows;
      productRows = await supabase.insertReturning<ProductRow>({
        schema: tenant.schema_name,
        table: "products",
        rows: rowsWithoutImage,
      });
    } else {
      throw error;
    }
  }

  const [product] = productRows;

  if (!product) {
    return c.json({ error: "product_create_failed" }, 500);
  }

  return c.json(mapProduct(product), 201);
});

dashboardRoutes.post("/:tenantSlug/uploads/menu-image/analyze", async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;

  if (!(file instanceof File)) {
    return c.json({ error: "image_file_required" }, 400);
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return c.json({ error: "unsupported_image_type" }, 400);
  }

  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "replace-me") {
    return c.json({ error: "gemini_not_configured" }, 500);
  }

  const imageBase64 = arrayBufferToBase64(await file.arrayBuffer());
  const prompt = [
    "Eres un extractor de menus de restaurante en Colombia. Tu prioridad es capturar nombre, precio, categoria y descripcion completa de cada plato.",
    "Lee la imagen y devuelve SOLO JSON valido, sin markdown.",
    "Extrae platos vendibles del menu con precio en COP.",
    "Si un precio tiene puntos o separadores, conviertelo a entero.",
    "Ignora encabezados, horarios, telefonos, redes sociales y textos decorativos.",
    "La descripcion es obligatoria cuando exista texto debajo o al lado del nombre del plato.",
    "Para desayunos, la descripcion suele ser la linea siguiente con ingredientes como arepa, huevos, cafe, queso, pan o frutas.",
    "Para almuerzos, conserva acompanamientos e ingredientes: entrada, principio, seco, carne, ensalada, papas, arroz, bebida, etc.",
    "Para adiciones, si no hay descripcion separada, usa el mismo nombre como descripcion corta.",
    "Clasifica category usando una de estas etiquetas cuando aplique: desayuno, almuerzo, adicion. Si no aplica, usa otra categoria corta en singular.",
    "No inventes ingredientes que no aparezcan. Si una descripcion continua en varias lineas, unelas en una sola frase.",
    "Si el precio dice 'segun pescado', 'segun peso' o similar y no hay numero, omite ese producto.",
    'Formato exacto: {"products":[{"name":"string","description":"string","basePrice":12345,"category":"string","confidence":0.9}]}',
    "Usa nombres cortos y claros. No dejes description vacio si la imagen muestra ingredientes o acompanamientos.",
    "Si no detectas platos, devuelve {\"products\":[]}.",
  ].join("\n");

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: file.type,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("gemini_menu_analysis_failed", { status: response.status, body: errorText.slice(0, 500) });
    if (response.status === 429) {
      return c.json({ error: "gemini_quota_exhausted" }, 429);
    }

    return c.json({ error: "gemini_menu_analysis_failed" }, 502);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  const products = parseGeminiMenuProducts(text);

  return c.json({ products });
});

dashboardRoutes.post("/:tenantSlug/uploads/product-image", async (c) => {
  const tenant = c.get("tenant");
  const form = await c.req.parseBody();
  const file = form.file;

  if (!(file instanceof File)) {
    return c.json({ error: "image_file_required" }, 400);
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return c.json({ error: "unsupported_image_type" }, 400);
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `${tenant.slug}/products/${crypto.randomUUID()}.${extension}`;
  const upload = await createSupabaseRestClient(c.env).uploadObject({
    bucket: "product-images",
    path: storagePath,
    body: file,
    contentType: file.type,
  });

  return c.json({
    bucket: "product-images",
    path: upload.path,
    publicUrl: upload.publicUrl,
  });
});

dashboardRoutes.patch("/:tenantSlug/products/:productId", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<Partial<Product>>();
  const [product] = await createSupabaseRestClient(c.env).updateReturning<ProductRow>({
    schema: tenant.schema_name,
    table: "products",
    query: { id: `eq.${c.req.param("productId")}` },
    patch: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.basePrice !== undefined ? { base_price: body.basePrice } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.imageUrl !== undefined ? { image_url: body.imageUrl } : {}),
      ...(body.isActive !== undefined ? { is_active: body.isActive } : {}),
      updated_at: new Date().toISOString(),
    },
  });

  if (!product) {
    return c.json({ error: "product_not_found" }, 404);
  }

  return c.json(mapProduct(product));
});

dashboardRoutes.get("/:tenantSlug/diagnostics", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const checks: Record<string, boolean | string> = {
    tenant: tenant.slug,
    schema: tenant.schema_name,
    productsTable: false,
    productImageColumn: false,
    productImagesBucket: false,
  };

  try {
    await supabase.select<ProductRow>({
      schema: tenant.schema_name,
      table: "products",
      query: {
        select: "id",
        limit: 1,
      },
    });
    checks.productsTable = true;
  } catch {
    checks.productsTable = false;
  }

  try {
    await supabase.select<ProductRow>({
      schema: tenant.schema_name,
      table: "products",
      query: {
        select: "image_url",
        limit: 1,
      },
    });
    checks.productImageColumn = true;
  } catch {
    checks.productImageColumn = false;
  }

  const bucketResponse = await fetch(`${c.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/bucket/product-images`, {
    headers: {
      apikey: c.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  checks.productImagesBucket = bucketResponse.ok;

  return c.json(checks);
});

dashboardRoutes.delete("/:tenantSlug/products/:productId", async (c) => {
  const tenant = c.get("tenant");
  await createSupabaseRestClient(c.env).updateReturning<ProductRow>({
    schema: tenant.schema_name,
    table: "products",
    query: { id: `eq.${c.req.param("productId")}` },
    patch: {
      is_active: false,
      updated_at: new Date().toISOString(),
    },
  });

  return c.json({ ok: true });
});

dashboardRoutes.post("/:tenantSlug/menu/today/items", async (c) => {
  const tenant = c.get("tenant");
  const supabase = createSupabaseRestClient(c.env);
  const body = await c.req.json<{ productId: string; date?: string }>();
  const menu = await findOrCreateTodayMenu(supabase, tenant.schema_name, tenant.timezone, body.date);
  const nextSortOrder = await getNextMenuSortOrder(supabase, tenant.schema_name, menu.id);
  const [product] = await selectProducts(supabase, tenant.schema_name, {
      id: `eq.${body.productId}`,
      is_active: "eq.true",
      limit: 1,
  });

  if (!product) {
    return c.json({ error: "product_not_found" }, 404);
  }

  const [item] = await supabase.insertReturning<MenuItemRow>({
    schema: tenant.schema_name,
    table: "menu_items",
    rows: {
      menu_id: menu.id,
      product_id: product.id,
      display_name: product.name,
      price_override: product.base_price,
      is_available: true,
      sort_order: nextSortOrder,
    },
  });

  if (!item) {
    return c.json({ error: "menu_item_create_failed" }, 500);
  }

  return c.json(mapMenuItem(item, mapProduct(product)), 201);
});

dashboardRoutes.patch("/:tenantSlug/menu/today/items/:itemId", async (c) => {
  const tenant = c.get("tenant");
  const body = await c.req.json<Partial<MenuItem>>();
  const [item] = await createSupabaseRestClient(c.env).updateReturning<MenuItemRow>({
    schema: tenant.schema_name,
    table: "menu_items",
    query: { id: `eq.${c.req.param("itemId")}` },
    patch: {
      ...(body.displayName !== undefined ? { display_name: body.displayName } : {}),
      ...(body.priceOverride !== undefined ? { price_override: body.priceOverride } : {}),
      ...(body.availableQuantity !== undefined ? { available_quantity: body.availableQuantity } : {}),
      ...(body.isAvailable !== undefined ? { is_available: body.isAvailable } : {}),
      ...(body.sortOrder !== undefined ? { sort_order: body.sortOrder } : {}),
    },
  });

  if (!item) {
    return c.json({ error: "menu_item_not_found" }, 404);
  }

  return c.json(mapMenuItem(item));
});

dashboardRoutes.delete("/:tenantSlug/menu/today/items/:itemId", async (c) => {
  const tenant = c.get("tenant");
  await createSupabaseRestClient(c.env).delete({
    schema: tenant.schema_name,
    table: "menu_items",
    query: { id: `eq.${c.req.param("itemId")}` },
  });

  return c.json({ ok: true });
});

async function findOrCreateTodayMenu(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  timezone?: string,
  requestedDate?: string,
): Promise<MenuRow> {
  const date = resolveBusinessDate(requestedDate, timezone);
  const [location] = await supabase.select<LocationRow>({
    schema,
    table: "locations",
    query: {
      select: "id,name,address,phone,delivery_fee_fixed,is_active",
      is_active: "eq.true",
      limit: 1,
    },
  });

  if (!location) {
    throw new Error("active_location_not_found");
  }

  const [existing] = await supabase.select<MenuRow>({
    schema,
    table: "menus",
    query: {
      select: "id,location_id,date,name,status,published_at",
      location_id: `eq.${location.id}`,
      date: `eq.${date}`,
      limit: 1,
    },
  });

  if (existing) {
    return existing;
  }

  const [menu] = await supabase.insertReturning<MenuRow>({
    schema,
    table: "menus",
    rows: {
      location_id: location.id,
      date,
      name: "Menu de hoy",
      status: "published",
      published_at: new Date().toISOString(),
    },
  });

  if (!menu) {
    throw new Error("menu_create_failed");
  }

  return menu;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function parseGeminiMenuProducts(text: string): GeminiMenuProduct[] {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(normalized) as { products?: unknown[] };

  return (parsed.products ?? [])
    .map((entry) => {
      const product = entry as Partial<GeminiMenuProduct>;
      return {
        name: String(product.name ?? "").trim(),
        description: product.description ? String(product.description).trim() : undefined,
        basePrice: Number(product.basePrice ?? 0),
        category: product.category ? String(product.category).trim() : undefined,
        confidence: product.confidence === undefined ? undefined : Number(product.confidence),
      };
    })
    .filter((product) => product.name && Number.isFinite(product.basePrice) && product.basePrice > 0)
    .slice(0, 30);
}

async function selectProducts(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<ProductRow[]> {
  try {
    return await supabase.select<ProductRow>({
      schema,
      table: "products",
      query: {
        select: "id,name,description,base_price,category,image_url,is_active",
        order: "name.asc",
        is_active: "eq.true",
        ...query,
      },
    });
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 400 && error.body.includes("image_url")) {
      return supabase.select<ProductRow>({
        schema,
        table: "products",
        query: {
          select: "id,name,description,base_price,category,is_active",
          order: "name.asc",
          is_active: "eq.true",
          ...query,
        },
      });
    }

    throw error;
  }
}

async function getNextMenuSortOrder(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  menuId: string,
): Promise<number> {
  const [lastItem] = await supabase.select<Pick<MenuItemRow, "sort_order">>({
    schema,
    table: "menu_items",
    query: {
      select: "sort_order",
      menu_id: `eq.${menuId}`,
      order: "sort_order.desc",
      limit: 1,
    },
  });

  return (lastItem?.sort_order ?? 0) + 10;
}

async function selectAlerts(
  supabase: ReturnType<typeof createSupabaseRestClient>,
  schema: string,
  options: {
    status?: HumanInterventionStatus;
    limit?: number;
  } = {},
): Promise<AlertRow[]> {
  return supabase.select<AlertRow>({
    schema,
    table: "human_intervention_alerts",
    query: {
      select: "id,conversation_id,draft_order_id,order_id,type,status,title,description,metadata,created_at,resolved_at",
      ...(options.status ? { status: `eq.${options.status}` } : {}),
      order: "created_at.desc",
      limit: options.limit ?? 100,
    },
  });
}

function parseOrdersBucket(rawBucket?: string): OrdersBucket {
  if (rawBucket === "pending_confirmation" || rawBucket === "active" || rawBucket === "history" || rawBucket === "all") {
    return rawBucket;
  }

  return "pending_confirmation";
}

function matchesOrdersBucket(order: OrderSummary, bucket: OrdersBucket): boolean {
  if (bucket === "all") {
    return true;
  }

  if (bucket === "pending_confirmation") {
    return !order.restaurantConfirmedAt;
  }

  if (bucket === "active") {
    return Boolean(order.restaurantConfirmedAt) && !["delivered", "cancelled"].includes(order.status);
  }

  return ["delivered", "cancelled"].includes(order.status);
}

function mapOrderSummary(row: OrderRow, customer?: CustomerRow): OrderSummary {
  return {
    id: row.id,
    draftOrderId: row.draft_order_id ?? undefined,
    customerId: row.customer_id,
    customerPhone: customer?.phone,
    customerName: customer?.name,
    status: row.status,
    fulfillmentType: row.fulfillment_type,
    serviceTiming: row.service_timing ?? "asap",
    scheduledFor: row.scheduled_for ?? undefined,
    paymentMethod: row.payment_method,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    discountTotal: row.discount_total,
    total: row.total,
    restaurantConfirmedAt: row.restaurant_confirmed_at ?? undefined,
    paymentConfirmedAt: row.payment_confirmed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrderLineItem(row: OrderItemRow): OrderLineItem {
  return {
    productId: row.product_id ?? undefined,
    comboId: row.combo_id ?? undefined,
    name: row.name_snapshot,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    options: row.options_snapshot ?? undefined,
    notes: row.notes ?? undefined,
    lineTotal: row.line_total,
  };
}

function mapAlert(row: AlertRow): HumanInterventionAlert {
  return {
    id: row.id,
    conversationId: row.conversation_id ?? undefined,
    draftOrderId: row.draft_order_id ?? undefined,
    orderId: row.order_id ?? undefined,
    type: row.type as HumanInterventionAlert["type"],
    status: row.status,
    title: row.title,
    description: row.description ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

function isMissingTableError(error: unknown): error is SupabaseRestError {
  return (
    error instanceof SupabaseRestError &&
    (error.body.includes("Could not find the table") ||
      error.body.includes("relation") ||
      error.body.includes("does not exist"))
  );
}

function mapLocation(row: LocationRow) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    deliveryFeeFixed: row.delivery_fee_fixed,
    isActive: row.is_active,
  };
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    basePrice: row.base_price,
    category: row.category,
    imageUrl: row.image_url,
    isActive: row.is_active,
  };
}

function mapMenu(row: MenuRow): Menu {
  return {
    id: row.id,
    locationId: row.location_id,
    date: row.date,
    name: row.name,
    status: row.status,
    publishedAt: row.published_at,
  };
}

function mapMenuItem(row: MenuItemRow, product?: Product): MenuItem {
  return {
    id: row.id,
    menuId: row.menu_id,
    productId: row.product_id,
    comboId: row.combo_id,
    displayName: row.display_name,
    priceOverride: row.price_override,
    availableQuantity: row.available_quantity,
    isAvailable: row.is_available,
    sortOrder: row.sort_order,
    product,
  };
}

function resolveBusinessDate(requestedDate?: string, timezone = "America/Bogota"): string {
  if (requestedDate) {
    return requestedDate;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

async function requireAuthUser(
  c: Context<{
    Bindings: ApiBindings;
    Variables: DashboardVariables;
  }>,
): Promise<AuthUser | Response> {
  const anonKey = c.env.SUPABASE_ANON_KEY;
  if (!anonKey || anonKey === "replace-me") {
    return c.json({ error: "supabase_anon_not_configured" }, 500);
  }

  const authorization = c.req.header("Authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

  if (!token) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const response = await fetch(`${c.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const user = (await response.json()) as AuthUser;
  return user;
}

async function getAuthorizedTenants(env: ApiBindings, userId: string): Promise<TenantRow[]> {
  const supabase = createSupabaseRestClient(env);
  const tenantUsers = await supabase.select<TenantUserRow>({
    schema: "control",
    table: "tenant_users",
    query: {
      select: "tenant_id,user_id,role,status",
      user_id: `eq.${userId}`,
      status: "eq.active",
    },
  });

  if (tenantUsers.length === 0) {
    return [];
  }

  const tenantIds = tenantUsers.map((row) => row.tenant_id).join(",");
  return supabase.select<TenantRow>({
    schema: "control",
    table: "tenants",
    query: {
      select: "id,name,slug,schema_name,timezone",
      id: `in.(${tenantIds})`,
      status: "eq.active",
      order: "name.asc",
    },
  });
}
