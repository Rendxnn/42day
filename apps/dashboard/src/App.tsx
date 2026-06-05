import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { MenuItem, OrderSummary, Product, ProductOption, PublicCartaPayload } from "@42day/types";
import type { Session } from "@supabase/supabase-js";
import {
  addMenuItem,
  analyzeMenuImage,
  createAdminRestaurant,
  createAdminRestaurantMember,
  createProduct,
  DashboardApiError,
  deleteAdminRestaurant,
  deleteAdminRestaurantMember,
  deleteMenuItem,
  deleteProduct,
  getAdminOverview,
  getDiagnostics,
  getMe,
  getPublicCarta,
  getTodayMenu,
  listOrders,
  listAdminRestaurants,
  resetAdminRestaurantMemberPassword,
  updateMenuItem,
  updateAdminRestaurant,
  updateAdminRestaurantMember,
  updateProduct,
  uploadProductImage,
} from "./api";
import type { AdminOverview, AdminRestaurant, AdminRestaurantMember, AdminRestaurantStatus, DashboardTenant, DetectedMenuProduct } from "./api";
import { authConfigured, getSession, onAuthStateChange, signIn, signOut, supabase } from "./auth";
import {
  Camera,
  Bell,
  Check,
  ChefHat,
  ClipboardList,
  Copy,
  Clock,
  Edit3,
  ExternalLink,
  Home,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  Power,
  Plus,
  QrCode,
  Search,
  SearchCheck,
  Sparkles,
  Store,
  Trash2,
  UploadCloud,
  Utensils,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { OrdersView } from "./orders";
import unicodeEmojiData from "emojibase-data/meta/unicode.json";
import QRCode from "qrcode";

type View = "menu" | "orders" | "summary" | "catalog" | "upload";
type SaveStatus = "loading" | "saving" | "saved" | "offline";
type ProductFormValue = Partial<Product> & { imageFile?: File };
type DashboardNotification = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
};

const fallbackTenants: DashboardTenant[] = [
  { id: "local-demo", name: "Restaurante Demo", slug: "demo", schemaName: "tenant_demo" },
  { id: "local-arepas", name: "Arepas del Parque", slug: "arepas", schemaName: "tenant_arepas" },
  { id: "local-pizza", name: "Pizza Norte", slug: "pizza", schemaName: "tenant_pizza" },
];

const fallbackProducts: Product[] = [
  {
    id: "local-product-1",
    name: "Bandeja paisa ejecutiva",
    description: "Frijoles, arroz, carne molida, huevo, maduro y aguacate.",
    basePrice: 24000,
    category: "almuerzos",
    imageUrl: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=420&q=80",
    isActive: true,
  },
  {
    id: "local-product-2",
    name: "Pollo a la plancha",
    description: "Pechuga asada con ensalada fresca y papas criollas.",
    basePrice: 21000,
    category: "almuerzos",
    imageUrl: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=420&q=80",
    isActive: true,
  },
  {
    id: "local-product-3",
    name: "Sopa del dia",
    description: "Entrada caliente preparada con ingredientes del dia.",
    basePrice: 9000,
    category: "entradas",
    imageUrl: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=420&q=80",
    isActive: true,
  },
];

const fallbackItems: MenuItem[] = fallbackProducts.map((product, index) => ({
  id: `local-item-${index + 1}`,
  menuId: "local-menu",
  productId: product.id,
  displayName: product.name,
  priceOverride: product.basePrice,
  isAvailable: index < 2,
  sortOrder: index,
  product,
}));

const navItems = [
  {
    id: "menu" as const,
    label: "Hoy",
    icon: Utensils,
  },
  {
    id: "orders" as const,
    label: "Pedidos",
    icon: ClipboardList,
  },
  {
    id: "summary" as const,
    label: "Resumen",
    icon: Home,
  },
  {
    id: "catalog" as const,
    label: "Catalogo",
    icon: ChefHat,
  },
  {
    id: "upload" as const,
    label: "Subida",
    icon: UploadCloud,
  },
];

const viewCopy: Record<View, { eyebrow: string; title: string; description: string }> = {
  menu: {
    eyebrow: "Operacion diaria",
    title: "Menu listo para WhatsApp",
    description: "",
  },
  orders: {
    eyebrow: "Centro de pedidos",
    title: "Decision operativa en una sola bandeja",
    description: "",
  },
  summary: {
    eyebrow: "Pulso del tenant",
    title: "Estado de servicio",
    description: "",
  },
  catalog: {
    eyebrow: "Base maestra",
    title: "Catalogo del restaurante",
    description: "",
  },
  upload: {
    eyebrow: "Entrada asistida",
    title: "Sube el menu y deja que IA lo estructure",
    description: "",
  },
};

let toastTimer = 0;
const notifiableOrderStatuses = new Set<OrderSummary["status"]>([
  "new",
  "pending_restaurant_confirmation",
  "needs_customer_replacement",
]);

const foodEmojiRules: Array<{ emoji: string; terms: string[] }> = [
  { emoji: "☕", terms: ["cafe", "capuccino", "cappuccino", "espresso", "latte", "tinto", "mocca", "mocha"] },
  { emoji: "🥤", terms: ["gaseosa", "soda", "coca cola", "coca-cola", "pepsi", "limonada", "malteada"] },
  { emoji: "🧃", terms: ["jugo", "zumo", "guarapo", "chicha", "avena", "batido", "smoothie"] },
  { emoji: "🍺", terms: ["cerveza", "pola"] },
  { emoji: "🍷", terms: ["vino", "sangria"] },
  { emoji: "💧", terms: ["agua"] },
  { emoji: "🍵", terms: ["te", "aromatica", "infusion", "matcha"] },
  { emoji: "🥣", terms: ["sopa", "crema", "caldo", "consome", "ajiaco", "sancocho"] },
  { emoji: "🍳", terms: ["huevo", "omelette", "omelet", "perico", "desayuno"] },
  { emoji: "🥞", terms: ["pancake", "waffle", "hotcake"] },
  { emoji: "🥐", terms: ["croissant", "pan", "tostada", "sanduche", "sandwich"] },
  { emoji: "🍔", terms: ["hamburguesa", "burger"] },
  { emoji: "🍕", terms: ["pizza"] },
  { emoji: "🌮", terms: ["taco", "burrito", "quesadilla"] },
  { emoji: "🫓", terms: ["arepa"] },
  { emoji: "🥟", terms: ["empanada", "pastel", "pastelito"] },
  { emoji: "🍝", terms: ["pasta", "spaghetti", "espagueti", "lasagna", "lasana", "ravioli"] },
  { emoji: "🍚", terms: ["arroz", "chaufa", "risotto"] },
  { emoji: "🥩", terms: ["carne", "res", "bistec", "lomo", "churrasco", "costilla", "punta de anca"] },
  { emoji: "🍗", terms: ["pollo", "gallina", "alitas", "pechuga"] },
  { emoji: "🐟", terms: ["pescado", "tilapia", "salmon", "atun", "trucha", "mojarra"] },
  { emoji: "🦐", terms: ["camaron", "langostino", "mariscos", "ceviche"] },
  { emoji: "🐷", terms: ["cerdo", "tocino", "chicharron", "costilla de cerdo"] },
  { emoji: "🍟", terms: ["papa", "papas", "francesa", "criolla", "yuca", "patacon"] },
  { emoji: "🥗", terms: ["ensalada", "vegetariano", "vegetal", "verdura"] },
  { emoji: "🍰", terms: ["torta", "pastel", "postre", "cheesecake", "brownie"] },
  { emoji: "🍦", terms: ["helado", "gelato"] },
  { emoji: "🍌", terms: ["maduro", "platano"] },
  { emoji: "🥑", terms: ["aguacate"] },
  { emoji: "🫘", terms: ["frijol", "frijoles"] },
];
const availableProductEmojis = Array.from(new Set([
  ...foodEmojiRules.map((rule) => rule.emoji),
  "🍽️",
  "🥘",
  "🍛",
  "🥪",
  "🥛",
  "🍊",
  "🍓",
  "🍫",
  ...unicodeEmojiData,
]));

function getFallbackProducts(tenantSlug: string): Product[] {
  if (tenantSlug === "arepas") {
    return [
      {
        id: "local-arepas-product-1",
        name: "Arepa mixta",
        description: "Arepa asada con carne desmechada, pollo y queso.",
        basePrice: 16000,
        category: "arepas",
        imageUrl: "https://images.unsplash.com/photo-1627662236973-4fd83550a2c8?auto=format&fit=crop&w=420&q=80",
        isActive: true,
      },
      {
        id: "local-arepas-product-2",
        name: "Arepa de queso",
        description: "Arepa clasica con queso doble.",
        basePrice: 9500,
        category: "arepas",
        isActive: true,
      },
    ];
  }

  if (tenantSlug === "pizza") {
    return [
      {
        id: "local-pizza-product-1",
        name: "Pizza personal pepperoni",
        description: "Masa artesanal, mozzarella y pepperoni.",
        basePrice: 22000,
        category: "pizzas",
        imageUrl: "https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=420&q=80",
        isActive: true,
      },
      {
        id: "local-pizza-product-2",
        name: "Pizza vegetariana",
        description: "Champinones, pimenton, cebolla y aceitunas.",
        basePrice: 24000,
        category: "pizzas",
        isActive: true,
      },
    ];
  }

  return fallbackProducts;
}

function getFallbackItems(tenantSlug: string): MenuItem[] {
  return getFallbackProducts(tenantSlug).map((product, index) => ({
    id: `local-${tenantSlug}-item-${index + 1}`,
    menuId: `local-${tenantSlug}-menu`,
    productId: product.id,
    displayName: product.name,
    priceOverride: product.basePrice,
    isAvailable: index === 0,
    sortOrder: index,
    product,
  }));
}

type CategorySectionId = "desayuno" | "almuerzo" | "adicion" | "bebida";

type CategorySection<T> = {
  id: CategorySectionId;
  label: string;
  items: T[];
};

const categorySections: Array<{ id: CategorySectionId; label: string }> = [
  { id: "desayuno", label: "Desayunos" },
  { id: "almuerzo", label: "Almuerzos" },
  { id: "adicion", label: "Adiciones" },
  { id: "bebida", label: "Bebidas" },
];

