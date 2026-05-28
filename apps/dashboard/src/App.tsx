import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { MenuItem, OrderSummary, Product } from "@42day/types";
import type { Session } from "@supabase/supabase-js";
import {
  addMenuItem,
  analyzeMenuImage,
  createProduct,
  DashboardApiError,
  deleteMenuItem,
  deleteProduct,
  getDiagnostics,
  getMe,
  getTodayMenu,
  listOrders,
  updateMenuItem,
  updateProduct,
  uploadProductImage,
} from "./api";
import type { DashboardTenant, DetectedMenuProduct } from "./api";
import { authConfigured, getSession, onAuthStateChange, signIn, signOut } from "./auth";
import {
  Camera,
  Check,
  ChefHat,
  ClipboardList,
  Clock,
  Edit3,
  Home,
  ImagePlus,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  SearchCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  Utensils,
  X,
} from "lucide-react";
import { OrdersView } from "./orders";

type View = "menu" | "orders" | "summary" | "catalog" | "upload";
type SaveStatus = "loading" | "saving" | "saved" | "offline";
type ProductFormValue = Partial<Product> & { imageFile?: File };

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

export function App() {
  const [activeView, setActiveView] = useState<View>("menu");
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [tenants, setTenants] = useState<DashboardTenant[]>([]);
  const [products, setProducts] = useState<Product[]>(fallbackProducts);
  const [items, setItems] = useState<MenuItem[]>(fallbackItems);
  const [imageColumnReady, setImageColumnReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [lastUpdated, setLastUpdated] = useState("hace 2 min");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!authConfigured) {
      setAuthLoading(false);
      return;
    }

    let mounted = true;

    getSession()
      .then((currentSession) => {
        if (!mounted) return;
        setSession(currentSession);
      })
      .finally(() => {
        if (mounted) {
          setAuthLoading(false);
        }
      });

    const unsubscribe = onAuthStateChange((nextSession) => {
      setSession(nextSession);
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
      setTenantLoading(false);
      setTenantError("");
      return;
    }

    let active = true;
    setTenantLoading(true);
    setTenantError("");

    getMe()
      .then((payload) => {
        if (!active) return;
        setTenants(payload.tenants);
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
    setProducts(fallbackProducts);
    setItems(fallbackItems);
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
      const payload = { ...product, imageFile: undefined, imageUrl };
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
              saveStatus={saveStatus}
              tenantName={activeTenant?.name ?? fallbackTenants[0]?.name ?? "Restaurante"}
              tenantSlug={tenantSlug}
              tenants={tenants}
              viewCopy={activeViewCopy}
              onLogout={() => void handleLogout()}
              onTenantChange={setTenantSlug}
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

function Header({
  activeView,
  menuIsActive,
  onTenantChange,
  onLogout,
  saveStatus,
  tenantName,
  tenantSlug,
  tenants,
  viewCopy,
}: {
  activeView: View;
  menuIsActive: boolean;
  onTenantChange: (tenantSlug: string) => void;
  onLogout: () => void;
  saveStatus: SaveStatus;
  tenantName: string;
  tenantSlug: string;
  tenants: DashboardTenant[];
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
          <select
            className="h-12 rounded-2xl border border-[rgba(255,242,227,0.12)] bg-[rgba(255,248,240,0.06)] px-4 text-sm font-semibold text-[var(--text-on-dark)] outline-none transition focus:border-[rgba(255,242,227,0.22)] focus:bg-[rgba(255,248,240,0.1)] focus:ring-4 focus:ring-[rgba(255,242,227,0.08)]"
            onChange={(event) => onTenantChange(event.target.value)}
            value={tenantSlug}
          >
            {tenants.map((tenant) => (
              <option key={tenant.slug} value={tenant.slug}>
                {tenant.name}
              </option>
            ))}
          </select>
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
    <section className="space-y-6">
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
            {item.product?.imageUrl && <ProductImage imageUrl={item.product.imageUrl} name={name} />}
            {!item.product?.imageUrl && <ProductImage name={name} />}
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
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" size={17} />
        <input
          autoFocus
          className="h-12 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-[rgba(255,251,246,0.82)] pl-11 pr-4 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:bg-white focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar plato..."
          value={query}
        />
      </div>
      <div className="app-panel-muted mt-3 rounded-2xl px-3 py-2 text-sm font-semibold text-[var(--text-soft)]">
        {selectedProductIds.length} seleccionados
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
                      <ProductImage imageUrl={product.imageUrl} name={product.name} />
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
        </div>
      </div>

      <div className="app-panel-muted flex flex-wrap items-center justify-between gap-3 rounded-[24px] px-4 py-3">
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
          <div className="grid h-full w-full place-items-center text-[var(--text-faint)]">
            <ImagePlus size={26} />
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
          <ProductImage imageUrl={product.imageUrl} name={product.name} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-[var(--text-strong)]">{product.name}</h3>
              <span className="rounded-full bg-[rgba(118,93,71,0.08)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                {product.category || "sin categoria"}
              </span>
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
  const [form, setForm] = useState<ProductFormValue>(initialProduct);
  const [previewUrl, setPreviewUrl] = useState(initialProduct.imageUrl ?? "");
  const [isSaving, setIsSaving] = useState(false);

  return (
    <Modal title={form.id ? "Editar producto" : "Nuevo producto"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsSaving(true);
          try {
            await onSave({ ...form, basePrice: Number(form.basePrice ?? 0), isActive: form.isActive ?? true });
          } finally {
            setIsSaving(false);
          }
        }}
      >
        <TextInput label="Nombre" onChange={(value) => setForm({ ...form, name: value })} placeholder="Ej. Almuerzo ejecutivo" value={form.name ?? ""} />
        <TextInput label="Precio base" onChange={(value) => setForm({ ...form, basePrice: Number(value) })} placeholder="22000" type="number" value={String(form.basePrice ?? "")} />
        <label className="block">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Imagen</span>
          <div className="rounded-[22px] border border-dashed border-[rgba(118,93,71,0.18)] bg-[rgba(248,241,232,0.72)] p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="shrink-0">
                <ProductImage imageUrl={previewUrl} name={form.name ?? "Producto"} large />
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
      setResults(payload.products);
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
    setIsImporting(true);
    setError("");
    try {
      await onCreateProducts(results);
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
              <div className="rounded-[22px] bg-[rgba(248,241,232,0.72)] px-4 py-8 text-center text-sm text-[var(--text-soft)]">
                <Camera className="mx-auto mb-3 text-[var(--text-faint)]" size={22} />
                Los productos detectados apareceran aqui con su precio y categoria sugerida.
              </div>
            )}
            {results.map((item) => (
              <div className="rounded-[22px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.86)] p-4" key={item.name}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--text-strong)]">{item.name}</p>
                  <p className="shrink-0 text-sm font-semibold text-[var(--text-strong)]">{formatPrice(item.basePrice)}</p>
                </div>
                {item.description && <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">{item.description}</p>}
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                  {item.category ?? "sin categoria"}
                  {item.confidence !== undefined ? ` - confianza ${Math.round(item.confidence * 100)}%` : ""}
                </p>
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
              {isImporting ? <Loader2 className="animate-spin" size={17} /> : <Plus size={17} />}
              {isImporting ? "Guardando resultados" : "Agregar al catalogo"}
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

function ProductImage({ imageUrl, large = false, name }: { imageUrl?: string; large?: boolean; name: string }) {
  const size = large ? "h-24 w-24 rounded-[22px]" : "h-16 w-16 rounded-[18px]";

  if (!imageUrl) {
    return (
      <div className={`grid shrink-0 place-items-center bg-[rgba(118,93,71,0.08)] text-[var(--text-faint)] ${size}`}>
        <ImagePlus size={large ? 26 : 20} />
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