function normalizeCategorySection(category?: string): CategorySectionId {
  const value = (category ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (value.includes("desayuno")) return "desayuno";
  if (value.includes("almuerzo") || value.includes("plato fuerte") || value.includes("menu")) return "almuerzo";
  if (value.includes("bebida") || value.includes("jugo") || value.includes("gaseosa")) return "bebida";
  if (value.includes("adicion") || value.includes("acompanamiento") || value.includes("entrada")) return "adicion";

  return "adicion";
}

function normalizeSearchText(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferProductEmoji(input: Pick<Product, "description" | "name">) {
  const text = normalizeSearchText(`${input.name} ${input.description ?? ""}`);
  const matchedRule = foodEmojiRules.find((rule) => rule.terms.some((term) => text.includes(normalizeSearchText(term))));

  if (matchedRule) return matchedRule.emoji;

  return "🍽️";
}

function createEmptyCompositeOption(sortOrder: number): ProductOption {
  return {
    name: "",
    type: "single",
    isRequired: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder,
    displayMode: "buttons",
    values: [
      { name: "", priceDelta: 0, isActive: true, sortOrder: 0 },
      { name: "", priceDelta: 0, isActive: true, sortOrder: 10 },
    ],
  };
}

function createDefaultCompositeOptions(): ProductOption[] {
  return [
    {
      ...createEmptyCompositeOption(0),
      name: "Acompanante",
      values: [
        { name: "Yuca", priceDelta: 0, isActive: true, sortOrder: 0 },
        { name: "Platano", priceDelta: 0, isActive: true, sortOrder: 10 },
        { name: "Papa", priceDelta: 0, isActive: true, sortOrder: 20 },
      ],
    },
    {
      ...createEmptyCompositeOption(10),
      name: "Principio",
      values: [
        { name: "Frijoles", priceDelta: 0, isActive: true, sortOrder: 0 },
        { name: "Lentejas", priceDelta: 0, isActive: true, sortOrder: 10 },
      ],
    },
    {
      ...createEmptyCompositeOption(20),
      name: "Ensalada",
      values: [
        { name: "Ensalada de la casa", priceDelta: 0, isActive: true, sortOrder: 0 },
        { name: "Ensalada cesar", priceDelta: 0, isActive: true, sortOrder: 10 },
      ],
    },
  ];
}

function createCompositeProductDraft(): Partial<Product> {
  return {
    name: "Almuerzo del dia",
    description: "Producto compuesto con componentes configurables.",
    basePrice: 0,
    category: "almuerzos",
    isActive: true,
    productType: "composite",
    options: createDefaultCompositeOptions(),
  };
}

function normalizeProductOptions(options?: ProductOption[]) {
  return (options ?? [])
    .map((option, optionIndex) => ({
      ...option,
      name: option.name.trim(),
      description: option.description?.trim(),
      sortOrder: option.sortOrder ?? optionIndex * 10,
      minSelect: Number(option.minSelect ?? (option.isRequired ? 1 : 0)),
      maxSelect: Number(option.maxSelect ?? 1),
      values: option.values
        .map((value, valueIndex) => ({
          ...value,
          name: value.name.trim(),
          description: value.description?.trim(),
          priceDelta: Number(value.priceDelta ?? 0),
          isActive: value.isActive ?? true,
          sortOrder: value.sortOrder ?? valueIndex * 10,
        }))
        .filter((value) => value.name.length > 0),
    }))
    .filter((option) => option.name.length > 0 && option.values.length > 0);
}

function groupByCategorySection<T>(items: T[], getCategory: (item: T) => string | undefined) {
  const groups = new Map(
    categorySections.map((section) => [section.id, { ...section, items: [] as T[] }]),
  );

  items.forEach((item) => {
    const sectionId = normalizeCategorySection(getCategory(item));
    groups.get(sectionId)?.items.push(item);
  });

  return categorySections
    .map((section) => groups.get(section.id))
    .filter((section): section is CategorySection<T> => Boolean(section && section.items.length > 0));
}

function formatPrice(value: number | undefined) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatDateTime(value?: string) {
  if (!value) return "sin fecha";

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function keepSessionStableByUser(current: Session | null, next: Session | null) {
  if (!next) return null;
  return current?.user.id === next.user.id ? current : next;
}

function isNotifiableOrder(order: OrderSummary) {
  return notifiableOrderStatuses.has(order.status);
}

function getOrderNotificationTitle(order: OrderSummary) {
  if (order.status === "needs_customer_replacement") {
    return "Pedido esperando respuesta del cliente";
  }

  if (order.status === "pending_restaurant_confirmation") {
    return "Nuevo pedido por confirmar";
  }

  return "Nuevo movimiento de pedido";
}

function getOrderNotificationDetail(order: OrderSummary) {
  const customer = order.customerName || order.customerPhone || "Cliente sin nombre";
  return `${customer} - ${formatPrice(order.total)} - ${formatDateTime(order.createdAt)}`;
}

function playNotificationSound() {
  type WindowWithWebkitAudio = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AudioCtor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioCtor) return;

  try {
    const context = new AudioCtor();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Browsers can block audio until the first user gesture.
  }
}

function showBrowserNotification(title: string, detail: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification(title, { body: detail });
}

function isPublicCartaRoute() {
  return window.location.pathname === "/carta" || window.location.pathname.startsWith("/carta/");
}

function getPublicCartaTenantSlug() {
  const params = new URLSearchParams(window.location.search);
  const queryTenant = params.get("tenant") || params.get("restaurante");
  if (queryTenant) return queryTenant;

  const [, route, tenantSlug] = window.location.pathname.split("/");
  if (route === "carta" && tenantSlug) return tenantSlug;

  return "demo";
}

function getPublicCartaUrl(tenantSlug: string) {
  const url = new URL("/carta", window.location.origin);
  url.searchParams.set("tenant", tenantSlug || "demo");
  return url.toString();
}

export function App() {
  return isPublicCartaRoute() ? <PublicCartaPage /> : <DashboardApp />;
}

function DashboardApp() {
  const [activeView, setActiveView] = useState<View>("menu");
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [tenants, setTenants] = useState<DashboardTenant[]>([]);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [products, setProducts] = useState<Product[]>(fallbackProducts);
  const [items, setItems] = useState<MenuItem[]>(fallbackItems);
  const [imageColumnReady, setImageColumnReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [lastUpdated, setLastUpdated] = useState("hace 2 min");
  const [toast, setToast] = useState("");
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const seenNotificationOrderIdsRef = useRef<Set<string>>(new Set());
  const notificationsBootstrappedRef = useRef(false);

  useEffect(() => {
    if (!authConfigured) {
      setAuthLoading(false);
      return;
    }

    let mounted = true;

    getSession()
      .then((currentSession) => {
        if (!mounted) return;
        setSession((current) => keepSessionStableByUser(current, currentSession));
      })
      .finally(() => {
        if (mounted) {
          setAuthLoading(false);
        }
      });

    const unsubscribe = onAuthStateChange((nextSession) => {
      setSession((current) => keepSessionStableByUser(current, nextSession));
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setTenants([]);
      setTenantSlug("");
      setIsSystemAdmin(false);
      setAdminOverview(null);
      setTenantLoading(false);
      setTenantError("");
      return;
    }

    let active = true;
    setTenantLoading(true);
    setTenantError("");

    getMe()
      .then(async (payload) => {
        if (!active) return;
        const nextIsSystemAdmin = payload.user.app_metadata?.system_admin === true
          || payload.user.app_metadata?.role === "system_admin";
        setIsSystemAdmin(nextIsSystemAdmin);
        setTenants(payload.tenants);

        if (nextIsSystemAdmin) {
          const overview = await getAdminOverview();
          if (!active) return;
          setAdminOverview(overview);
          setTenantSlug("");
          return;
        }

        setAdminOverview(null);
        setTenantSlug((current) => current || payload.tenants[0]?.slug || "");
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof DashboardApiError
          ? `No se pudo consultar /dashboard/me. Backend: ${error.backendError ?? "sin_codigo"} - HTTP ${error.status}.`
          : error instanceof Error
            ? `No se pudo consultar /dashboard/me. ${error.message}`
            : "No se pudo consultar /dashboard/me.";
        setTenants([]);
        setTenantSlug("");
        setIsSystemAdmin(false);
        setAdminOverview(null);
        setTenantError(message);
      })
      .finally(() => {
        if (active) setTenantLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!tenantSlug) return;
    setSaveStatus("loading");
    getTodayMenu(tenantSlug)
      .then((payload) => {
        setProducts(payload.products);
        setItems(payload.items);
        setSaveStatus("saved");
        setLastUpdated(payload.menu?.publishedAt ? "desde Supabase" : "sin menu publicado");
      })
      .catch(() => {
        setProducts([]);
        setItems([]);
        setSaveStatus("offline");
        setLastUpdated("sin conexion");
        notify("No se pudo cargar el tenant desde la API");
      });

    getDiagnostics(tenantSlug)
      .then((diagnostics) => setImageColumnReady(diagnostics.productImageColumn && diagnostics.productImagesBucket))
      .catch(() => setImageColumnReady(false));
  }, [tenantSlug]);

  useEffect(() => {
    const tenantSchema = tenants.find((tenant) => tenant.slug === tenantSlug)?.schemaName;

    if (!tenantSlug || isSystemAdmin) {
      seenNotificationOrderIdsRef.current = new Set();
      notificationsBootstrappedRef.current = false;
      setNotifications([]);
      setUnreadNotificationCount(0);
      setNotificationsOpen(false);
      return;
    }

    let active = true;

    async function checkForNewOrders() {
      try {
        const payload = await listOrders(tenantSlug, "all");
        if (!active) return;

        const relevantOrders = payload.orders.filter(isNotifiableOrder);
        const knownIds = seenNotificationOrderIdsRef.current;
        const freshOrders = relevantOrders.filter((order) => !knownIds.has(order.id));

        relevantOrders.forEach((order) => knownIds.add(order.id));

        if (!notificationsBootstrappedRef.current) {
          notificationsBootstrappedRef.current = true;
          return;
        }

        if (freshOrders.length === 0) return;

        const nextNotifications = freshOrders
          .map((order) => ({
            id: order.id,
            title: getOrderNotificationTitle(order),
            detail: getOrderNotificationDetail(order),
            createdAt: order.createdAt,
          }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const firstNotification = nextNotifications[0];
        if (!firstNotification) return;

        setNotifications((current) => [...nextNotifications, ...current].slice(0, 8));
        setUnreadNotificationCount((current) => current + nextNotifications.length);
        notify(nextNotifications.length === 1 ? firstNotification.title : `${nextNotifications.length} pedidos nuevos requieren revision`);
        playNotificationSound();
        showBrowserNotification(firstNotification.title, firstNotification.detail);
      } catch {
        // The order board already exposes offline state; notifications should stay quiet on transient failures.
      }
    }

    void checkForNewOrders();
    const realtimeChannel = supabase && tenantSchema
      ? supabase
          .channel(`dashboard-orders:${tenantSlug}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: tenantSchema, table: "orders" },
            () => void checkForNewOrders(),
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: tenantSchema, table: "orders" },
            () => void checkForNewOrders(),
          )
          .subscribe()
      : null;
    const intervalId = window.setInterval(() => void checkForNewOrders(), 30000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      if (realtimeChannel && supabase) {
        void supabase.removeChannel(realtimeChannel);
      }
    };
  }, [isSystemAdmin, tenantSlug, tenants]);

  const activeItems = items.filter((item) => item.isAvailable);
  const menuIsActive = activeItems.length > 0;
  const activeTenant = tenants.find((tenant) => tenant.slug === tenantSlug) ?? tenants[0] ?? null;
  const activeViewCopy = viewCopy[activeView];

  async function handleLogin(email: string, password: string) {
    setLoginError("");
    try {
      const { session: nextSession } = await signIn(email, password);
      setSession(nextSession);
    } catch {
      setLoginError("No se pudo iniciar sesion. Revisa correo y contrasena.");
    }
  }

  async function handleLogout() {
    await signOut();
    setSession(null);
    setTenants([]);
    setTenantSlug("");
    setIsSystemAdmin(false);
    setAdminOverview(null);
    setProducts(fallbackProducts);
    setItems(fallbackItems);
    setNotifications([]);
    setUnreadNotificationCount(0);
    setNotificationsOpen(false);
    seenNotificationOrderIdsRef.current = new Set();
    notificationsBootstrappedRef.current = false;
  }

  function toggleNotifications() {
    setNotificationsOpen((current) => !current);
    setUnreadNotificationCount(0);

    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }

  function notify(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setToast(""), 2200);
  }

  async function persistItem(itemId: string, patch: Partial<MenuItem>) {
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
    setSaveStatus("saving");

    try {
      await updateMenuItem(tenantSlug, itemId, patch);
      setSaveStatus("saved");
      setLastUpdated("ahora");
    } catch {
      setSaveStatus("offline");
      notify("No se pudo guardar el cambio");
    }
  }

  async function addFromCatalog(productId: string) {
    const product = products.find((entry) => entry.id === productId);
    if (!product) return;

    setSaveStatus("saving");
    try {
      const created = await addMenuItem(tenantSlug, productId);
      setItems((current) => [...current, created]);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("offline");
      notify("No se pudo agregar el plato");
    }
  }

  async function removeMenuItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
    setSaveStatus("saving");
    try {
      await deleteMenuItem(tenantSlug, itemId);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("offline");
      notify("No se pudo eliminar el plato");
    }
  }

  async function saveProduct(product: ProductFormValue) {
    setSaveStatus("saving");

    try {
      const imageUrl = product.imageFile && imageColumnReady
        ? (await uploadProductImage(tenantSlug, product.imageFile)).publicUrl
        : product.imageUrl;
      const emoji = product.emoji || inferProductEmoji({
        name: product.name ?? "Producto",
        description: product.description,
      });
      const productType = product.productType ?? "simple";
      const payload = {
        ...product,
        emoji,
        productType,
        options: productType === "composite" ? normalizeProductOptions(product.options) : [],
        imageFile: undefined,
        imageUrl,
      };
      const persisted = product.id ? await updateProduct(tenantSlug, product.id, payload) : await createProduct(tenantSlug, payload);

      setProducts((current) => (product.id ? current.map((item) => (item.id === product.id ? persisted : item)) : [persisted, ...current]));
      setSaveStatus("saved");
      notify(product.imageFile && !imageColumnReady ? "Producto creado sin imagen: falta migracion image_url" : product.id ? "Producto actualizado" : "Producto creado");
    } catch {
      setSaveStatus("offline");
      notify("No se pudo guardar. Conecta API y Supabase para persistir.");
      throw new Error("product_save_failed");
    }
  }

  async function removeProduct(productId: string) {
    await deleteProduct(tenantSlug, productId).catch(() => undefined);
    setProducts((current) => current.filter((product) => product.id !== productId));
    setItems((current) => current.filter((item) => item.productId !== productId));
    notify("Producto desactivado");
  }

  if (!authConfigured) {
    return <ConfigRequiredScreen />;
  }

  if (authLoading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <LoginScreen error={loginError} onLogin={handleLogin} />;
  }

  if (tenantLoading) {
    return <TenantLoadingScreen />;
  }

  if (tenantError) {
    return <TenantErrorScreen error={tenantError} onLogout={handleLogout} />;
  }

  if (isSystemAdmin && adminOverview) {
    return <AdminOverviewScreen overview={adminOverview} onLogout={handleLogout} />;
  }

  if (tenants.length === 0) {
    return <NoTenantScreen onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen px-3 py-3 sm:px-4 sm:py-4">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-[1700px] gap-4">
        <Sidebar
          activeView={activeView}
          onNavigate={setActiveView}
          tenantName={activeTenant?.name ?? fallbackTenants[0]?.name ?? "Restaurante"}
        />
        <main className="min-w-0 flex-1">
          <div className="app-shell reveal-up relative min-h-full overflow-hidden rounded-[30px] border border-[var(--shell-border)]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <Header
              activeView={activeView}
              menuIsActive={menuIsActive}
              notifications={notifications}
              notificationsOpen={notificationsOpen}
              saveStatus={saveStatus}
              tenantName={activeTenant?.name ?? fallbackTenants[0]?.name ?? "Restaurante"}
              unreadNotificationCount={unreadNotificationCount}
              viewCopy={activeViewCopy}
              onLogout={() => void handleLogout()}
              onToggleNotifications={toggleNotifications}
            />
            <div className="px-4 pb-28 pt-2 sm:px-6 lg:px-8 lg:pb-10">
              {activeView === "menu" && (
                <TodayMenu
                  activeCount={activeItems.length}
                  items={items}
                  lastUpdated={lastUpdated}
                  menuIsActive={menuIsActive}
                  products={products}
                  saveStatus={saveStatus}
                  onAddDish={addFromCatalog}
                  onDeleteDish={removeMenuItem}
                  onUpdateDish={persistItem}
                />
              )}
              {activeView === "summary" && (
                <Summary
                  activeCount={activeItems.length}
                  items={items}
                  onEditMenu={() => setActiveView("menu")}
                  onOpenOrders={() => setActiveView("orders")}
                  tenantSlug={tenantSlug}
                  totalCount={items.length}
                />
              )}
              {activeView === "orders" && <OrdersView menuItems={items} onNotify={notify} tenantSlug={tenantSlug} />}
              {activeView === "catalog" && (
                <Catalog
                  imageColumnReady={imageColumnReady}
                  menuProductIds={new Set(items.map((item) => item.productId).filter((productId): productId is string => Boolean(productId)))}
                  onAddToMenu={addFromCatalog}
                  onDelete={removeProduct}
                  onSave={saveProduct}
                  products={products}
                />
              )}
              {activeView === "upload" && (
                <SmartUpload
                  onAnalyze={(file) => analyzeMenuImage(tenantSlug, file)}
                  onCreateProducts={async (detectedProducts) => {
                    for (const product of detectedProducts) {
                      await saveProduct({
                        name: product.name,
                        description: product.description ?? "Detectado automaticamente desde imagen del menu.",
                        basePrice: product.basePrice,
                        category: product.category,
                        emoji: product.emoji,
                        isActive: true,
                      });
                    }
                  }}
                  onNotify={notify}
                />
              )}
            </div>
          </div>
        </main>
        <BottomNav activeView={activeView} onNavigate={setActiveView} />
      </div>
      {toast && <Toast message={toast} />}
    </div>
  );
}

function PublicCartaPage() {
  const tenantSlug = getPublicCartaTenantSlug();
  const [payload, setPayload] = useState<PublicCartaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    getPublicCarta(tenantSlug)
      .then((nextPayload) => {
        if (!active) return;
        setPayload(nextPayload);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "No se pudo cargar la carta.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tenantSlug]);

  const groups = useMemo(
    () => groupByCategorySection(payload?.items ?? [], (item) => item.product?.category ?? item.displayName),
    [payload?.items],
  );
  const totalItems = payload?.items.length ?? 0;

  return (
    <div className="min-h-screen bg-[#edf2f7] text-[var(--text-strong)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(197,123,87,0.20),transparent_24%),radial-gradient(circle_at_90%_20%,rgba(32,26,22,0.12),transparent_28%),linear-gradient(180deg,#f7fafc_0%,#edf2f7_52%,#dfe8f2_100%)]" />
      <main className="relative mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[36px] border border-white/70 bg-[rgba(255,255,255,0.62)] shadow-[0_28px_90px_rgba(37,31,26,0.16)] backdrop-blur-xl">
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_390px] lg:p-8">
            <div className="flex min-h-[360px] flex-col justify-between rounded-[32px] bg-[linear-gradient(145deg,#211b17_0%,#342a24_58%,#4a3429_100%)] p-6 text-[var(--text-on-dark)] shadow-[0_24px_70px_rgba(32,24,18,0.28)] sm:p-8">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(246,236,223,0.58)]">
                  <span className="rounded-full border border-[rgba(255,242,227,0.12)] px-3 py-1.5">42day carta</span>
                  <span className="rounded-full border border-[rgba(255,242,227,0.12)] px-3 py-1.5">{totalItems} platos visibles</span>
                </div>
                <h1 className="app-display mt-8 max-w-3xl text-[3.7rem] leading-[0.9] tracking-[-0.06em] sm:text-[5.4rem]">
                  {payload?.tenant.name ?? "Carta del restaurante"}
                </h1>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-[rgba(246,236,223,0.72)] sm:text-base">
                  Carta digital de lectura. Consulta platos disponibles, precios y componentes antes de ordenar en el restaurante.
                </p>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-3 text-sm text-[rgba(246,236,223,0.72)]">
                {payload?.location?.name && (
                  <span className="inline-flex items-center gap-2 rounded-2xl bg-[rgba(255,248,240,0.08)] px-4 py-3">
                    <MapPin size={16} />
                    {payload.location.name}
                  </span>
                )}
                {payload?.menu?.name && (
                  <span className="inline-flex items-center gap-2 rounded-2xl bg-[rgba(255,248,240,0.08)] px-4 py-3">
                    <Utensils size={16} />
                    {payload.menu.name}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-[32px] border border-[rgba(118,93,71,0.12)] bg-[#f8fafc] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <div className="rounded-[28px] bg-[#1f1b18] p-4 text-[var(--text-on-dark)] shadow-[0_24px_60px_rgba(32,24,18,0.22)]">
                <div className="relative overflow-hidden rounded-[24px] bg-[linear-gradient(160deg,#2c2520,#191511)] p-5">
                  <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[rgba(197,123,87,0.22)] blur-2xl" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(246,236,223,0.46)]">Hoy en carta</p>
                  <p className="app-display mt-4 text-[4.5rem] leading-none">{totalItems}</p>
                  <p className="mt-3 text-sm leading-6 text-[rgba(246,236,223,0.68)]">
                    Productos publicados y disponibles para clientes en sitio.
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {groups.slice(0, 4).map((group) => (
                    <div className="rounded-[20px] bg-[rgba(255,248,240,0.08)] p-4" key={group.id}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[rgba(246,236,223,0.46)]">{group.label}</p>
                      <p className="mt-3 text-2xl font-semibold">{group.items.length}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <PublicCartaState title="Cargando carta" description="Estamos preparando la carta digital del restaurante." />
        ) : error ? (
          <PublicCartaState title="No se pudo cargar la carta" description={error} />
        ) : groups.length === 0 ? (
          <PublicCartaState title="Carta sin platos visibles" description="El restaurante aun no tiene productos publicados para mostrar en esta carta." />
        ) : (
          <div className="mt-6 space-y-8 pb-12">
            {groups.map((group) => (
              <section key={group.id}>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-faint)]">{group.label}</p>
                    <h2 className="app-display mt-2 text-[2.8rem] leading-none text-[var(--text-strong)]">{group.items.length} opciones</h2>
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((item) => (
                    <PublicCartaCard item={item} key={item.id} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function PublicCartaState({ description, title }: { description: string; title: string }) {
  return (
    <div className="mt-6 rounded-[32px] border border-white/70 bg-[rgba(255,255,255,0.7)] px-6 py-16 text-center shadow-[0_20px_60px_rgba(37,31,26,0.08)] backdrop-blur">
      <p className="app-display text-[2.8rem] leading-none text-[var(--text-strong)]">{title}</p>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[var(--text-soft)]">{description}</p>
    </div>
  );
}

function PublicCartaCard({ item }: { item: MenuItem }) {
  const product = item.product;
  const name = item.displayName ?? product?.name ?? "Producto";
  const price = item.priceOverride ?? product?.basePrice ?? 0;
  const activeOptions = product?.options
    ?.map((option) => ({
      ...option,
      values: option.values.filter((value) => value.isActive),
    }))
    .filter((option) => option.values.length > 0) ?? [];

  return (
    <article className="group overflow-hidden rounded-[34px] border border-white/80 bg-[rgba(255,255,255,0.78)] shadow-[0_24px_70px_rgba(37,31,26,0.13)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_90px_rgba(37,31,26,0.18)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#dfe8f2]">
        {product?.imageUrl ? (
          <img alt={name} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" src={product.imageUrl} />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.52),transparent_56%),linear-gradient(140deg,#f8fafc,#dbe6f0)]">
            <span className="text-[5rem] drop-shadow-[0_18px_32px_rgba(32,26,22,0.14)]" role="img" aria-label={name}>
              {product?.emoji || inferProductEmoji({ name, description: product?.description })}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(21,17,14,0.72)] via-[rgba(21,17,14,0.18)] to-transparent p-5">
          <span className="inline-flex rounded-full bg-[rgba(255,250,244,0.16)] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/90 backdrop-blur">
            {product?.category || "carta"}
          </span>
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-extrabold tracking-[-0.02em] text-[var(--text-strong)]">{name}</h3>
          <p className="shrink-0 rounded-2xl bg-[#201a16] px-3 py-2 text-sm font-extrabold text-white">{formatPrice(price)}</p>
        </div>
        {product?.description && (
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--text-soft)]">{product.description}</p>
        )}
        {product?.productType === "composite" && activeOptions.length > 0 && (
          <div className="mt-4 rounded-[24px] bg-[#edf2f7] p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--text-faint)]">Opciones del plato</p>
            <div className="mt-3 space-y-3">
              {activeOptions.map((option) => (
                <div key={option.id ?? option.name}>
                  <p className="text-xs font-extrabold text-[var(--text-strong)]">{option.name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {option.values.map((value) => (
                      <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)] shadow-sm" key={value.id ?? value.name}>
                        {value.name}{value.priceDelta > 0 ? ` +${formatPrice(value.priceDelta)}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function Header({
  activeView,
  menuIsActive,
  notifications,
  notificationsOpen,
  onLogout,
  onToggleNotifications,
  saveStatus,
  tenantName,
  unreadNotificationCount,
  viewCopy,
}: {
  activeView: View;
  menuIsActive: boolean;
  notifications: DashboardNotification[];
  notificationsOpen: boolean;
  onLogout: () => void;
  onToggleNotifications: () => void;
  saveStatus: SaveStatus;
  tenantName: string;
  unreadNotificationCount: number;
  viewCopy: { eyebrow: string; title: string; description: string };
}) {
  return (
    <header className="border-b border-[var(--shell-border)] px-4 pb-6 pt-5 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(246,236,223,0.58)]">
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,242,227,0.1)] bg-[rgba(255,248,240,0.04)] px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
              {tenantName}
            </span>
            <span className="hidden text-[rgba(246,236,223,0.34)] sm:inline">/</span>
            <span>{viewCopy.eyebrow}</span>
          </div>
          <div className="mt-4 flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[rgba(255,242,227,0.12)] bg-[rgba(255,248,240,0.06)] text-[var(--text-on-dark)] lg:hidden">
              {activeView === "orders" ? <ClipboardList size={18} /> : <ChefHat size={18} />}
            </div>
            <div className="min-w-0">
              <h1 className="app-display text-[2.4rem] leading-none text-[var(--text-on-dark)] sm:text-[3.25rem]">
                {viewCopy.title}
              </h1>
              {viewCopy.description ? (
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[rgba(246,236,223,0.68)] sm:text-[15px]">
                  {viewCopy.description}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[rgba(255,242,227,0.12)] bg-[rgba(255,248,240,0.06)] px-4 text-sm font-semibold text-[var(--text-on-dark)]">
            <ChefHat size={16} />
            {tenantName}
          </div>
          <NotificationBell
            notifications={notifications}
            open={notificationsOpen}
            unreadCount={unreadNotificationCount}
            onToggle={onToggleNotifications}
          />
          <SaveIndicator menuIsActive={menuIsActive} status={saveStatus} />
          <button
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-[rgba(255,242,227,0.12)] bg-[rgba(255,248,240,0.06)] px-4 text-sm font-semibold text-[rgba(246,236,223,0.82)] transition hover:bg-[rgba(255,248,240,0.12)] hover:text-[var(--text-on-dark)]"
            onClick={onLogout}
            type="button"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}

function NotificationBell({
  notifications,
  onToggle,
  open,
  unreadCount,
}: {
  notifications: DashboardNotification[];
  onToggle: () => void;
  open: boolean;
  unreadCount: number;
}) {
  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `${unreadCount} notificaciones nuevas` : "Abrir notificaciones"}
        className={`relative inline-flex h-12 items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition ${
          open
            ? "border-[rgba(213,192,154,0.34)] bg-[rgba(255,248,240,0.13)] text-[var(--text-on-dark)]"
            : "border-[rgba(255,242,227,0.12)] bg-[rgba(255,248,240,0.06)] text-[rgba(246,236,223,0.82)] hover:bg-[rgba(255,248,240,0.12)] hover:text-[var(--text-on-dark)]"
        }`}
        onClick={onToggle}
        type="button"
      >
        <Bell size={17} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#c57b57] px-1.5 text-[10px] font-extrabold leading-none text-white shadow-[0_8px_22px_rgba(197,123,87,0.36)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="app-panel absolute right-0 z-30 mt-3 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-[24px]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">Notificaciones</p>
            <h2 className="mt-1 text-base font-extrabold text-[var(--text-strong)]">Pedidos en tiempo real</h2>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto p-3 app-scrollbar">
            {notifications.length > 0 ? (
              notifications.map((notification) => (
                <div
                  className="rounded-2xl border border-[rgba(118,93,71,0.14)] bg-[rgba(255,255,255,0.46)] p-3"
                  key={notification.id}
                >
                  <p className="text-sm font-extrabold text-[var(--text-strong)]">{notification.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">{notification.detail}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-[rgba(118,93,71,0.22)] p-4 text-sm leading-6 text-[var(--text-soft)]">
                No hay pedidos nuevos desde que abriste el dashboard.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SaveIndicator({ status, menuIsActive }: { status: SaveStatus; menuIsActive: boolean }) {
  const copy = {
    loading: "Cargando datos",
    saving: "Guardando cambios",
    saved: "Todo sincronizado",
    offline: "Modo local",
  }[status];

  return (
    <div className="inline-flex h-12 items-center gap-3 rounded-2xl border border-[rgba(255,242,227,0.12)] bg-[rgba(255,248,240,0.06)] px-4 text-xs font-semibold uppercase tracking-[0.12em] text-[rgba(246,236,223,0.72)]">
      {status === "saving" || status === "loading" ? <Loader2 className="animate-spin" size={15} /> : <Check className="text-[#d5c09a]" size={15} />}
      <span className="hidden sm:inline">{copy}</span>
      <span className={`h-2.5 w-2.5 rounded-full ${menuIsActive ? "bg-[#bfa07f]" : "bg-[rgba(255,255,255,0.24)]"}`} />
    </div>
  );
}

function Sidebar({
  activeView,
  onNavigate,
  tenantName,
}: {
  activeView: View;
  onNavigate: (view: View) => void;
  tenantName: string;
}) {
  return (
    <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[290px] shrink-0 rounded-[30px] border border-[var(--shell-border)] bg-[rgba(25,22,19,0.92)] px-4 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.28)] lg:block">
      <div className="flex h-full flex-col">
        <div className="rounded-[26px] border border-[rgba(255,242,227,0.08)] bg-[rgba(255,248,240,0.03)] p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(255,248,240,0.08)] text-[var(--text-on-dark)] ring-1 ring-[rgba(255,242,227,0.08)]">
              <ChefHat size={18} />
            </div>
            <div className="min-w-0">
              <p className="app-display text-[2rem] leading-none text-[var(--text-on-dark)]">42day</p>
              <p className="mt-1 truncate text-xs uppercase tracking-[0.18em] text-[rgba(246,236,223,0.44)]">{tenantName}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(246,236,223,0.34)]">
          Workspace
        </div>
        <nav className="mt-3 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                className={`w-full rounded-[22px] border px-4 py-3 text-left transition ${
                  active
                    ? "border-[rgba(223,189,161,0.3)] bg-[rgba(236,215,198,0.12)] text-[var(--text-on-dark)]"
                    : "border-transparent bg-transparent text-[rgba(246,236,223,0.62)] hover:border-[rgba(255,242,227,0.08)] hover:bg-[rgba(255,248,240,0.04)] hover:text-[var(--text-on-dark)]"
                }`}
                key={item.id}
                onClick={() => onNavigate(item.id)}
                type="button"
              >
                <div className="flex items-center gap-3">
                  <div className={`grid h-10 w-10 place-items-center rounded-2xl ${active ? "bg-[rgba(255,248,240,0.14)]" : "bg-[rgba(255,248,240,0.05)]"}`}>
                    <Icon size={17} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{item.label}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

function BottomNav({ activeView, onNavigate }: { activeView: View; onNavigate: (view: View) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-4 z-20 px-4 lg:hidden">
      <div className="mx-auto max-w-xl rounded-[24px] border border-[rgba(255,242,227,0.12)] bg-[rgba(32,28,25,0.94)] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                className={`flex min-h-16 flex-col items-center justify-center rounded-[18px] px-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition ${
                  active
                    ? "bg-[rgba(236,215,198,0.14)] text-[var(--text-on-dark)]"
                    : "text-[rgba(246,236,223,0.54)] hover:bg-[rgba(255,248,240,0.06)] hover:text-[var(--text-on-dark)]"
                }`}
                key={item.id}
                onClick={() => onNavigate(item.id)}
                type="button"
              >
                <Icon size={17} />
                <span className="mt-1.5">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function TodayMenu(props: {
  activeCount: number;
  items: MenuItem[];
  lastUpdated: string;
  menuIsActive: boolean;
  products: Product[];
  saveStatus: SaveStatus;
  onAddDish: (productId: string) => Promise<void>;
  onDeleteDish: (itemId: string) => void;
  onUpdateDish: (itemId: string, patch: Partial<MenuItem>) => void;
}) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const inactiveCount = Math.max(props.items.length - props.activeCount, 0);
  const statusLabel = props.saveStatus === "saving" ? "Guardando" : props.saveStatus === "offline" ? "Sin conexion" : "Sincronizado";
  const groups = groupMenuItemsByOrderType(props.items);

  return (
    <section className="space-y-6 pb-28 lg:pb-32">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_360px]">
        <div className="rounded-[28px] border border-[rgba(255,242,227,0.08)] bg-[rgba(223,201,178,0.08)] p-6 text-[var(--text-on-dark)] shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(246,236,223,0.5)]">
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,242,227,0.08)] px-3 py-1.5">
              <Clock size={14} />
              Actualizado {props.lastUpdated}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,242,227,0.08)] px-3 py-1.5">
              <span className={`h-2 w-2 rounded-full ${props.menuIsActive ? "bg-[#d2b08e]" : "bg-[rgba(255,255,255,0.24)]"}`} />
              {props.menuIsActive ? "Servicio publicado" : "Menu sin activar"}
            </span>
          </div>
          <h2 className="app-display mt-5 text-[2.6rem] leading-none sm:text-[3.2rem]">Curar el menu del dia</h2>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--panel)] px-5 text-sm font-semibold text-[var(--text-strong)] transition hover:bg-[var(--panel-strong)]"
              onClick={() => setCatalogOpen(true)}
              type="button"
            >
              <Plus size={17} />
              Agregar desde catalogo
            </button>
          </div>
        </div>

        <div className="grid gap-3">
          <MenuMetric label="Platos activos" tone="strong" value={props.activeCount} />
          <MenuMetric label="Platos ocultos" value={inactiveCount} />
          <MenuMetric label="Estado de sincronizacion" value={statusLabel} />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="app-panel rounded-[28px] px-6 py-16 text-center">
          <p className="app-display text-[2.1rem] leading-none text-[var(--text-strong)]">Aun no hay platos publicados</p>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[var(--text-soft)]">
            El primer paso es traer productos desde el catalogo general y luego decidir cuales quedaran visibles para el chatbot.
          </p>
          <button
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-5 text-sm font-semibold text-white transition hover:bg-[#312923]"
            onClick={() => setCatalogOpen(true)}
            type="button"
          >
            <Plus size={17} />
            Empezar con el menu
          </button>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {groups.map((group) => (
            <div className="app-panel rounded-[28px] overflow-hidden" key={group.id}>
              <div className="border-b border-[rgba(118,93,71,0.12)] px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{group.label}</p>
                    <h3 className="app-display mt-2 text-[2rem] leading-none text-[var(--text-strong)]">{group.items.length} Items en Menu</h3>
                  </div>
                  <div className="rounded-full bg-[rgba(197,123,87,0.12)] px-3 py-2 text-xs font-semibold text-[var(--warning)]">
                    {group.activeCount} visibles ahora
                  </div>
                </div>
              </div>
              <div className="app-scrollbar max-h-[520px] space-y-3 overflow-y-auto px-4 py-4">
                {group.items.map((item) => (
                  <DishRow
                    item={item}
                    key={item.id}
                    onDelete={() => props.onDeleteDish(item.id)}
                    onUpdate={(patch) => props.onUpdateDish(item.id, patch)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {catalogOpen && (
        <AddDishModal items={props.items} products={props.products} onAdd={props.onAddDish} onClose={() => setCatalogOpen(false)} />
      )}
    </section>
  );
}

function groupMenuItemsByOrderType(items: MenuItem[]) {
  return groupByCategorySection(items, (item) => item.product?.category).map((group) => ({
    ...group,
    activeCount: group.items.filter((item) => item.isAvailable).length,
  }));
}

function MenuMetric({ label, tone = "muted", value }: { label: string; tone?: "muted" | "strong"; value: string | number }) {
  return (
    <div className="app-panel-dark rounded-[26px] px-5 py-5 text-[var(--text-on-dark)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(246,236,223,0.42)]">{label}</p>
      <p className={`mt-4 ${tone === "strong" ? "app-display text-[3rem] leading-none" : "text-2xl font-semibold"}`}>{value}</p>
    </div>
  );
}

function DishRow({ item, onDelete, onUpdate }: { item: MenuItem; onDelete: () => void; onUpdate: (patch: Partial<MenuItem>) => void }) {
  const name = item.displayName ?? item.product?.name ?? "Producto sin nombre";
  const price = item.priceOverride ?? item.product?.basePrice ?? 0;

  return (
    <article className={`rounded-[24px] border p-4 transition ${item.isAvailable ? "border-[rgba(118,93,71,0.12)] bg-[rgba(244,236,225,0.84)]" : "border-[rgba(118,93,71,0.1)] bg-[rgba(232,220,206,0.7)]"}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-3">
            <ProductImage
              description={item.product?.description}
              emoji={item.product?.emoji}
              imageUrl={item.product?.imageUrl}
              name={name}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`truncate text-sm font-semibold ${item.isAvailable ? "text-[var(--text-strong)]" : "text-[var(--text-soft)]"}`}>{name}</h3>
                {!item.isAvailable && (
                  <span className="rounded-full bg-[rgba(118,93,71,0.08)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                    Oculto
                  </span>
                )}
              </div>
              {item.product?.description && (
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--text-soft)]">{item.product.description}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="inline-flex h-12 min-w-0 items-center rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[rgba(250,245,238,0.72)] px-4 sm:w-40">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">COP</span>
            <input
              aria-label={`Precio de ${name}`}
              className="ml-3 w-full bg-transparent text-right text-sm font-semibold text-[var(--text-strong)] outline-none"
              min="0"
              onChange={(event) => onUpdate({ priceOverride: Number(event.target.value) })}
              type="number"
              value={price}
            />
          </label>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <AvailabilitySwitch checked={item.isAvailable} onChange={() => onUpdate({ isAvailable: !item.isAvailable })} />
            <button
              className="grid h-12 w-12 place-items-center rounded-2xl border border-[rgba(118,93,71,0.12)] text-[var(--text-soft)] transition hover:border-[rgba(180,94,84,0.22)] hover:bg-[rgba(190,110,95,0.08)] hover:text-[#9a4b43]"
              onClick={onDelete}
              title="Eliminar plato"
              type="button"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function AvailabilitySwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      aria-pressed={checked}
      className={`inline-flex h-12 items-center gap-2 rounded-2xl px-3 text-sm font-semibold transition ${
        checked
          ? "bg-[rgba(79,122,97,0.1)] text-[var(--success)]"
          : "bg-[rgba(118,93,71,0.08)] text-[var(--text-soft)]"
      }`}
      onClick={onChange}
      type="button"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${checked ? "bg-[var(--success)]" : "bg-[var(--text-faint)]"}`} />
      {checked ? "Visible" : "Pausado"}
    </button>
  );
}

function AddDishModal(props: { items: MenuItem[]; products: Product[]; onAdd: (productId: string) => Promise<void>; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const existingIds = useMemo(() => new Set(props.items.map((item) => item.productId)), [props.items]);
  const availableProducts = props.products
    .filter((product) => product.isActive && !existingIds.has(product.id))
    .filter((product) => `${product.name} ${product.description ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const groupedProducts = useMemo(
    () => groupByCategorySection(availableProducts, (product) => product.category),
    [availableProducts],
  );

  function toggleSelect(productId: string) {
    setSelectedProductIds((current) => (
      current.includes(productId)
        ? current.filter((entry) => entry !== productId)
        : [...current, productId]
    ));
  }

  function toggleCategory(productIds: string[]) {
    const allSelected = productIds.every((productId) => selectedProductIds.includes(productId));
    setSelectedProductIds((current) => {
      if (allSelected) {
        return current.filter((productId) => !productIds.includes(productId));
      }

      return Array.from(new Set([...current, ...productIds]));
    });
  }

  async function handleSubmit() {
    if (selectedProductIds.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      for (const productId of selectedProductIds) {
        await props.onAdd(productId);
      }
      props.onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Agregar desde catalogo" onClose={props.onClose}>
      <div className="sticky top-0 z-20 -mx-5 -mt-5 border-b border-[rgba(118,93,71,0.1)] bg-[var(--panel)] px-5 pb-4 pt-5 shadow-[0_14px_30px_rgba(20,14,10,0.08)] sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" size={17} />
          <input
            autoFocus
            className="h-12 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] pl-11 pr-4 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:bg-[var(--panel-strong)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar plato..."
            value={query}
          />
        </div>
        <div className="app-panel-muted mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2 text-sm font-semibold text-[var(--text-soft)]">
          <span>{selectedProductIds.length} seleccionados</span>
          <span className="text-xs text-[var(--text-faint)]">{availableProducts.length} disponibles</span>
        </div>
      </div>
      <div className="app-scrollbar mt-4 max-h-[420px] space-y-3 overflow-y-auto">
        {groupedProducts.length === 0 && (
          <div className="rounded-[22px] border border-[rgba(118,93,71,0.1)] bg-[rgba(248,241,232,0.72)] px-4 py-6 text-center text-sm text-[var(--text-soft)]">
            No hay mas productos activos disponibles para agregar al menu.
          </div>
        )}
        {groupedProducts.map((group) => {
          const ids = group.items.map((product) => product.id);
          const allSelected = ids.every((id) => selectedProductIds.includes(id));

          return (
            <section className="rounded-[22px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.9)] p-3" key={group.id}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{group.label}</p>
                <button
                  className="inline-flex h-9 items-center rounded-xl border border-[rgba(118,93,71,0.12)] px-3 text-xs font-semibold text-[var(--text-soft)]"
                  onClick={() => toggleCategory(ids)}
                  type="button"
                >
                  {allSelected ? "Quitar seleccion" : "Seleccionar categoria"}
                </button>
              </div>
              <div className="space-y-2">
                {group.items.map((product) => {
                  const selected = selectedProductIds.includes(product.id);
                  return (
                    <button
                      className={`flex w-full items-center gap-3 rounded-[18px] border p-3 text-left transition ${selected ? "border-[rgba(197,123,87,0.25)] bg-[rgba(247,238,228,0.95)]" : "border-[rgba(118,93,71,0.1)] bg-white/80 hover:border-[rgba(197,123,87,0.22)] hover:bg-white"}`}
                      key={product.id}
                      onClick={() => toggleSelect(product.id)}
                      type="button"
                    >
                      <ProductImage
                        description={product.description}
                        emoji={product.emoji}
                        imageUrl={product.imageUrl}
                        name={product.name}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{product.name}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--text-soft)]">{product.description}</p>
                      </div>
                      <span className="text-sm font-semibold text-[var(--text-strong)]">{formatPrice(product.basePrice)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={selectedProductIds.length === 0 || isSubmitting}
          onClick={() => void handleSubmit()}
          type="button"
        >
          {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
          + Agregar desde catalogo
        </button>
      </div>
    </Modal>
  );
}

function Summary({
  activeCount,
  items,
  onEditMenu,
  onOpenOrders,
  tenantSlug,
  totalCount,
}: {
  activeCount: number;
  items: MenuItem[];
  onEditMenu: () => void;
  onOpenOrders: () => void;
  tenantSlug: string;
  totalCount: number;
}) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const inactiveCount = Math.max(totalCount - activeCount, 0);
  const coverage = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0;
  const activeMenuItems = useMemo(() => items.filter((item) => item.isAvailable), [items]);
  const averageMenuPrice = activeMenuItems.length > 0
    ? Math.round(activeMenuItems.reduce((sum, item) => sum + (item.priceOverride ?? item.product?.basePrice ?? 0), 0) / activeMenuItems.length)
    : 0;
  const activeCategoryCount = useMemo(
    () => new Set(activeMenuItems.map((item) => normalizeCategorySection(item.product?.category || item.displayName))).size,
    [activeMenuItems],
  );

  useEffect(() => {
    let active = true;

    async function loadSummaryOrders() {
      setOrdersLoading(true);
      try {
        const payload = await listOrders(tenantSlug, "all");
        if (!active) return;
        setOrders(payload.orders);
        setOrdersError("");
      } catch (error) {
        if (!active) return;
        setOrdersError(error instanceof Error ? error.message : "No se pudieron cargar los pedidos.");
      } finally {
        if (active) {
          setOrdersLoading(false);
        }
      }
    }

    void loadSummaryOrders();

    return () => {
      active = false;
    };
  }, [tenantSlug]);

  const todayKey = getDayKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getDayKey(yesterday);

  const todaysOrders = useMemo(
    () => orders
      .filter((order) => getDayKey(order.createdAt) === todayKey)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    [orders, todayKey],
  );
  const yesterdayOrders = useMemo(
    () => orders.filter((order) => getDayKey(order.createdAt) === yesterdayKey),
    [orders, yesterdayKey],
  );
  const deliveredToday = useMemo(
    () => todaysOrders.filter((order) => order.status === "delivered"),
    [todaysOrders],
  );
  const cancelledToday = useMemo(
    () => todaysOrders.filter((order) => order.status === "cancelled"),
    [todaysOrders],
  );
  const productiveOrdersToday = useMemo(
    () => todaysOrders.filter((order) => order.status !== "cancelled"),
    [todaysOrders],
  );
  const revenueToday = productiveOrdersToday.reduce((sum, order) => sum + order.total, 0);
  const averageTicket = productiveOrdersToday.length > 0 ? Math.round(revenueToday / productiveOrdersToday.length) : 0;
  const orderDelta = todaysOrders.length - yesterdayOrders.length;
  const closedTodayCount = deliveredToday.length + cancelledToday.length;

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_420px]">
        <div className="rounded-[28px] border border-[rgba(255,242,227,0.08)] bg-[rgba(255,248,240,0.06)] p-6 text-[var(--text-on-dark)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(246,236,223,0.46)]">Generalidades de menu</p>
          <h2 className="app-display mt-4 text-[2.8rem] leading-none sm:text-[3.4rem]">
            {activeCount > 0 ? "Menu alineado para vender hoy" : "Hace falta activar el menu"}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[rgba(246,236,223,0.68)]">
            {activeCount} platos visibles, {inactiveCount} ocultos y {activeCategoryCount} secciones activas en la carta del dia.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--panel)] px-5 text-sm font-semibold text-[var(--text-strong)] transition hover:bg-[var(--panel-strong)]"
              onClick={onEditMenu}
              type="button"
            >
              <Edit3 size={17} />
              Ajustar menu de hoy
            </button>
            <button
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[rgba(255,242,227,0.12)] bg-[rgba(255,248,240,0.04)] px-5 text-sm font-semibold text-[var(--text-on-dark)] transition hover:bg-[rgba(255,248,240,0.08)]"
              onClick={onOpenOrders}
              type="button"
            >
              <ClipboardList size={17} />
              Revisar pedidos
            </button>
          </div>
        </div>

        <div className="app-panel rounded-[28px] p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Cobertura del menu</p>
          <p className="app-display mt-4 text-[4rem] leading-none text-[var(--text-strong)]">{coverage}%</p>
          <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">
            Ticket promedio visible {formatPrice(averageMenuPrice)}.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="app-panel rounded-[28px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Platos y menu</p>
              <h3 className="mt-3 text-xl font-semibold text-[var(--text-strong)]">Generalidades operativas</h3>
            </div>
            <span className="rounded-full bg-[var(--surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)]">
              {activeCategoryCount} categorias activas
            </span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <SummaryMetricCard label="Platos en menu" tone="neutral" value={String(activeCount)} />
            <SummaryMetricCard label="Platos ocultos" tone="neutral" value={String(inactiveCount)} />
            <SummaryMetricCard label="Total en carta" tone="neutral" value={String(totalCount)} />
            <SummaryMetricCard label="Precio promedio" tone="neutral" value={formatPrice(averageMenuPrice)} />
          </div>
        </div>

        <div className="app-panel rounded-[28px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Pedidos realizados</p>
              <h3 className="mt-3 text-xl font-semibold text-[var(--text-strong)]">Pulso comercial del dia</h3>
            </div>
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              orderDelta > 0
                ? "bg-[rgba(79,122,97,0.12)] text-[var(--success)]"
                : orderDelta < 0
                  ? "bg-[rgba(197,123,87,0.12)] text-[var(--warning)]"
                  : "bg-[var(--surface-base)] text-[var(--text-soft)]"
            }`}>
              {getOrderDeltaLabel(orderDelta)}
            </span>
          </div>
          {ordersLoading ? (
            <div className="mt-5 rounded-[22px] bg-[var(--surface-base)] px-4 py-8 text-center text-sm text-[var(--text-soft)]">
              Cargando pedidos del dia...
            </div>
          ) : ordersError ? (
            <div className="mt-5 rounded-[22px] border border-[rgba(180,94,84,0.18)] bg-[rgba(190,110,95,0.08)] px-4 py-4 text-sm text-[#8c4e47]">
              {ordersError}
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <SummaryMetricCard label="Pedidos hoy" tone="info" value={String(todaysOrders.length)} />
              <SummaryMetricCard label="Ventas del dia" tone="success" value={formatPrice(revenueToday)} />
              <SummaryMetricCard label="Ticket promedio" tone="info" value={formatPrice(averageTicket)} />
              <SummaryMetricCard label="Cerrados hoy" tone="neutral" value={String(closedTodayCount)} />
            </div>
          )}
        </div>
      </div>

      <PublicCartaShareCard tenantSlug={tenantSlug} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_420px]">
        <div className="app-panel rounded-[28px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Grafico de ventas</p>
              <h3 className="mt-3 text-xl font-semibold text-[var(--text-strong)]">Recibos emitidos hoy</h3>
            </div>
            <span className="rounded-full bg-[var(--surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)]">
              {todaysOrders.length} recibos
            </span>
          </div>
          <div className="mt-5">
            <SalesChart orders={todaysOrders} />
          </div>
        </div>

        <div className="app-panel rounded-[28px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Cuenta - factura</p>
              <h3 className="mt-3 text-xl font-semibold text-[var(--text-strong)]">Recibos del dia</h3>
            </div>
            <span className="rounded-full bg-[var(--surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)]">
              {productiveOrdersToday.length} activos
            </span>
          </div>
          <div className="app-scrollbar mt-5 max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {todaysOrders.length === 0 ? (
              <div className="rounded-[22px] bg-[var(--surface-base)] px-4 py-8 text-center text-sm text-[var(--text-soft)]">
                Aun no hay recibos generados hoy.
              </div>
            ) : (
              todaysOrders.map((order) => (
                <div className="rounded-[22px] border border-[rgba(118,93,71,0.1)] bg-[var(--surface-base)] p-4" key={order.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                        Factura #{getReceiptCode(order.id)}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">
                        {order.customerName?.trim() || order.customerPhone || "Cliente sin nombre"}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-faint)]">
                        {formatDateTime(order.createdAt)} - {getSummaryOrderStatusLabel(order.status)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-[var(--text-strong)]">{formatPrice(order.total)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PublicCartaShareCard({ tenantSlug }: { tenantSlug: string }) {
  const cartaUrl = getPublicCartaUrl(tenantSlug);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(cartaUrl, {
      color: {
        dark: "#201a16",
        light: "#edf2f7",
      },
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setQrDataUrl("");
      });

    return () => {
      active = false;
    };
  }, [cartaUrl]);

  async function copyCartaUrl() {
    try {
      await navigator.clipboard.writeText(cartaUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="app-panel overflow-hidden rounded-[30px]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="p-6 sm:p-7">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-base)] px-3 py-1.5">
              <QrCode size={14} />
              Carta publica
            </span>
            <span className="rounded-full bg-[rgba(197,123,87,0.12)] px-3 py-1.5 text-[var(--warning)]">Solo lectura</span>
          </div>
          <h3 className="app-display mt-5 text-[3rem] leading-none text-[var(--text-strong)]">QR para clientes en mesa</h3>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-soft)]">
            Este QR abre la carta publica del restaurante. Los clientes solo pueden consultar platos, precios y componentes; no pueden editar productos ni agregar al menu.
          </p>
          <div className="mt-6 rounded-[22px] border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] px-4 py-3 text-sm font-semibold text-[var(--text-soft)]">
            <span className="block truncate">{cartaUrl}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-5 text-sm font-semibold text-white transition hover:bg-[#312923]"
              href={cartaUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink size={17} />
              Abrir carta
            </a>
            <button
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] px-5 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[var(--surface-base)]"
              onClick={() => void copyCartaUrl()}
              type="button"
            >
              <Copy size={17} />
              {copied ? "Link copiado" : "Copiar link"}
            </button>
          </div>
        </div>
        <div className="grid place-items-center bg-[linear-gradient(145deg,#201a16,#443228)] p-6">
          <div className="rounded-[30px] bg-[#edf2f7] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
            {qrDataUrl ? (
              <img alt="QR de la carta publica" className="h-56 w-56 rounded-[20px]" src={qrDataUrl} />
            ) : (
              <div className="grid h-56 w-56 place-items-center rounded-[20px] bg-white text-sm font-semibold text-[var(--text-soft)]">
                Generando QR...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryMetricCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "neutral" | "info" | "success";
  value: string;
}) {
  const palette = {
    neutral: "bg-[var(--surface-base)]",
    info: "bg-[var(--surface-pending)]",
    success: "bg-[var(--surface-confirmed)]",
  }[tone];

  return (
    <div className={`rounded-[22px] border border-[rgba(118,93,71,0.1)] p-4 ${palette}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{label}</p>
      <p className="mt-4 text-2xl font-semibold text-[var(--text-strong)]">{value}</p>
    </div>
  );
}

function SalesChart({ orders }: { orders: OrderSummary[] }) {
  if (orders.length === 0) {
    return (
      <div className="rounded-[22px] bg-[var(--surface-base)] px-4 py-12 text-center text-sm text-[var(--text-soft)]">
        Todavia no hay ventas registradas hoy para graficar.
      </div>
    );
  }

  const maxTotal = Math.max(...orders.map((order) => order.total), 1);

  return (
    <div className="space-y-4">
      <div className="flex h-[260px] items-end gap-3 rounded-[24px] bg-[var(--surface-base)] px-4 py-5">
        {orders.map((order) => {
          const height = Math.max((order.total / maxTotal) * 100, 12);
          const barTone = order.status === "cancelled"
            ? "bg-[rgba(197,123,87,0.4)]"
            : order.status === "delivered"
              ? "bg-[var(--success)]"
              : "bg-[#7b92ab]";

          return (
            <div className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2" key={order.id}>
              <span className="text-[11px] font-semibold text-[var(--text-faint)]">{formatCompactPrice(order.total)}</span>
              <div className="flex h-[180px] w-full items-end">
                <div
                  className={`w-full rounded-t-[16px] ${barTone}`}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className="max-w-full truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                #{getReceiptCode(order.id)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-semibold text-[var(--text-soft)]">
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-confirmed)] px-3 py-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" />
          Entregado
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-pending)] px-3 py-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#7b92ab]" />
          En curso
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(197,123,87,0.1)] px-3 py-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[rgba(197,123,87,0.6)]" />
          Cancelado
        </span>
      </div>
    </div>
  );
}

function getDayKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function getOrderDeltaLabel(delta: number) {
  if (delta > 0) {
    return `+${delta} vs ayer`;
  }

  if (delta < 0) {
    return `${delta} vs ayer`;
  }

  return "Igual que ayer";
}

function getSummaryOrderStatusLabel(status: OrderSummary["status"]) {
  return {
    new: "Nuevo",
    pending_restaurant_confirmation: "Pendiente restaurante",
    needs_customer_replacement: "Pendiente cliente",
    payment_pending_review: "Pago pendiente",
    accepted: "Aceptado",
    preparing: "Preparando",
    on_the_way: "Listo / delivery 30",
    delivered: "Entregado",
    cancelled: "Cancelado",
  }[status];
}

function getReceiptCode(orderId: string) {
  const compact = orderId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return compact.slice(-8) || orderId.slice(-8);
}

function formatCompactPrice(value: number | undefined) {
  return new Intl.NumberFormat("es-CO", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value ?? 0));
}

function Catalog({
  imageColumnReady,
  menuProductIds,
  onAddToMenu,
  products,
  onDelete,
  onSave,
}: {
  imageColumnReady: boolean;
  menuProductIds: Set<string>;
  onAddToMenu: (productId: string) => Promise<void>;
  products: Product[];
  onDelete: (productId: string) => Promise<void>;
  onSave: (product: ProductFormValue) => Promise<void>;
}) {
  const [modalProduct, setModalProduct] = useState<Partial<Product> | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isAddingToMenu, setIsAddingToMenu] = useState(false);
  const [categorySavingByProductId, setCategorySavingByProductId] = useState<Record<string, boolean>>({});
  const groupedProducts = useMemo(
    () => groupByCategorySection(products, (product) => product.category),
    [products],
  );

  useEffect(() => {
    setSelectedProductIds((current) => current.filter((productId) => products.some((product) => product.id === productId)));
  }, [products]);

  const selectedAddableIds = useMemo(
    () => selectedProductIds.filter((productId) => !menuProductIds.has(productId)),
    [menuProductIds, selectedProductIds],
  );

  async function handleAddSelectedToMenu() {
    if (selectedAddableIds.length === 0 || isAddingToMenu) {
      return;
    }

    setIsAddingToMenu(true);
    try {
      for (const productId of selectedAddableIds) {
        await onAddToMenu(productId);
      }
      setSelectedProductIds([]);
    } finally {
      setIsAddingToMenu(false);
    }
  }

  function toggleProductSelection(productId: string) {
    if (menuProductIds.has(productId)) {
      return;
    }
    setSelectedProductIds((current) => (
      current.includes(productId)
        ? current.filter((entry) => entry !== productId)
        : [...current, productId]
    ));
  }

  function toggleCategorySelection(productIds: string[]) {
    const selectableProductIds = productIds.filter((productId) => !menuProductIds.has(productId));
    if (selectableProductIds.length === 0) {
      return;
    }
    const allSelected = selectableProductIds.every((productId) => selectedProductIds.includes(productId));
    setSelectedProductIds((current) => {
      if (allSelected) {
        return current.filter((productId) => !selectableProductIds.includes(productId));
      }

      return Array.from(new Set([...current, ...selectableProductIds]));
    });
  }

  async function updateProductCategory(product: Product, nextCategory: string) {
    if (categorySavingByProductId[product.id]) {
      return;
    }
    setCategorySavingByProductId((current) => ({ ...current, [product.id]: true }));
    try {
      await onSave({
        id: product.id,
        name: product.name,
        description: product.description,
        basePrice: product.basePrice,
        imageUrl: product.imageUrl,
        isActive: product.isActive,
        category: nextCategory,
      });
    } finally {
      setCategorySavingByProductId((current) => ({ ...current, [product.id]: false }));
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <SectionTitle title="Catalogo" subtitle={`${products.length} productos`} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="app-panel-muted flex rounded-2xl p-1">
            <button
              className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${viewMode === "cards" ? "bg-[rgba(225,211,194,0.78)] text-[var(--text-strong)]" : "text-[var(--text-soft)]"}`}
              onClick={() => setViewMode("cards")}
              type="button"
            >
              <LayoutGrid size={16} />
              Tarjetas
            </button>
            <button
              className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${viewMode === "list" ? "bg-[rgba(225,211,194,0.78)] text-[var(--text-strong)]" : "text-[var(--text-soft)]"}`}
              onClick={() => setViewMode("list")}
              type="button"
            >
              <List size={16} />
              Lista
            </button>
          </div>
          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--panel)] px-5 text-sm font-semibold text-[var(--text-strong)] transition hover:bg-[var(--panel-strong)]"
            onClick={() => setModalProduct({ isActive: true })}
            type="button"
          >
            <Plus size={17} />
            Nuevo producto
          </button>
          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-5 text-sm font-semibold text-white transition hover:bg-[#312923]"
            onClick={() => setModalProduct(createCompositeProductDraft())}
            type="button"
          >
            <Plus size={17} />
            Nuevo compuesto
          </button>
        </div>
      </div>

      <div className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[rgba(255,242,227,0.16)] bg-[rgba(237,242,247,0.94)] px-4 py-3 text-[var(--text-strong)] shadow-[0_22px_70px_rgba(20,14,10,0.3)] backdrop-blur-xl lg:bottom-7">
        <p className="text-sm font-semibold text-[var(--text-soft)]">
          {selectedProductIds.length} seleccionados
          {selectedProductIds.length > selectedAddableIds.length ? ` · ${selectedProductIds.length - selectedAddableIds.length} ya estan en menu` : ""}
        </p>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={selectedAddableIds.length === 0 || isAddingToMenu}
          onClick={() => void handleAddSelectedToMenu()}
          type="button"
        >
          {isAddingToMenu ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
          Agregar seleccion al menu
        </button>
      </div>

      <div className="space-y-5">
        {groupedProducts.map((group) => {
          const productIds = group.items.map((product) => product.id);
          const selectableProductIds = productIds.filter((productId) => !menuProductIds.has(productId));
          const allSelected = selectableProductIds.length > 0 && selectableProductIds.every((productId) => selectedProductIds.includes(productId));

          return (
            <section className="app-panel rounded-[28px] overflow-hidden" key={group.id}>
              <div className="flex flex-col gap-3 border-b border-[rgba(118,93,71,0.12)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{group.label}</p>
                  <h3 className="app-display mt-2 text-[2rem] leading-none text-[var(--text-strong)]">{group.items.length} productos</h3>
                </div>
                <button
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-[rgba(118,93,71,0.12)] px-4 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[rgba(223,210,194,0.55)] disabled:opacity-60"
                  onClick={() => toggleCategorySelection(productIds)}
                  disabled={selectableProductIds.length === 0}
                  type="button"
                >
                  {allSelected ? "Quitar seleccion" : "Seleccionar categoria"}
                </button>
              </div>

              {viewMode === "cards" ? (
                <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">
                  {group.items.map((product) => (
                    <ProductCard
                      inMenu={menuProductIds.has(product.id)}
                      isCategorySaving={Boolean(categorySavingByProductId[product.id])}
                      isSelected={selectedProductIds.includes(product.id)}
                      key={product.id}
                      onCategoryChange={(nextCategory) => void updateProductCategory(product, nextCategory)}
                      product={product}
                      onDelete={() => onDelete(product.id)}
                      onEdit={() => setModalProduct(product)}
                      onToggleSelect={() => toggleProductSelection(product.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  {group.items.map((product) => (
                    <ProductListRow
                      inMenu={menuProductIds.has(product.id)}
                      isCategorySaving={Boolean(categorySavingByProductId[product.id])}
                      isSelected={selectedProductIds.includes(product.id)}
                      key={product.id}
                      onCategoryChange={(nextCategory) => void updateProductCategory(product, nextCategory)}
                      product={product}
                      onDelete={() => onDelete(product.id)}
                      onEdit={() => setModalProduct(product)}
                      onToggleSelect={() => toggleProductSelection(product.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {products.length === 0 && (
        <div className="app-panel rounded-[28px] px-6 py-14 text-center">
          <p className="app-display text-[2rem] leading-none text-[var(--text-strong)]">Catalogo vacio</p>
        </div>
      )}

      {modalProduct && (
        <ProductModal
          imageColumnReady={imageColumnReady}
          initialProduct={modalProduct}
          onClose={() => setModalProduct(null)}
          onSave={async (product) => {
            await onSave(product);
            setModalProduct(null);
          }}
        />
      )}
    </section>
  );
}

function ProductCard({
  inMenu,
  isCategorySaving,
  isSelected,
  onCategoryChange,
  product,
  onDelete,
  onEdit,
  onToggleSelect,
}: {
  inMenu: boolean;
  isCategorySaving: boolean;
  isSelected: boolean;
  onCategoryChange: (nextCategory: string) => void;
  product: Product;
  onDelete: () => void;
  onEdit: () => void;
  onToggleSelect: () => void;
}) {
  return (
    <article className={`group overflow-hidden rounded-[28px] border transition ${isSelected ? "border-[rgba(197,123,87,0.28)] bg-[rgba(228,215,198,0.92)]" : "app-panel"}`}>
      <div className="relative aspect-[4/2.45] overflow-hidden bg-[rgba(118,93,71,0.08)]">
        {product.imageUrl ? (
          <img alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" src={product.imageUrl} />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.38),transparent_58%),linear-gradient(135deg,rgba(223,231,240,0.96),rgba(216,228,241,0.86))]">
            <span
              aria-label={`Emoji sugerido para ${product.name}`}
              className="text-[4.4rem] drop-shadow-[0_14px_28px_rgba(20,14,10,0.16)]"
              role="img"
            >
              {product.emoji || inferProductEmoji(product)}
            </span>
          </div>
        )}
        <button
          className={`absolute right-4 top-4 inline-flex h-10 items-center justify-center rounded-2xl px-3 text-sm font-semibold transition ${inMenu ? "cursor-not-allowed bg-[rgba(98,84,72,0.82)] text-[rgba(246,236,223,0.78)]" : isSelected ? "bg-[var(--text-strong)] text-white" : "bg-[rgba(229,215,197,0.9)] text-[var(--text-strong)]"}`}
          disabled={inMenu}
          onClick={onToggleSelect}
          type="button"
        >
          {inMenu ? "Ya en menu" : isSelected ? "Seleccionado" : "Seleccionar"}
        </button>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(22,18,16,0.7)] via-transparent to-transparent p-5">
          <span className="inline-flex rounded-full bg-[rgba(255,250,244,0.16)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/90 backdrop-blur">
            {product.category || "sin categoria"}
          </span>
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-[var(--text-strong)]">{product.name}</h3>
            {product.productType === "composite" ? (
              <span className="mt-2 inline-flex rounded-full bg-[rgba(197,123,87,0.12)] px-3 py-1 text-xs font-semibold text-[var(--warning)]">
                Producto compuesto · {product.options?.length ?? 0} grupos
              </span>
            ) : null}
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-soft)]">{product.description}</p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-[var(--text-strong)]">{formatPrice(product.basePrice)}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <CategorySelect
            disabled={isCategorySaving}
            onChange={onCategoryChange}
            value={product.category}
          />
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] px-4 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[rgba(223,210,194,0.55)]"
            onClick={onEdit}
            type="button"
          >
            <Edit3 size={16} />
            Editar
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[rgba(180,94,84,0.18)] px-4 text-sm font-semibold text-[#8c4e47] transition hover:bg-[rgba(190,110,95,0.08)]"
            onClick={onDelete}
            type="button"
          >
            <Trash2 size={16} />
            Eliminar
          </button>
        </div>
      </div>
    </article>
  );
}

function ProductListRow({
  inMenu,
  isCategorySaving,
  isSelected,
  onCategoryChange,
  product,
  onDelete,
  onEdit,
  onToggleSelect,
}: {
  inMenu: boolean;
  isCategorySaving: boolean;
  isSelected: boolean;
  onCategoryChange: (nextCategory: string) => void;
  product: Product;
  onDelete: () => void;
  onEdit: () => void;
  onToggleSelect: () => void;
}) {
  return (
    <article className={`rounded-[24px] border px-4 py-4 transition ${isSelected ? "border-[rgba(197,123,87,0.28)] bg-[rgba(228,215,198,0.92)]" : "border-[rgba(118,93,71,0.1)] bg-[rgba(226,214,198,0.82)]"}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex items-start gap-4">
          <ProductImage
            description={product.description}
            emoji={product.emoji}
            imageUrl={product.imageUrl}
            name={product.name}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-[var(--text-strong)]">{product.name}</h3>
              <span className="rounded-full bg-[rgba(118,93,71,0.08)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                {product.category || "sin categoria"}
              </span>
              {product.productType === "composite" ? (
                <span className="rounded-full bg-[rgba(197,123,87,0.12)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--warning)]">
                  Compuesto · {product.options?.length ?? 0}
                </span>
              ) : null}
            </div>
            {product.description ? (
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-soft)]">{product.description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-2 text-sm font-semibold text-[var(--text-strong)]">{formatPrice(product.basePrice)}</p>
          <button
            className={`inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition ${inMenu ? "cursor-not-allowed border border-[rgba(118,93,71,0.1)] bg-[rgba(98,84,72,0.12)] text-[var(--text-faint)]" : isSelected ? "bg-[var(--text-strong)] text-white" : "border border-[rgba(118,93,71,0.12)] text-[var(--text-soft)] hover:bg-[rgba(223,210,194,0.55)]"}`}
            disabled={inMenu}
            onClick={onToggleSelect}
            type="button"
          >
            {inMenu ? "Ya en menu" : isSelected ? "Seleccionado" : "Seleccionar"}
          </button>
          <CategorySelect
            disabled={isCategorySaving}
            onChange={onCategoryChange}
            value={product.category}
          />
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] px-4 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[rgba(223,210,194,0.55)]"
            onClick={onEdit}
            type="button"
          >
            <Edit3 size={16} />
            Editar
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[rgba(180,94,84,0.18)] px-4 text-sm font-semibold text-[#8c4e47] transition hover:bg-[rgba(190,110,95,0.08)]"
            onClick={onDelete}
            type="button"
          >
            <Trash2 size={16} />
            Eliminar
          </button>
        </div>
      </div>
    </article>
  );
}

function CategorySelect({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (nextCategory: string) => void;
  value?: string;
}) {
  const options = [
    { id: "desayunos", label: "Desayunos" },
    { id: "almuerzos", label: "Almuerzos" },
    { id: "adiciones", label: "Adiciones" },
    { id: "bebidas", label: "Bebidas" },
  ];

  return (
    <select
      className="h-11 rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[rgba(223,210,194,0.45)] px-3 text-sm font-semibold text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={value ?? "adiciones"}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function EmojiSelect({
  description,
  name,
  onChange,
  value,
}: {
  description?: string;
  name: string;
  onChange: (emoji: string) => void;
  value?: string;
}) {
  const suggestedEmoji = inferProductEmoji({ description, name });
  const selectedEmoji = value || suggestedEmoji;
  const options = Array.from(new Set([selectedEmoji, suggestedEmoji, ...availableProductEmojis]));
  const quickOptions = Array.from(new Set([selectedEmoji, suggestedEmoji, ...foodEmojiRules.map((rule) => rule.emoji)])).slice(0, 36);

  return (
    <div className="rounded-[22px] border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Emoji</p>
          <p className="mt-1 text-xs text-[var(--text-soft)]">Sugerido por nombre y descripcion</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--panel-strong)] text-[1.5rem] ring-1 ring-[rgba(118,93,71,0.1)]">
          {selectedEmoji}
        </span>
      </div>
      <select
        aria-label={`Seleccionar emoji para ${name}`}
        className="mb-3 h-12 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[var(--panel-strong)] px-4 text-xl outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
        onChange={(event) => onChange(event.target.value)}
        value={selectedEmoji}
      >
        {options.map((emoji) => (
          <option key={emoji} value={emoji}>
            {emoji}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
        {quickOptions.map((emoji) => (
          <button
            aria-label={`Seleccionar emoji ${emoji}`}
            className={`grid h-9 w-9 place-items-center rounded-xl text-[1.25rem] transition ${
              selectedEmoji === emoji
                ? "bg-[var(--text-strong)] shadow-[0_8px_20px_rgba(20,14,10,0.18)]"
                : "bg-[var(--panel-strong)] hover:bg-white"
            }`}
            key={emoji}
            onClick={() => onChange(emoji)}
            type="button"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

function CompactEmojiSelect({
  description,
  name,
  onChange,
  value,
}: {
  description?: string;
  name: string;
  onChange: (emoji: string) => void;
  value?: string;
}) {
  const suggestedEmoji = inferProductEmoji({ description, name });
  const selectedEmoji = value || suggestedEmoji;
  const options = Array.from(new Set([selectedEmoji, suggestedEmoji, ...availableProductEmojis]));

  return (
    <select
      aria-label={`Emoji para ${name}`}
      className="h-11 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] px-3 text-center text-xl outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
      onChange={(event) => onChange(event.target.value)}
      value={selectedEmoji}
    >
      {options.map((emoji) => (
        <option key={emoji} value={emoji}>
          {emoji}
        </option>
      ))}
    </select>
  );
}

function ProductTypeSelector({ onChange, value }: { onChange: (value: Product["productType"]) => void; value: Product["productType"] }) {
  const options = [
    {
      id: "simple" as const,
      title: "Producto simple",
      copy: "Plato fijo sin selecciones internas.",
    },
    {
      id: "composite" as const,
      title: "Producto compuesto",
      copy: "Plato con grupos de componentes para elegir.",
    },
  ];

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Tipo de producto</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = value === option.id;
          return (
            <button
              className={`rounded-[22px] border px-4 py-4 text-left transition ${
                active
                  ? "border-[rgba(197,123,87,0.28)] bg-[rgba(197,123,87,0.1)] text-[var(--text-strong)]"
                  : "border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] text-[var(--text-soft)] hover:bg-[var(--surface-muted)]"
              }`}
              key={option.id}
              onClick={() => onChange(option.id)}
              type="button"
            >
              <p className="text-sm font-extrabold">{option.title}</p>
              <p className="mt-2 text-xs leading-5">{option.copy}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompositeOptionsEditor({ onChange, options }: { onChange: (options: ProductOption[]) => void; options: ProductOption[] }) {
  function updateOption(index: number, patch: Partial<ProductOption>) {
    onChange(options.map((option, optionIndex) => (optionIndex === index ? { ...option, ...patch } : option)));
  }

  function updateValue(optionIndex: number, valueIndex: number, patch: Partial<ProductOption["values"][number]>) {
    onChange(options.map((option, currentOptionIndex) => {
      if (currentOptionIndex !== optionIndex) return option;
      return {
        ...option,
        values: option.values.map((value, currentValueIndex) => (
          currentValueIndex === valueIndex ? { ...value, ...patch } : value
        )),
      };
    }));
  }

  function addValue(optionIndex: number) {
    onChange(options.map((option, currentOptionIndex) => {
      if (currentOptionIndex !== optionIndex) return option;
      return {
        ...option,
        values: [
          ...option.values,
          { name: "", priceDelta: 0, isActive: true, sortOrder: option.values.length * 10 },
        ],
      };
    }));
  }

  function removeValue(optionIndex: number, valueIndex: number) {
    onChange(options.map((option, currentOptionIndex) => {
      if (currentOptionIndex !== optionIndex) return option;
      return {
        ...option,
        values: option.values.filter((_, currentValueIndex) => currentValueIndex !== valueIndex),
      };
    }));
  }

  return (
    <section className="rounded-[26px] border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Componentes del plato</p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
            Crea grupos como acompanante, principio o ensalada. Si un grupo tiene una opcion activa, queda incluida; si tiene varias, el cliente elige.
          </p>
        </div>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:bg-[#312923]"
          onClick={() => onChange([...options, createEmptyCompositeOption(options.length * 10)])}
          type="button"
        >
          <Plus size={16} />
          Agregar grupo
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {options.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-[rgba(118,93,71,0.22)] px-4 py-8 text-center text-sm leading-6 text-[var(--text-soft)]">
            Agrega al menos un grupo para convertir este producto en compuesto.
          </div>
        ) : null}

        {options.map((option, optionIndex) => (
          <article className="rounded-[24px] border border-[rgba(118,93,71,0.12)] bg-[var(--panel-strong)] p-4" key={`${option.name}-${optionIndex}`}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_130px_auto]">
              <TextInput
                label="Grupo"
                onChange={(value) => updateOption(optionIndex, { name: value })}
                placeholder="Ej. Acompanante"
                value={option.name}
              />
              <TextInput
                label="Min"
                onChange={(value) => updateOption(optionIndex, { minSelect: Number(value), isRequired: Number(value) > 0 })}
                placeholder="1"
                type="number"
                value={String(option.minSelect)}
              />
              <TextInput
                label="Max"
                onChange={(value) => updateOption(optionIndex, { maxSelect: Number(value) })}
                placeholder="1"
                type="number"
                value={String(option.maxSelect)}
              />
              <button
                className="self-end inline-flex h-12 items-center justify-center rounded-2xl border border-[rgba(180,94,84,0.18)] px-3 text-sm font-semibold text-[#8c4e47] transition hover:bg-[rgba(190,110,95,0.08)]"
                onClick={() => onChange(options.filter((_, currentIndex) => currentIndex !== optionIndex))}
                type="button"
              >
                Quitar
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {option.values.map((value, valueIndex) => (
                <div className="grid gap-2 rounded-[18px] bg-[var(--surface-base)] p-3 sm:grid-cols-[minmax(0,1fr)_120px_auto_auto]" key={`${value.name}-${valueIndex}`}>
                  <input
                    className="h-11 rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[var(--panel-strong)] px-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
                    onChange={(event) => updateValue(optionIndex, valueIndex, { name: event.target.value })}
                    placeholder="Ej. Yuca"
                    value={value.name}
                  />
                  <input
                    className="h-11 rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[var(--panel-strong)] px-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
                    onChange={(event) => updateValue(optionIndex, valueIndex, { priceDelta: Number(event.target.value) })}
                    placeholder="+ COP"
                    type="number"
                    value={String(value.priceDelta)}
                  />
                  <label className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] px-3 text-sm font-semibold text-[var(--text-soft)]">
                    <input
                      checked={value.isActive}
                      onChange={(event) => updateValue(optionIndex, valueIndex, { isActive: event.target.checked })}
                      type="checkbox"
                    />
                    Activo
                  </label>
                  <button
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-[rgba(180,94,84,0.18)] px-3 text-sm font-semibold text-[#8c4e47]"
                    onClick={() => removeValue(optionIndex, valueIndex)}
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <button
              className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] px-3 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[var(--surface-muted)]"
              onClick={() => addValue(optionIndex)}
              type="button"
            >
              <Plus size={15} />
              Agregar opcion
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductModal({
  imageColumnReady,
  initialProduct,
  onClose,
  onSave,
}: {
  imageColumnReady: boolean;
  initialProduct: Partial<Product>;
  onClose: () => void;
  onSave: (product: ProductFormValue) => Promise<void>;
}) {
  const [form, setForm] = useState<ProductFormValue>(() => {
    const productType = initialProduct.productType ?? "simple";
    return {
      ...initialProduct,
      productType,
      category: initialProduct.category ?? (productType === "composite" ? "almuerzos" : "adiciones"),
      isActive: initialProduct.isActive ?? true,
      options: productType === "composite" && (!initialProduct.options || initialProduct.options.length === 0)
        ? createDefaultCompositeOptions()
        : initialProduct.options,
    };
  });
  const [previewUrl, setPreviewUrl] = useState(initialProduct.imageUrl ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const productType = form.productType ?? "simple";
  const modalTitle = form.id
    ? "Editar producto"
    : productType === "composite"
      ? "Nuevo producto compuesto"
      : "Nuevo producto";

  return (
    <Modal title={modalTitle} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsSaving(true);
          try {
            await onSave({
              ...form,
              basePrice: Number(form.basePrice ?? 0),
              emoji: form.emoji || inferProductEmoji({
                name: form.name ?? "Producto",
                description: form.description,
              }),
              options: form.productType === "composite" ? normalizeProductOptions(form.options) : [],
              productType: form.productType ?? "simple",
              isActive: form.isActive ?? true,
            });
          } finally {
            setIsSaving(false);
          }
        }}
      >
        <TextInput label="Nombre" onChange={(value) => setForm({ ...form, name: value })} placeholder="Ej. Almuerzo ejecutivo" value={form.name ?? ""} />
        <TextInput label="Precio base" onChange={(value) => setForm({ ...form, basePrice: Number(value) })} placeholder="22000" type="number" value={String(form.basePrice ?? "")} />
        <label className="block">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Categoria</span>
          <CategorySelect
            disabled={false}
            onChange={(category) => setForm({ ...form, category })}
            value={form.category}
          />
        </label>
        <ProductTypeSelector
          onChange={(productType) => setForm({
            ...form,
            productType,
            options: productType === "composite" && (!form.options || form.options.length === 0)
              ? createDefaultCompositeOptions()
              : form.options,
          })}
          value={productType}
        />
        <EmojiSelect
          description={form.description}
          name={form.name ?? "Producto"}
          onChange={(emoji) => setForm({ ...form, emoji })}
          value={form.emoji}
        />
        <label className="block">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Imagen</span>
          <div className="rounded-[22px] border border-dashed border-[rgba(118,93,71,0.18)] bg-[rgba(248,241,232,0.72)] p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="shrink-0">
                <ProductImage
                  description={form.description}
                  emoji={form.emoji}
                  imageUrl={previewUrl}
                  large
                  name={form.name ?? "Producto"}
                />
              </div>
              <div className="min-w-0 flex-1">
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="block w-full text-sm text-[var(--text-soft)] file:mr-3 file:rounded-2xl file:border-0 file:bg-[var(--text-strong)] file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!imageColumnReady}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setForm({ ...form, imageFile: file, imageUrl: undefined });
                    setPreviewUrl(URL.createObjectURL(file));
                  }}
                  type="file"
                />
                <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
                  {imageColumnReady
                    ? "Sube JPG, PNG o WebP. La imagen se guarda en el bucket product-images."
                    : "Imagen desactivada: falta aplicar la migracion products.image_url. El producto igual se puede guardar."}
                </p>
              </div>
            </div>
          </div>
        </label>
        <TextInput label="Descripcion" onChange={(value) => setForm({ ...form, description: value })} placeholder="Descripcion corta para WhatsApp" value={form.description ?? ""} />
        {productType === "composite" && (
          <CompositeOptionsEditor
            options={form.options ?? []}
            onChange={(options) => setForm({ ...form, options })}
          />
        )}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-[rgba(118,93,71,0.12)] px-4 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[rgba(248,241,232,0.6)]"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-5 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSaving}
            type="submit"
          >
            {isSaving && <Loader2 className="animate-spin" size={16} />}
            {isSaving ? "Guardando" : "Guardar producto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SmartUpload({
  onAnalyze,
  onCreateProducts,
  onNotify,
}: {
  onAnalyze: (file: File) => Promise<{ products: DetectedMenuProduct[] }>;
  onCreateProducts: (products: DetectedMenuProduct[]) => Promise<void>;
  onNotify: (message: string) => void;
}) {
  const [preview, setPreview] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<DetectedMenuProduct[]>([]);
  const [error, setError] = useState("");

  function updateDetectedProduct(index: number, patch: Partial<DetectedMenuProduct>) {
    setResults((current) => current.map((product, entryIndex) => (
      entryIndex === index ? { ...product, ...patch } : product
    )));
  }

  function removeDetectedProduct(index: number) {
    setResults((current) => current.filter((_, entryIndex) => entryIndex !== index));
  }

  function readFile(file?: File) {
    if (!file) return;
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setResults([]);
    setError("");
  }

  async function analyzeSelectedFile() {
    if (!selectedFile) return;
    setIsAnalyzing(true);
    setError("");
    try {
      const payload = await onAnalyze(selectedFile);
      setResults(payload.products.map((product) => ({
        ...product,
        emoji: product.emoji || inferProductEmoji({
          name: product.name,
          description: product.description,
        }),
      })));
      onNotify(payload.products.length > 0 ? "Menu analizado" : "No se detectaron platos");
    } catch (analysisError) {
      setError(analysisError instanceof Error && analysisError.message === "gemini_quota_exhausted"
        ? "Gemini no tiene creditos disponibles para analizar la imagen."
        : "No se pudo analizar la imagen. Revisa la foto o la configuracion de Gemini.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function importResults() {
    const sanitizedResults = results
      .map((product) => ({
        ...product,
        name: product.name.trim(),
        description: product.description?.trim(),
        basePrice: Number(product.basePrice ?? 0),
        category: product.category?.trim(),
        emoji: product.emoji || inferProductEmoji({
          name: product.name,
          description: product.description,
        }),
      }))
      .filter((product) => product.name && product.basePrice > 0);

    if (sanitizedResults.length === 0) {
      setError("No hay productos validos para confirmar. Revisa nombre y precio.");
      return;
    }

    setIsImporting(true);
    setError("");
    try {
      await onCreateProducts(sanitizedResults);
      setResults([]);
      onNotify("Productos agregados al catalogo");
    } catch {
      setError("No se pudieron guardar todos los productos detectados.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="space-y-6">
      <SectionTitle
        title="Subida inteligente"
        subtitle="Convierte una foto del menu en una base editable de productos antes de publicarlos."
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <label className="rounded-[30px] border border-[rgba(255,242,227,0.08)] bg-[rgba(255,248,240,0.06)] p-6 text-[var(--text-on-dark)] shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
          <input accept="image/*" className="sr-only" onChange={(event) => readFile(event.target.files?.[0])} type="file" />
          <div className={`flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-[rgba(255,242,227,0.14)] px-6 text-center transition hover:border-[rgba(255,242,227,0.22)] ${preview ? "overflow-hidden bg-[rgba(255,248,240,0.04)]" : "bg-[rgba(255,248,240,0.04)]"}`}>
            {preview ? (
              <img alt="Preview del menu" className="h-full w-full rounded-[20px] object-cover" src={preview} />
            ) : (
              <>
                <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[rgba(255,248,240,0.12)]">
                  <Sparkles size={26} />
                </div>
                <p className="app-display text-[2.3rem] leading-none">Sube una foto del menu</p>
                <p className="mt-4 max-w-md text-sm leading-7 text-[rgba(246,236,223,0.66)]">
                  Usa una captura limpia y deja que el sistema detecte productos y precios para convertirlos en entidades editables.
                </p>
              </>
            )}
          </div>
        </label>

        <div className="app-panel rounded-[28px] p-5">
          <div className="mb-4 rounded-[22px] border border-[rgba(137,164,196,0.18)] bg-[var(--surface-pending)] px-4 py-4">
            <p className="text-sm font-semibold text-[var(--text-strong)]">Deteccion recomendada: 30 platos o menos</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">
              El analisis devuelve hasta 30 productos por imagen. Para menus grandes, toma varias fotos divididas por seccion.
            </p>
          </div>
          <button
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!selectedFile || isAnalyzing}
            onClick={() => void analyzeSelectedFile()}
            type="button"
          >
            {isAnalyzing ? <Loader2 className="animate-spin" size={17} /> : <SearchCheck size={17} />}
            {isAnalyzing ? "Analizando menu" : "Analizar menu"}
          </button>
          {error && (
            <p className="mt-3 rounded-[20px] border border-[rgba(180,94,84,0.18)] bg-[rgba(190,110,95,0.08)] px-4 py-3 text-sm font-medium text-[#8c4e47]">
              {error}
            </p>
          )}
          <div className="mt-4 space-y-2">
            {results.length === 0 && (
              <div className="rounded-[22px] bg-[var(--surface-base)] px-4 py-8 text-center text-sm text-[var(--text-soft)]">
                <Camera className="mx-auto mb-3 text-[var(--text-faint)]" size={22} />
                Los productos detectados apareceran aqui con su precio y categoria sugerida.
              </div>
            )}
            {results.length > 0 && (
              <div className="rounded-[22px] border border-[rgba(118,93,71,0.1)] bg-[var(--surface-base)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-strong)]">Edicion rapida</p>
                    <p className="mt-1 text-xs text-[var(--text-faint)]">{results.length} productos detectados</p>
                  </div>
                  <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1 text-xs font-semibold text-[var(--text-soft)]">
                    Revisa antes de confirmar
                  </span>
                </div>
              </div>
            )}
            {results.map((item, index) => (
              <div className="rounded-[22px] border border-[rgba(118,93,71,0.1)] bg-[var(--panel-strong)] p-4" key={`${item.name}-${index}`}>
                <div className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-[76px_minmax(0,1fr)_140px]">
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Emoji</span>
                      <CompactEmojiSelect
                        description={item.description}
                        name={item.name}
                        onChange={(emoji) => updateDetectedProduct(index, { emoji })}
                        value={item.emoji}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Producto</span>
                      <input
                        className="h-11 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] px-3 text-sm font-semibold text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
                        onChange={(event) => updateDetectedProduct(index, { name: event.target.value })}
                        value={item.name}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Precio</span>
                      <input
                        className="h-11 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] px-3 text-sm font-semibold text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
                        min="0"
                        onChange={(event) => updateDetectedProduct(index, { basePrice: Number(event.target.value) })}
                        type="number"
                        value={Number(item.basePrice ?? 0)}
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Categoria</span>
                      <CategorySelect
                        disabled={false}
                        onChange={(category) => updateDetectedProduct(index, { category })}
                        value={item.category}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Descripcion</span>
                      <input
                        className="h-11 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
                        onChange={(event) => updateDetectedProduct(index, { description: event.target.value })}
                        placeholder="Descripcion corta para WhatsApp"
                        value={item.description ?? ""}
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                      {item.confidence !== undefined ? `Confianza ${Math.round(item.confidence * 100)}%` : "Producto detectado"}
                    </p>
                    <button
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[rgba(180,94,84,0.18)] px-3 text-xs font-semibold text-[#8c4e47] transition hover:bg-[rgba(190,110,95,0.08)]"
                      onClick={() => removeDetectedProduct(index)}
                      type="button"
                    >
                      <Trash2 size={14} />
                      Quitar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {results.length > 0 && (
            <button
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] bg-white/70 px-4 text-sm font-semibold text-[var(--text-strong)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isImporting}
              onClick={() => void importResults()}
              type="button"
            >
              {isImporting ? <Loader2 className="animate-spin" size={17} /> : <Check size={17} />}
              {isImporting ? "Guardando resultados" : "Confirmar productos"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function ConfigRequiredScreen() {
  return (
    <StandaloneFrame
      eyebrow="Configuracion requerida"
      title="Activa Supabase Auth para entrar al dashboard"
      description="Antes de usar la interfaz, define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para habilitar el login."
    />
  );
}

function LoadingScreen() {
  return (
    <CenteredStatus
      title="Cargando sesion"
      description="Estamos recuperando la sesion del operador y preparando la shell del dashboard."
    />
  );
}

function TenantLoadingScreen() {
  return (
    <CenteredStatus
      title="Resolviendo empresa"
      description="Validamos el usuario y buscamos los tenants asignados antes de cargar la operacion."
    />
  );
}

function TenantErrorScreen({ error, onLogout }: { error: string; onLogout: () => Promise<void> }) {
  return (
    <StandaloneFrame
      actions={(
        <button
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-[var(--panel)] px-5 text-sm font-semibold text-[var(--text-strong)] transition hover:bg-[var(--panel-strong)]"
          onClick={() => void onLogout()}
          type="button"
        >
          Salir
        </button>
      )}
      eyebrow="No se pudo cargar la empresa"
      title="El usuario existe, pero el tenant no pudo resolverse"
      description="La sesion esta activa, pero el dashboard no logro consultar el backend para resolver permisos o tenants visibles."
    >
      <div className="rounded-[22px] border border-[rgba(180,94,84,0.18)] bg-[rgba(190,110,95,0.08)] px-4 py-4 text-sm leading-6 text-[#f4d6cf]">
        {error}
      </div>
    </StandaloneFrame>
  );
}

function LoginScreen({ error, onLogin }: { error: string; onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="grid min-h-screen place-items-center px-4 py-8">
      <div className="grid w-full max-w-[1120px] overflow-hidden rounded-[34px] border border-[rgba(255,242,227,0.1)] bg-[rgba(30,26,23,0.92)] shadow-[0_30px_90px_rgba(0,0,0,0.32)] lg:grid-cols-[1.1fr_0.9fr]">
        <div className="border-b border-[rgba(255,242,227,0.08)] p-8 text-[var(--text-on-dark)] lg:border-b-0 lg:border-r lg:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(246,236,223,0.42)]">42day</p>
          <h1 className="app-display mt-6 text-[3.4rem] leading-none sm:text-[4.4rem]">
            Operacion limpia para equipos de restaurante.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-[rgba(246,236,223,0.7)] sm:text-[15px]">
            Inspirado en interfaces editoriales y silenciosas: menos ruido, mejores decisiones y foco absoluto en lo que se puede vender, confirmar o corregir.
          </p>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            <LoginHighlight title="Menu del dia" copy="Activa o pausa platos sin ambiguedad." />
            <LoginHighlight title="Pedidos vivos" copy="Acepta pedidos y gestiona agotados sin cambiar de contexto." />
            <LoginHighlight title="Catalogo base" copy="Mantiene una carta consistente para todos los tenants." />
            <LoginHighlight title="Subida asistida" copy="Extrae productos desde imagenes con IA." />
          </div>
        </div>

        <form
          className="p-8 lg:p-10"
          onSubmit={async (event) => {
            event.preventDefault();
            setIsSubmitting(true);
            try {
              await onLogin(email, password);
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <div className="app-panel rounded-[28px] p-6 sm:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Ingreso empresas</p>
            <h2 className="app-display mt-4 text-[2.5rem] leading-none text-[var(--text-strong)]">Entrar al dashboard</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">
              Cada usuario solo ve el tenant asignado en control.tenant_users y opera con su sesion de Supabase Auth.
            </p>
            <div className="mt-6 space-y-4">
              <TextInput label="Correo" onChange={setEmail} placeholder="empresa@correo.com" value={email} />
              <TextInput label="Contrasena" onChange={setPassword} placeholder="********" type="password" value={password} />
            </div>
            {error && <p className="mt-4 text-sm font-medium text-[#9a4b43]">{error}</p>}
            <button
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting && <Loader2 className="animate-spin" size={16} />}
              {isSubmitting ? "Entrando" : "Iniciar sesion"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NoTenantScreen({ onLogout }: { onLogout: () => Promise<void> }) {
  return (
    <StandaloneFrame
      actions={(
        <button
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-[var(--panel)] px-5 text-sm font-semibold text-[var(--text-strong)] transition hover:bg-[var(--panel-strong)]"
          onClick={() => void onLogout()}
          type="button"
        >
          Salir
        </button>
      )}
      eyebrow="Usuario sin tenant"
      title="La cuenta no tiene relacion activa con ningun tenant"
      description="El usuario existe en Supabase Auth, pero aun no tiene una relacion activa en control.tenant_users."
    />
  );
}

type AdminRestaurantCreateForm = {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  locationName: string;
  locationAddress: string;
  locationPhone: string;
  deliveryFeeFixed: string;
};

type AdminRestaurantEditForm = {
  name: string;
  status: AdminRestaurantStatus;
  timezone: string;
  currency: string;
  automationEnabled: boolean;
  locationName: string;
  locationAddress: string;
  locationPhone: string;
  deliveryFeeFixed: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  locationAutomationEnabled: boolean;
  transferPaymentInstructions: string;
};

type AdminMemberForm = {
  email: string;
  name: string;
  role: AdminRestaurantMember["role"];
  password: string;
};

type AdminSection = "overview" | "settings" | "users";

const emptyAdminRestaurantCreateForm: AdminRestaurantCreateForm = {
  name: "",
  slug: "",
  ownerEmail: "",
  ownerName: "",
  ownerPassword: "",
  locationName: "Sede principal",
  locationAddress: "",
  locationPhone: "",
  deliveryFeeFixed: "0",
};

const emptyAdminMemberForm: AdminMemberForm = {
  email: "",
  name: "",
  role: "encargado",
  password: "",
};

const adminStatusCopy: Record<AdminRestaurantStatus, { label: string; description: string; className: string }> = {
  active: {
    label: "Activo",
    description: "Opera normalmente y aparece en accesos publicos.",
    className: "bg-[rgba(79,122,97,0.12)] text-[var(--success)]",
  },
  suspended: {
    label: "Pausado",
    description: "Acceso conservado, operacion y automatizacion detenidas.",
    className: "bg-[rgba(158,108,72,0.14)] text-[var(--warning)]",
  },
  inactive: {
    label: "Inactivo",
    description: "Retirado de operacion diaria sin borrar datos historicos.",
    className: "bg-[rgba(118,93,71,0.1)] text-[var(--text-soft)]",
  },
};

function buildAdminRestaurantEditForm(restaurant: AdminRestaurant): AdminRestaurantEditForm {
  return {
    name: restaurant.name,
    status: restaurant.status,
    timezone: restaurant.timezone,
    currency: restaurant.currency,
    automationEnabled: restaurant.automationEnabled,
    locationName: restaurant.location?.name ?? "Sede principal",
    locationAddress: restaurant.location?.address ?? "",
    locationPhone: restaurant.location?.phone ?? "",
    deliveryFeeFixed: String(restaurant.location?.deliveryFeeFixed ?? 0),
    pickupEnabled: restaurant.location?.pickupEnabled ?? true,
    deliveryEnabled: restaurant.location?.deliveryEnabled ?? true,
    locationAutomationEnabled: restaurant.location?.automationEnabled ?? true,
    transferPaymentInstructions: restaurant.location?.transferPaymentInstructions ?? "",
  };
}

function getAdminErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DashboardApiError) return error.backendError ?? error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function AdminOverviewScreen({ overview, onLogout }: { overview: AdminOverview; onLogout: () => Promise<void> }) {
  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [adminSection, setAdminSection] = useState<AdminSection>("overview");
  const [createForm, setCreateForm] = useState<AdminRestaurantCreateForm>(emptyAdminRestaurantCreateForm);
  const [editForm, setEditForm] = useState<AdminRestaurantEditForm | null>(null);
  const [memberForm, setMemberForm] = useState<AdminMemberForm>(emptyAdminMemberForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<{ label: string; password: string } | null>(null);

  const selectedRestaurant = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) ?? restaurants[0],
    [restaurants, selectedRestaurantId],
  );
  const activeRestaurantCount = restaurants.length > 0
    ? restaurants.filter((restaurant) => restaurant.status === "active").length
    : overview.activeRestaurantCount;
  const suspendedRestaurantCount = restaurants.filter((restaurant) => restaurant.status === "suspended").length;
  const inactiveRestaurantCount = restaurants.filter((restaurant) => restaurant.status === "inactive").length;
  const totalMemberCount = restaurants.reduce((sum, restaurant) => sum + restaurant.members.length, 0);
  const totalOrdersToday = restaurants.reduce((sum, restaurant) => sum + restaurant.metrics.ordersTodayCount, 0);
  const totalPendingOrders = restaurants.reduce((sum, restaurant) => sum + restaurant.metrics.pendingOrderCount, 0);
  const totalRevenueToday = restaurants.reduce((sum, restaurant) => sum + restaurant.metrics.revenueToday, 0);
  const filteredRestaurants = useMemo(() => {
    const query = restaurantSearch.trim().toLowerCase();
    if (!query) return restaurants;
    return restaurants.filter((restaurant) => (
      restaurant.name.toLowerCase().includes(query)
      || restaurant.slug.toLowerCase().includes(query)
      || restaurant.schemaName.toLowerCase().includes(query)
      || restaurant.members.some((member) => (
        (member.email ?? "").toLowerCase().includes(query)
        || (member.name ?? "").toLowerCase().includes(query)
      ))
    ));
  }, [restaurantSearch, restaurants]);

  useEffect(() => {
    let mounted = true;

    async function loadRestaurants() {
      setIsLoading(true);
      try {
        const payload = await listAdminRestaurants();
        if (!mounted) return;
        setRestaurants(payload.restaurants);
        setSelectedRestaurantId((current) => (
          current && payload.restaurants.some((restaurant) => restaurant.id === current)
            ? current
            : payload.restaurants[0]?.id ?? ""
        ));
        setError("");
      } catch (loadError) {
        if (!mounted) return;
        setError(getAdminErrorMessage(loadError, "No se pudieron cargar los restaurantes."));
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadRestaurants();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedRestaurant) {
      setEditForm(buildAdminRestaurantEditForm(selectedRestaurant));
    }
  }, [selectedRestaurant]);

  async function reloadRestaurants(nextSelectedId?: string) {
    const payload = await listAdminRestaurants();
    setRestaurants(payload.restaurants);
    setSelectedRestaurantId((current) => {
      const preferred = nextSelectedId ?? current;
      if (preferred && payload.restaurants.some((restaurant) => restaurant.id === preferred)) return preferred;
      return payload.restaurants[0]?.id ?? "";
    });
    return payload.restaurants;
  }

  async function handleCreateRestaurant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createForm.name.trim()) {
      setError("El nombre del restaurante es obligatorio.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = await createAdminRestaurant({
        name: createForm.name.trim(),
        slug: createForm.slug.trim() || undefined,
        ownerEmail: createForm.ownerEmail.trim() || undefined,
        ownerName: createForm.ownerName.trim() || undefined,
        ownerPassword: createForm.ownerPassword || undefined,
        locationName: createForm.locationName.trim() || "Sede principal",
        locationAddress: createForm.locationAddress.trim() || undefined,
        locationPhone: createForm.locationPhone.trim() || undefined,
        deliveryFeeFixed: Number(createForm.deliveryFeeFixed || 0),
      });
      await reloadRestaurants(payload.restaurant.id);
      setCreateForm(emptyAdminRestaurantCreateForm);
      setNotice(`Restaurante creado: ${payload.restaurant.name}`);
      if (payload.temporaryPassword) {
        setPasswordNotice({
          label: payload.owner?.email ? `Owner ${payload.owner.email}` : "Owner inicial",
          password: payload.temporaryPassword,
        });
      }
    } catch (createError) {
      setError(getAdminErrorMessage(createError, "No se pudo crear el restaurante."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveRestaurant() {
    if (!selectedRestaurant || !editForm) return;

    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = await updateAdminRestaurant(selectedRestaurant.id, {
        name: editForm.name.trim(),
        status: editForm.status,
        timezone: editForm.timezone.trim() || "America/Bogota",
        currency: editForm.currency.trim() || "COP",
        automationEnabled: editForm.automationEnabled,
        locationName: editForm.locationName.trim() || "Sede principal",
        locationAddress: editForm.locationAddress.trim(),
        locationPhone: editForm.locationPhone.trim(),
        deliveryFeeFixed: Number(editForm.deliveryFeeFixed || 0),
        pickupEnabled: editForm.pickupEnabled,
        deliveryEnabled: editForm.deliveryEnabled,
        locationAutomationEnabled: editForm.locationAutomationEnabled,
        transferPaymentInstructions: editForm.transferPaymentInstructions.trim(),
      });
      if (payload.restaurant) {
        setRestaurants((current) => current.map((restaurant) => (
          restaurant.id === payload.restaurant?.id ? payload.restaurant : restaurant
        )));
      } else {
        await reloadRestaurants(selectedRestaurant.id);
      }
      setNotice("Restaurante actualizado.");
    } catch (saveError) {
      setError(getAdminErrorMessage(saveError, "No se pudo actualizar el restaurante."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRestaurantStatus(status: AdminRestaurantStatus) {
    if (!selectedRestaurant) return;
    setEditForm((current) => current ? { ...current, status, automationEnabled: status === "active" ? current.automationEnabled : false } : current);
    setIsSaving(true);
    setError("");
    try {
      const payload = await updateAdminRestaurant(selectedRestaurant.id, {
        status,
        automationEnabled: status === "active" ? selectedRestaurant.automationEnabled : false,
      });
      if (payload.restaurant) {
        setRestaurants((current) => current.map((restaurant) => (
          restaurant.id === payload.restaurant?.id ? payload.restaurant : restaurant
        )));
      } else {
        await reloadRestaurants(selectedRestaurant.id);
      }
      setNotice(status === "active" ? "Restaurante reactivado." : "Restaurante pausado.");
    } catch (statusError) {
      setError(getAdminErrorMessage(statusError, "No se pudo cambiar el estado del restaurante."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteRestaurant() {
    if (!selectedRestaurant) return;
    const confirmed = window.confirm(`Esto inactiva ${selectedRestaurant.name}, sus usuarios y canales. Los datos historicos se conservan. Continuar?`);
    if (!confirmed) return;

    setIsSaving(true);
    setError("");
    try {
      await deleteAdminRestaurant(selectedRestaurant.id);
      await reloadRestaurants();
      setNotice("Restaurante inactivado.");
    } catch (deleteError) {
      setError(getAdminErrorMessage(deleteError, "No se pudo inactivar el restaurante."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRestaurant || !memberForm.email.trim()) return;

    setIsSaving(true);
    setError("");
    try {
      const payload = await createAdminRestaurantMember(selectedRestaurant.id, {
        email: memberForm.email.trim(),
        name: memberForm.name.trim() || undefined,
        role: memberForm.role,
        password: memberForm.password || undefined,
      });
      await reloadRestaurants(selectedRestaurant.id);
      setMemberForm(emptyAdminMemberForm);
      setPasswordNotice({
        label: payload.member.email ?? memberForm.email,
        password: payload.temporaryPassword,
      });
      setNotice("Miembro agregado al restaurante.");
    } catch (memberError) {
      setError(getAdminErrorMessage(memberError, "No se pudo agregar el miembro."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateMember(member: AdminRestaurantMember, patch: Partial<Pick<AdminRestaurantMember, "role" | "status" | "name">>) {
    if (!selectedRestaurant) return;
    setIsSaving(true);
    setError("");
    try {
      const payload = await updateAdminRestaurantMember(selectedRestaurant.id, member.userId, patch);
      if (payload.restaurant) {
        setRestaurants((current) => current.map((restaurant) => (
          restaurant.id === payload.restaurant?.id ? payload.restaurant : restaurant
        )));
      } else {
        await reloadRestaurants(selectedRestaurant.id);
      }
      setNotice("Usuario actualizado.");
    } catch (memberError) {
      setError(getAdminErrorMessage(memberError, "No se pudo actualizar el usuario."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveMember(member: AdminRestaurantMember) {
    if (!selectedRestaurant) return;
    const confirmed = window.confirm(`Quitar acceso a ${member.email ?? member.userId}?`);
    if (!confirmed) return;

    setIsSaving(true);
    setError("");
    try {
      await deleteAdminRestaurantMember(selectedRestaurant.id, member.userId);
      await reloadRestaurants(selectedRestaurant.id);
      setNotice("Usuario inactivado.");
    } catch (memberError) {
      setError(getAdminErrorMessage(memberError, "No se pudo inactivar el usuario."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResetMemberPassword(member: AdminRestaurantMember) {
    if (!selectedRestaurant) return;
    const requestedPassword = window.prompt(
      `Nueva contrasena para ${member.email ?? member.userId}`,
      selectedRestaurant.defaultPassword,
    );
    if (requestedPassword === null) return;

    setIsSaving(true);
    setError("");
    try {
      const payload = await resetAdminRestaurantMemberPassword(
        selectedRestaurant.id,
        member.userId,
        requestedPassword.trim() || undefined,
      );
      setPasswordNotice({
        label: member.email ?? member.userId,
        password: payload.temporaryPassword,
      });
      setNotice("Contrasena restablecida.");
    } catch (passwordError) {
      setError(getAdminErrorMessage(passwordError, "No se pudo restablecer la contrasena."));
    } finally {
      setIsSaving(false);
    }
  }

  async function copyToClipboard(value: string) {
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setNotice("Copiado al portapapeles.");
  }

  return (
    <div className="min-h-screen px-3 py-3 sm:px-4">
      <main className="mx-auto min-h-[calc(100vh-1.5rem)] w-full max-w-[1480px] rounded-[26px] border border-[var(--shell-border)] bg-[rgba(32,28,25,0.96)] p-4 text-[var(--text-on-dark)] shadow-[0_28px_90px_rgba(0,0,0,0.28)] sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--shell-border)] pb-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(246,236,223,0.48)]">Administrador 42day</p>
            <h1 className="mt-2 text-2xl font-extrabold text-[var(--text-on-dark)] sm:text-3xl">Gestion de restaurantes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[rgba(246,236,223,0.68)]">
              Consola central para alta, usuarios, estado operativo, metricas y configuracion de cada restaurante.
            </p>
          </div>
          <button
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-[rgba(255,242,227,0.12)] bg-[rgba(255,248,240,0.06)] px-4 text-sm font-semibold text-[rgba(246,236,223,0.82)] transition hover:bg-[rgba(255,248,240,0.12)] hover:text-[var(--text-on-dark)]"
            onClick={() => void onLogout()}
            type="button"
          >
            Salir
          </button>
        </header>

        <section className="grid gap-3 py-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <AdminMetricCard icon={<Store size={18} />} label="Restaurantes activos" value={String(activeRestaurantCount)} />
          <AdminMetricCard icon={<Power size={18} />} label="Pausados" value={String(suspendedRestaurantCount)} />
          <AdminMetricCard icon={<Users size={18} />} label="Usuarios vinculados" value={String(totalMemberCount)} />
          <AdminMetricCard icon={<ClipboardList size={18} />} label="Pedidos hoy" value={String(totalOrdersToday)} />
          <AdminMetricCard icon={<Bell size={18} />} label="Pendientes hoy" value={String(totalPendingOrders)} />
          <AdminMetricCard icon={<Utensils size={18} />} label="Ingresos hoy" value={formatPrice(totalRevenueToday)} />
          <AdminMetricCard icon={<Trash2 size={18} />} label="Inactivos" value={String(inactiveRestaurantCount)} />
        </section>

        {(error || notice || passwordNotice) && (
          <section className="mb-6 grid gap-3">
            {error && (
              <div className="rounded-[22px] border border-[rgba(180,94,84,0.2)] bg-[rgba(190,110,95,0.12)] px-4 py-3 text-sm font-semibold text-[#f3b7aa]">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-[22px] border border-[rgba(119,162,126,0.2)] bg-[rgba(79,122,97,0.13)] px-4 py-3 text-sm font-semibold text-[#cbe5d2]">
                {notice}
              </div>
            )}
            {passwordNotice && (
              <div className="rounded-[24px] border border-[rgba(255,242,227,0.12)] bg-[rgba(255,248,240,0.08)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(246,236,223,0.48)]">Contrasena temporal</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--text-on-dark)]">{passwordNotice.label}</p>
                    <p className="mt-1 rounded-2xl bg-[rgba(14,11,9,0.32)] px-3 py-2 font-mono text-sm text-[rgba(246,236,223,0.9)]">
                      {passwordNotice.password}
                    </p>
                  </div>
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--panel)] px-4 text-sm font-semibold text-[var(--text-strong)] transition hover:bg-[var(--panel-strong)]"
                    onClick={() => void copyToClipboard(passwordNotice.password)}
                    type="button"
                  >
                    <Copy size={16} />
                    Copiar
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="app-panel overflow-hidden rounded-[24px]">
            <div className="border-b border-[rgba(118,93,71,0.12)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Restaurantes</p>
                  <h2 className="mt-1 text-lg font-bold text-[var(--text-strong)]">{restaurants.length} clientes</h2>
                </div>
                {isLoading && <Loader2 className="animate-spin text-[var(--text-soft)]" size={18} />}
              </div>
              <label className="mt-4 flex h-11 items-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[rgba(255,251,246,0.82)] px-3">
                <Search size={16} className="text-[var(--text-faint)]" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--text-faint)]"
                  onChange={(event) => setRestaurantSearch(event.target.value)}
                  placeholder="Buscar por nombre, slug, schema o usuario"
                  value={restaurantSearch}
                />
              </label>
            </div>

            <div className="app-scrollbar max-h-[calc(100vh-390px)] min-h-[260px] overflow-y-auto p-3">
              {filteredRestaurants.length === 0 && !isLoading ? (
                <div className="rounded-[18px] bg-[var(--surface-base)] px-4 py-8 text-center text-sm text-[var(--text-soft)]">
                  No hay restaurantes para ese filtro.
                </div>
              ) : filteredRestaurants.map((restaurant) => (
                <button
                  className={`w-full rounded-[18px] border p-3 text-left transition ${
                    selectedRestaurant?.id === restaurant.id
                      ? "border-[rgba(197,123,87,0.38)] bg-[rgba(236,222,205,0.92)] shadow-[inset_4px_0_0_rgba(197,123,87,0.72)]"
                      : "border-transparent bg-transparent hover:border-[rgba(118,93,71,0.1)] hover:bg-[rgba(255,251,246,0.7)]"
                  }`}
                  key={restaurant.id}
                  onClick={() => setSelectedRestaurantId(restaurant.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--text-strong)]">{restaurant.name}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-[var(--text-faint)]">{restaurant.slug}</p>
                    </div>
                    <AdminStatusBadge status={restaurant.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-[var(--text-soft)]">
                    <span className="rounded-xl bg-[var(--surface-base)] px-2 py-2">{restaurant.members.length} usuarios</span>
                    <span className="rounded-xl bg-[var(--surface-base)] px-2 py-2">{restaurant.metrics.ordersTodayCount} pedidos</span>
                    <span className="rounded-xl bg-[var(--surface-base)] px-2 py-2">{restaurant.automationEnabled ? "Auto ON" : "Auto OFF"}</span>
                  </div>
                </button>
              ))}
            </div>

            <details className="border-t border-[rgba(118,93,71,0.12)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-bold text-[var(--text-strong)] sm:px-5">
                <span className="inline-flex items-center gap-2">
                  <UserPlus size={16} />
                  Crear restaurante
                </span>
                <Plus size={16} className="text-[var(--text-faint)]" />
              </summary>
              <form className="grid gap-4 border-t border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.42)] p-4 sm:p-5" onSubmit={(event) => void handleCreateRestaurant(event)}>
                <AdminTextInput
                  label="Nombre restaurante"
                  onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))}
                  placeholder="Ej. Arepas del Parque"
                  value={createForm.name}
                />
                <AdminTextInput
                  label="Slug publico"
                  onChange={(value) => setCreateForm((current) => ({ ...current, slug: value }))}
                  placeholder="arepas-del-parque"
                  value={createForm.slug}
                />
                <AdminTextInput
                  label="Owner email"
                  onChange={(value) => setCreateForm((current) => ({ ...current, ownerEmail: value }))}
                  placeholder="admin@restaurante.com"
                  value={createForm.ownerEmail}
                />
                <AdminTextInput
                  label="Owner nombre"
                  onChange={(value) => setCreateForm((current) => ({ ...current, ownerName: value }))}
                  placeholder="Encargado"
                  value={createForm.ownerName}
                />
                <AdminTextInput
                  label="Contrasena inicial"
                  onChange={(value) => setCreateForm((current) => ({ ...current, ownerPassword: value }))}
                  placeholder="vacio usa slug_42*password"
                  type="password"
                  value={createForm.ownerPassword}
                />
                <AdminTextInput
                  label="Sede"
                  onChange={(value) => setCreateForm((current) => ({ ...current, locationName: value }))}
                  placeholder="Sede principal"
                  value={createForm.locationName}
                />
                <AdminTextInput
                  label="Direccion"
                  onChange={(value) => setCreateForm((current) => ({ ...current, locationAddress: value }))}
                  placeholder="Direccion comercial"
                  value={createForm.locationAddress}
                />
                <AdminTextInput
                  label="Telefono sede"
                  onChange={(value) => setCreateForm((current) => ({ ...current, locationPhone: value }))}
                  placeholder="+57..."
                  value={createForm.locationPhone}
                />
                <AdminTextInput
                  label="Domicilio fijo"
                  onChange={(value) => setCreateForm((current) => ({ ...current, deliveryFeeFixed: value }))}
                  placeholder="0"
                  type="number"
                  value={createForm.deliveryFeeFixed}
                />
              <button
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                Crear restaurante
              </button>
            </form>
            </details>
          </aside>

          <section className="app-panel min-h-[720px] overflow-hidden rounded-[24px]">
            {!selectedRestaurant || !editForm ? (
              <div className="grid min-h-[720px] place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--surface-base)] text-[var(--text-soft)]">
                    <Store size={20} />
                  </span>
                  <h2 className="mt-5 text-2xl font-extrabold text-[var(--text-strong)]">Sin restaurante seleccionado</h2>
                  <p className="mt-3 max-w-md text-sm leading-7 text-[var(--text-soft)]">
                    Crea o selecciona un restaurante para editar informacion, usuarios y comportamiento operativo.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-[rgba(118,93,71,0.12)] bg-[rgba(255,251,246,0.46)] p-5 sm:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <AdminStatusBadge status={selectedRestaurant.status} />
                        <span className="rounded-full bg-[var(--surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)]">
                          {selectedRestaurant.slug}
                        </span>
                        <span className="rounded-full bg-[var(--surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)]">
                          {selectedRestaurant.automationEnabled ? "Automatizacion ON" : "Automatizacion OFF"}
                        </span>
                      </div>
                      <h2 className="mt-3 truncate text-3xl font-extrabold text-[var(--text-strong)]">{selectedRestaurant.name}</h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-soft)]">
                        {adminStatusCopy[selectedRestaurant.status].description}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] px-4 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[var(--surface-base)]"
                        href={selectedRestaurant.cartaUrlPath}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink size={16} />
                        Carta publica
                      </a>
                      <button
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] px-4 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[var(--surface-base)]"
                        onClick={() => void copyToClipboard(selectedRestaurant.defaultPassword)}
                        type="button"
                      >
                        <Copy size={16} />
                        Password default
                      </button>
                    </div>
                  </div>

                  <nav className="mt-5 flex flex-wrap gap-2 rounded-[18px] bg-[var(--surface-base)] p-2">
                    {[
                      { id: "overview" as const, label: "Resumen", icon: ClipboardList },
                      { id: "settings" as const, label: "Ajustes", icon: Power },
                      { id: "users" as const, label: "Usuarios", icon: Users },
                    ].map((tab) => {
                      const Icon = tab.icon;
                      const active = adminSection === tab.id;
                      return (
                        <button
                          className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold transition sm:flex-none ${
                            active
                              ? "bg-[var(--panel-strong)] text-[var(--text-strong)] shadow-sm"
                              : "text-[var(--text-soft)] hover:bg-[rgba(255,251,246,0.55)]"
                          }`}
                          key={tab.id}
                          onClick={() => setAdminSection(tab.id)}
                          type="button"
                        >
                          <Icon size={16} />
                          {tab.label}
                        </button>
                      );
                    })}
                  </nav>
                </div>

                {adminSection === "overview" && (
                  <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_330px]">
                    <div className="p-5 sm:p-6">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Comportamiento de hoy</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <AdminBehaviorMetric label="Productos activos" value={String(selectedRestaurant.metrics.activeProductCount)} />
                        <AdminBehaviorMetric label="Platos en menu" value={String(selectedRestaurant.metrics.todayMenuItemCount)} />
                        <AdminBehaviorMetric label="Pedidos hoy" value={String(selectedRestaurant.metrics.ordersTodayCount)} />
                        <AdminBehaviorMetric label="Pendientes" value={String(selectedRestaurant.metrics.pendingOrderCount)} />
                        <AdminBehaviorMetric label="Completados" value={String(selectedRestaurant.metrics.completedTodayCount)} />
                        <AdminBehaviorMetric label="Ingresos hoy" value={formatPrice(selectedRestaurant.metrics.revenueToday)} />
                      </div>

                      <div className="mt-6 grid gap-4 md:grid-cols-3">
                        <div className="rounded-[20px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.6)] p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">Canales</p>
                          <p className="mt-3 text-sm font-semibold text-[var(--text-strong)]">
                            {selectedRestaurant.location?.pickupEnabled ? "Pickup activo" : "Pickup apagado"}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[var(--text-strong)]">
                            {selectedRestaurant.location?.deliveryEnabled ? "Domicilio activo" : "Domicilio apagado"}
                          </p>
                        </div>
                        <div className="rounded-[20px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.6)] p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">Sede</p>
                          <p className="mt-3 text-sm font-semibold text-[var(--text-strong)]">{selectedRestaurant.location?.name ?? "Sede principal"}</p>
                          <p className="mt-1 text-sm text-[var(--text-soft)]">{selectedRestaurant.location?.phone || "Sin telefono"}</p>
                        </div>
                        <div className="rounded-[20px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.6)] p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">Usuarios</p>
                          <p className="mt-3 text-2xl font-extrabold text-[var(--text-strong)]">{selectedRestaurant.members.length}</p>
                          <p className="text-sm text-[var(--text-soft)]">vinculados al restaurante</p>
                        </div>
                      </div>
                    </div>

                    <aside className="border-t border-[rgba(118,93,71,0.12)] bg-[rgba(255,251,246,0.46)] p-5 xl:border-l xl:border-t-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Resumen tecnico</p>
                      <div className="mt-4 space-y-3 text-sm text-[var(--text-soft)]">
                        <AdminInfoLine label="Tenant ID" value={selectedRestaurant.id} />
                        <AdminInfoLine label="Schema" value={selectedRestaurant.schemaName} />
                        <AdminInfoLine label="Carta" value={selectedRestaurant.cartaUrlPath} />
                        <AdminInfoLine label="Ultimo pedido" value={formatDateTime(selectedRestaurant.metrics.lastOrderAt)} />
                        <AdminInfoLine label="Creado" value={formatDateTime(selectedRestaurant.createdAt)} />
                        <AdminInfoLine label="Actualizado" value={formatDateTime(selectedRestaurant.updatedAt)} />
                      </div>
                    </aside>
                  </div>
                )}

                {adminSection === "settings" && (
                  <div className="p-5 sm:p-6">
                    <div className="max-w-5xl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Configuracion operativa</p>
                      <div className="grid gap-4 md:grid-cols-2">
                        <AdminTextInput
                          label="Nombre"
                          onChange={(value) => setEditForm((current) => current ? { ...current, name: value } : current)}
                          placeholder="Nombre comercial"
                          value={editForm.name}
                        />
                        <AdminSelect
                          label="Estado"
                          onChange={(value) => setEditForm((current) => current ? { ...current, status: value as AdminRestaurantStatus } : current)}
                          value={editForm.status}
                        >
                          <option value="active">Activo</option>
                          <option value="suspended">Pausado</option>
                          <option value="inactive">Inactivo</option>
                        </AdminSelect>
                        <AdminTextInput
                          label="Zona horaria"
                          onChange={(value) => setEditForm((current) => current ? { ...current, timezone: value } : current)}
                          placeholder="America/Bogota"
                          value={editForm.timezone}
                        />
                        <AdminTextInput
                          label="Moneda"
                          onChange={(value) => setEditForm((current) => current ? { ...current, currency: value } : current)}
                          placeholder="COP"
                          value={editForm.currency}
                        />
                      </div>

                      <div className="mt-5 grid gap-3 rounded-[20px] border border-[rgba(118,93,71,0.1)] bg-[var(--surface-base)] p-4 md:grid-cols-3">
                        <AdminToggle
                          checked={editForm.automationEnabled}
                          label="Automatizacion tenant"
                          onChange={(checked) => setEditForm((current) => current ? { ...current, automationEnabled: checked } : current)}
                        />
                        <AdminToggle
                          checked={editForm.pickupEnabled}
                          label="Recoger en local"
                          onChange={(checked) => setEditForm((current) => current ? { ...current, pickupEnabled: checked } : current)}
                        />
                        <AdminToggle
                          checked={editForm.deliveryEnabled}
                          label="Domicilio"
                          onChange={(checked) => setEditForm((current) => current ? { ...current, deliveryEnabled: checked } : current)}
                        />
                      </div>

                      <div className="mt-6">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Informacion del restaurante</p>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <AdminTextInput
                            label="Nombre sede"
                            onChange={(value) => setEditForm((current) => current ? { ...current, locationName: value } : current)}
                            placeholder="Sede principal"
                            value={editForm.locationName}
                          />
                          <AdminTextInput
                            label="Telefono"
                            onChange={(value) => setEditForm((current) => current ? { ...current, locationPhone: value } : current)}
                            placeholder="+57..."
                            value={editForm.locationPhone}
                          />
                          <AdminTextInput
                            label="Direccion"
                            onChange={(value) => setEditForm((current) => current ? { ...current, locationAddress: value } : current)}
                            placeholder="Direccion comercial"
                            value={editForm.locationAddress}
                          />
                          <AdminTextInput
                            label="Domicilio fijo"
                            onChange={(value) => setEditForm((current) => current ? { ...current, deliveryFeeFixed: value } : current)}
                            placeholder="0"
                            type="number"
                            value={editForm.deliveryFeeFixed}
                          />
                        </div>
                        <label className="mt-4 block">
                          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Instrucciones transferencia</span>
                          <textarea
                            className="min-h-24 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[rgba(255,251,246,0.82)] px-4 py-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:bg-white focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
                            onChange={(event) => setEditForm((current) => current ? { ...current, transferPaymentInstructions: event.target.value } : current)}
                            placeholder="Cuenta, banco o instrucciones de pago..."
                            value={editForm.transferPaymentInstructions}
                          />
                        </label>
                      </div>

                      <div className="mt-6 flex flex-wrap gap-3">
                        <button
                          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-5 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving}
                          onClick={() => void handleSaveRestaurant()}
                          type="button"
                        >
                          {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                          Guardar cambios
                        </button>
                        <button
                          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[rgba(158,108,72,0.24)] px-5 text-sm font-semibold text-[var(--warning)] transition hover:bg-[rgba(158,108,72,0.08)]"
                          onClick={() => void handleRestaurantStatus(selectedRestaurant.status === "active" ? "suspended" : "active")}
                          type="button"
                        >
                          <Power size={16} />
                          {selectedRestaurant.status === "active" ? "Pausar" : "Reactivar"}
                        </button>
                        <button
                          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[rgba(180,94,84,0.24)] px-5 text-sm font-semibold text-[#9a4b43] transition hover:bg-[rgba(190,110,95,0.08)]"
                          onClick={() => void handleDeleteRestaurant()}
                          type="button"
                        >
                          <Trash2 size={16} />
                          Borrar acceso
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {adminSection === "users" && (
                  <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="p-5 sm:p-6">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Usuarios</p>
                          <h3 className="mt-2 text-lg font-semibold text-[var(--text-strong)]">{selectedRestaurant.members.length} miembros</h3>
                        </div>
                        <Users className="text-[var(--text-faint)]" size={18} />
                      </div>
                    <div className="mt-4 space-y-3">
                      {selectedRestaurant.members.length === 0 ? (
                        <div className="rounded-[22px] bg-[var(--surface-base)] px-4 py-8 text-center text-sm text-[var(--text-soft)]">
                          Este restaurante aun no tiene usuarios.
                        </div>
                      ) : selectedRestaurant.members.map((member) => (
                        <AdminMemberRow
                          isSaving={isSaving}
                          key={member.userId}
                          member={member}
                          onRemove={() => void handleRemoveMember(member)}
                          onResetPassword={() => void handleResetMemberPassword(member)}
                          onUpdate={(patch) => void handleUpdateMember(member, patch)}
                        />
                      ))}
                    </div>
                  </div>

                  <form className="border-t border-[rgba(118,93,71,0.12)] bg-[rgba(255,251,246,0.46)] p-5 xl:border-l xl:border-t-0 sm:p-6" onSubmit={(event) => void handleCreateMember(event)}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Nuevo miembro</p>
                    <h3 className="mt-2 text-lg font-bold text-[var(--text-strong)]">Agregar usuario</h3>
                    <div className="mt-5 space-y-4">
                      <AdminTextInput
                        label="Correo"
                        onChange={(value) => setMemberForm((current) => ({ ...current, email: value }))}
                        placeholder="usuario@restaurante.com"
                        value={memberForm.email}
                      />
                      <AdminTextInput
                        label="Nombre"
                        onChange={(value) => setMemberForm((current) => ({ ...current, name: value }))}
                        placeholder="Nombre visible"
                        value={memberForm.name}
                      />
                      <AdminSelect
                        label="Rol"
                        onChange={(value) => setMemberForm((current) => ({ ...current, role: value as AdminRestaurantMember["role"] }))}
                        value={memberForm.role}
                      >
                        <option value="encargado">Encargado</option>
                        <option value="trabajador">Trabajador</option>
                      </AdminSelect>
                      <AdminTextInput
                        label="Contrasena"
                        onChange={(value) => setMemberForm((current) => ({ ...current, password: value }))}
                        placeholder={selectedRestaurant.defaultPassword}
                        type="password"
                        value={memberForm.password}
                      />
                    </div>
                    <button
                      className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSaving}
                      type="submit"
                    >
                      {isSaving ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
                      Agregar miembro
                    </button>
                  </form>
                </div>
                )}
              </>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

function AdminMetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[rgba(255,242,227,0.08)] bg-[rgba(255,248,240,0.045)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgba(246,236,223,0.48)]">{label}</p>
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-[rgba(255,248,240,0.08)] text-[rgba(246,236,223,0.72)]">{icon}</span>
      </div>
      <p className="mt-2 truncate text-2xl font-extrabold text-[var(--text-on-dark)]">{value}</p>
    </div>
  );
}

function AdminBehaviorMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[rgba(118,93,71,0.1)] bg-[var(--surface-base)] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">{label}</p>
      <p className="mt-2 truncate text-lg font-bold text-[var(--text-strong)]">{value}</p>
    </div>
  );
}

function AdminTextInput(props: { label: string; onChange: (value: string) => void; placeholder: string; type?: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{props.label}</span>
      <input
        className="h-12 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[rgba(255,251,246,0.82)] px-4 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:bg-white focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        type={props.type ?? "text"}
        value={props.value}
      />
    </label>
  );
}

function AdminSelect({
  children,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{label}</span>
      <select
        className="h-12 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[rgba(255,251,246,0.82)] px-4 text-sm font-semibold text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:bg-white focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

function AdminToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button
      aria-pressed={checked}
      className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl border px-4 text-left text-sm font-semibold transition ${
        checked
          ? "border-[rgba(79,122,97,0.18)] bg-[rgba(79,122,97,0.1)] text-[var(--success)]"
          : "border-[rgba(118,93,71,0.12)] bg-[rgba(255,251,246,0.56)] text-[var(--text-soft)]"
      }`}
      onClick={() => onChange(!checked)}
      type="button"
    >
      {label}
      <span className={`h-2.5 w-2.5 rounded-full ${checked ? "bg-[var(--success)]" : "bg-[var(--text-faint)]"}`} />
    </button>
  );
}

function AdminStatusBadge({ status }: { status: AdminRestaurantStatus }) {
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${adminStatusCopy[status].className}`}>
      {adminStatusCopy[status].label}
    </span>
  );
}

function AdminInfoLine({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-2xl bg-[rgba(255,251,246,0.62)] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">{label}</p>
      <p className="mt-1 break-all text-xs font-semibold text-[var(--text-strong)]">{value || "sin dato"}</p>
    </div>
  );
}

function AdminMemberRow({
  isSaving,
  member,
  onRemove,
  onResetPassword,
  onUpdate,
}: {
  isSaving: boolean;
  member: AdminRestaurantMember;
  onRemove: () => void;
  onResetPassword: () => void;
  onUpdate: (patch: Partial<Pick<AdminRestaurantMember, "role" | "status" | "name">>) => void;
}) {
  return (
    <article className="rounded-[22px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.72)] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-[var(--text-strong)]">{member.email ?? member.userId}</p>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              member.status === "active"
                ? "bg-[rgba(79,122,97,0.12)] text-[var(--success)]"
                : "bg-[rgba(118,93,71,0.1)] text-[var(--text-soft)]"
            }`}>
              {member.status === "active" ? "Activo" : "Inactivo"}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-[var(--text-faint)]">
            {member.name || "Sin nombre"} · Ultimo ingreso {formatDateTime(member.lastSignInAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-10 rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[rgba(255,251,246,0.82)] px-3 text-sm font-semibold text-[var(--text-strong)] outline-none"
            disabled={isSaving}
            onChange={(event) => onUpdate({ role: event.target.value as AdminRestaurantMember["role"] })}
            value={member.role}
          >
            <option value="encargado">Encargado</option>
            <option value="trabajador">Trabajador</option>
          </select>
          <button
            className="inline-flex h-10 items-center rounded-2xl border border-[rgba(118,93,71,0.12)] px-3 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[var(--surface-base)]"
            disabled={isSaving}
            onClick={() => onUpdate({ status: member.status === "active" ? "inactive" : "active" })}
            type="button"
          >
            {member.status === "active" ? "Pausar" : "Activar"}
          </button>
          <button
            className="inline-flex h-10 items-center rounded-2xl border border-[rgba(118,93,71,0.12)] px-3 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[var(--surface-base)]"
            disabled={isSaving}
            onClick={onResetPassword}
            type="button"
          >
            Reset password
          </button>
          <button
            className="grid h-10 w-10 place-items-center rounded-2xl border border-[rgba(180,94,84,0.2)] text-[#9a4b43] transition hover:bg-[rgba(190,110,95,0.08)]"
            disabled={isSaving}
            onClick={onRemove}
            title="Quitar acceso"
            type="button"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}

function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-[rgba(14,11,9,0.55)] p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="app-panel reveal-up max-h-[92vh] w-full overflow-hidden rounded-t-[28px] sm:max-w-2xl sm:rounded-[30px]">
        <div className="flex items-center justify-between border-b border-[rgba(118,93,71,0.12)] px-5 py-4 sm:px-6">
          <h3 className="app-display text-[2rem] leading-none text-[var(--text-strong)]">{title}</h3>
          <button
            className="grid h-10 w-10 place-items-center rounded-2xl border border-[rgba(118,93,71,0.12)] text-[var(--text-soft)] transition hover:bg-white"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="app-scrollbar max-h-[calc(92vh-84px)] overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

function StandaloneFrame({
  actions,
  children,
  description,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-8">
      <div className="w-full max-w-[720px] rounded-[34px] border border-[rgba(255,242,227,0.1)] bg-[rgba(30,26,23,0.92)] p-8 text-[var(--text-on-dark)] shadow-[0_30px_90px_rgba(0,0,0,0.32)] sm:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(246,236,223,0.42)]">{eyebrow}</p>
        <h1 className="app-display mt-6 text-[3rem] leading-none sm:text-[3.6rem]">{title}</h1>
        <p className="mt-4 text-sm leading-7 text-[rgba(246,236,223,0.72)] sm:text-[15px]">{description}</p>
        {children && <div className="mt-6">{children}</div>}
        {actions && <div className="mt-7 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </div>
  );
}

function CenteredStatus({ description, title }: { description: string; title: string }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-8">
      <div className="rounded-[30px] border border-[rgba(255,242,227,0.1)] bg-[rgba(30,26,23,0.92)] px-8 py-8 text-center text-[var(--text-on-dark)] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[rgba(255,242,227,0.08)] bg-[rgba(255,248,240,0.05)]">
          <Loader2 className="animate-spin" size={20} />
        </div>
        <p className="app-display mt-5 text-[2.5rem] leading-none">{title}</p>
        <p className="mt-3 max-w-md text-sm leading-7 text-[rgba(246,236,223,0.68)]">{description}</p>
      </div>
    </div>
  );
}

function LoginHighlight({ copy, title }: { copy: string; title: string }) {
  return (
    <div className="rounded-[22px] border border-[rgba(255,242,227,0.08)] bg-[rgba(255,248,240,0.04)] p-4">
      <p className="text-sm font-semibold text-[var(--text-on-dark)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[rgba(246,236,223,0.56)]">{copy}</p>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(246,236,223,0.46)]">Dashboard</p>
      <h2 className="app-display mt-3 text-[2.8rem] leading-none text-[var(--text-on-dark)] sm:text-[3rem]">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-[rgba(246,236,223,0.68)] sm:text-[15px]">{subtitle}</p>
    </div>
  );
}

function TextInput(props: { label: string; onChange: (value: string) => void; placeholder: string; type?: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{props.label}</span>
      <input
        className="h-12 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[rgba(255,251,246,0.86)] px-4 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:bg-white focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        type={props.type ?? "text"}
        value={props.value}
      />
    </label>
  );
}

function ProductImage({
  description,
  emoji,
  imageUrl,
  large = false,
  name,
}: {
  description?: string;
  emoji?: string;
  imageUrl?: string;
  large?: boolean;
  name: string;
}) {
  const size = large ? "h-24 w-24 rounded-[22px]" : "h-16 w-16 rounded-[18px]";

  if (!imageUrl) {
    const resolvedEmoji = emoji || inferProductEmoji({ description, name });

    return (
      <div
        className={`grid shrink-0 place-items-center bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.52),transparent_42%),linear-gradient(135deg,var(--surface-base),var(--surface-strong))] ring-1 ring-[rgba(118,93,71,0.1)] ${size}`}
        title={`Emoji del producto: ${resolvedEmoji}`}
      >
        <span
          aria-label={`Emoji del producto para ${name}`}
          className={`${large ? "text-[2.7rem]" : "text-[1.9rem]"} drop-shadow-[0_8px_14px_rgba(20,14,10,0.12)]`}
          role="img"
        >
          {resolvedEmoji}
        </span>
      </div>
    );
  }

  return <img alt={name} className={`shrink-0 object-cover ring-1 ring-[rgba(118,93,71,0.12)] ${size}`} src={imageUrl} />;
}

function StatSurface({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-panel rounded-[26px] px-5 py-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{label}</p>
      <p className="app-display mt-4 text-[3rem] leading-none text-[var(--text-strong)]">{value}</p>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[rgba(255,242,227,0.12)] bg-[rgba(32,28,25,0.96)] px-5 py-3 text-sm font-semibold text-[var(--text-on-dark)] shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur lg:bottom-6">
      <Check size={16} />
      {message}
    </div>
  );
}
