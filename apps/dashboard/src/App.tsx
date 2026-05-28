import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { MenuItem, Product } from "@42day/types";
import type { Session } from "@supabase/supabase-js";
import {
  addMenuItem,
  analyzeMenuImage,
  createProduct,
  deleteMenuItem,
  deleteProduct,
  getDiagnostics,
  getMe,
  getTodayMenu,
  updateMenuItem,
  updateProduct,
  uploadProductImage,
  DashboardApiError,
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

const navItems = [
  { id: "menu" as const, label: "Hoy", icon: Utensils },
  { id: "orders" as const, label: "Pedidos", icon: ClipboardList },
  { id: "summary" as const, label: "Resumen", icon: Home },
  { id: "catalog" as const, label: "Catalogo", icon: ChefHat },
  { id: "upload" as const, label: "Subida", icon: UploadCloud },
];

let toastTimer = 0;

function formatPrice(value: number | undefined) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

export function App() {
  // The daily operation screen must always be the first screen on load.
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
          ? `No se pudo consultar /dashboard/me. Backend: ${error.backendError ?? "sin_codigo"} · HTTP ${error.status}.`
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
    <div className="min-h-screen bg-[#f8f8f5] text-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl">
        <Sidebar activeView={activeView} onNavigate={setActiveView} />
        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-8">
          <Header
            menuIsActive={menuIsActive}
            saveStatus={saveStatus}
            tenantSlug={tenantSlug}
            tenants={tenants}
            onTenantChange={setTenantSlug}
          onLogout={() => void handleLogout()}
          />

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
            <Summary activeCount={activeItems.length} totalCount={items.length} onEditMenu={() => setActiveView("menu")} />
          )}
          {activeView === "orders" && <OrdersView menuItems={items} onNotify={notify} tenantSlug={tenantSlug} />}
          {activeView === "catalog" && <Catalog imageColumnReady={imageColumnReady} products={products} onDelete={removeProduct} onSave={saveProduct} />}
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
        </main>
        <BottomNav activeView={activeView} onNavigate={setActiveView} />
      </div>
      {toast && <Toast message={toast} />}
    </div>
  );
}

function Header({
  menuIsActive,
  onTenantChange,
  onLogout,
  saveStatus,
  tenantSlug,
  tenants,
}: {
  menuIsActive: boolean;
  onTenantChange: (tenantSlug: string) => void;
  onLogout: () => void;
  saveStatus: SaveStatus;
  tenantSlug: string;
  tenants: DashboardTenant[];
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-white text-zinc-800 ring-1 ring-zinc-200 lg:hidden">
          <ChefHat size={18} />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">42Today</p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-normal text-zinc-950">Operacion WhatsApp</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <select
          className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 outline-none transition focus:border-zinc-300 focus:ring-4 focus:ring-zinc-100"
          onChange={(event) => onTenantChange(event.target.value)}
          value={tenantSlug}
        >
          {tenants.map((tenant) => (
            <option key={tenant.slug} value={tenant.slug}>
              {tenant.name}
            </option>
          ))}
        </select>
        <SaveIndicator status={saveStatus} menuIsActive={menuIsActive} />
        <button
          className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-950"
          onClick={onLogout}
          type="button"
        >
          Salir
        </button>
      </div>
    </header>
  );
}

function SaveIndicator({ status, menuIsActive }: { status: SaveStatus; menuIsActive: boolean }) {
  const copy = {
    loading: "Cargando...",
    saving: "Guardando...",
    saved: "Guardado automaticamente",
    offline: "Modo local",
  }[status];

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200">
      {status === "saving" || status === "loading" ? <Loader2 className="animate-spin" size={15} /> : <Check className="text-emerald-600" size={15} />}
      <span className="hidden sm:inline">{copy}</span>
      <span className={`h-2 w-2 rounded-full ${menuIsActive ? "bg-emerald-500" : "bg-zinc-300"}`} />
    </div>
  );
}

function Sidebar({ activeView, onNavigate }: { activeView: View; onNavigate: (view: View) => void }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-zinc-200 bg-white/80 px-3 py-4 backdrop-blur lg:block">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-900 text-white">
          <ChefHat size={17} />
        </div>
        <div>
          <p className="text-sm font-semibold leading-5">42Today</p>
          <p className="text-xs text-zinc-500">Restaurante demo</p>
        </div>
      </div>
      <nav className="space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition ${active ? "bg-zinc-100 text-zinc-950 ring-1 ring-zinc-200" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"}`}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <Icon size={17} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function BottomNav({ activeView, onNavigate }: { activeView: View; onNavigate: (view: View) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 px-2 py-2 shadow-[0_-8px_24px_rgba(24,24,27,0.08)] backdrop-blur lg:hidden">
      <div
        className="mx-auto grid max-w-xl gap-1"
        style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;
          return (
            <button
              className={`flex min-h-14 flex-col items-center justify-center rounded-lg text-xs font-medium transition ${active ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"}`}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <Icon size={18} />
              <span className="mt-1">{item.label}</span>
            </button>
          );
        })}
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
  onAddDish: (productId: string) => void;
  onDeleteDish: (itemId: string) => void;
  onUpdateDish: (itemId: string, patch: Partial<MenuItem>) => void;
}) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const inactiveCount = Math.max(props.items.length - props.activeCount, 0);
  const statusLabel = props.saveStatus === "saving" ? "Guardando" : props.saveStatus === "offline" ? "Sin conexion" : "Sincronizado";
  const groups = groupMenuItemsByOrderType(props.items);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
            <Clock size={14} />
            <span>Actualizado: {props.lastUpdated}</span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-zinc-950 sm:text-3xl">Menu de hoy</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
            Define los platos visibles para WhatsApp. Manten activo solo lo que se puede vender hoy.
          </p>
        </div>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-4 focus:ring-zinc-200"
          onClick={() => setCatalogOpen(true)}
          type="button"
        >
          <Plus size={17} />
          Agregar desde catalogo
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MenuMetric label="Activos" value={props.activeCount} tone="strong" />
        <MenuMetric label="Inactivos" value={inactiveCount} />
        <MenuMetric label="Estado" value={statusLabel} />
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-zinc-100 bg-zinc-50 px-4 py-3 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
          <span>Plato</span>
          <span className="hidden text-right sm:block">Precio</span>
          <span className="text-right">Acciones</span>
        </div>
        <div className="divide-y divide-zinc-100">
          {groups.map((group) => (
            <div className="divide-y divide-zinc-100" key={group.id}>
              <div className="flex items-center justify-between bg-white px-4 py-2.5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">{group.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">{group.items.length} platos</p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">{group.activeCount} activos</span>
              </div>
              {group.items.map((item) => (
                <DishRow
                  item={item}
                  key={item.id}
                  onDelete={() => props.onDeleteDish(item.id)}
                  onUpdate={(patch) => props.onUpdateDish(item.id, patch)}
                />
              ))}
            </div>
          ))}
          {props.items.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-medium text-zinc-950">Todavia no hay platos en el menu.</p>
              <p className="mt-1 text-sm text-zinc-500">Agrega productos desde el catalogo para publicarlos hoy.</p>
            </div>
          )}
        </div>
      </div>
      {catalogOpen && (
        <AddDishModal items={props.items} products={props.products} onAdd={props.onAddDish} onClose={() => setCatalogOpen(false)} />
      )}
    </section>
  );
}

function groupMenuItemsByOrderType(items: MenuItem[]) {
  const order = [
    { id: "desayuno", label: "Desayunos" },
    { id: "almuerzo", label: "Almuerzos" },
    { id: "adicion", label: "Adiciones" },
    { id: "otros", label: "Otros" },
  ];
  const groups = new Map(order.map((entry) => [entry.id, { ...entry, items: [] as MenuItem[], activeCount: 0 }]));

  items.forEach((item) => {
    const category = normalizeOrderType(item.product?.category);
    const group = groups.get(category) ?? groups.get("otros");
    if (!group) return;

    group.items.push(item);
    if (item.isAvailable) {
      group.activeCount += 1;
    }
  });

  return order
    .map((entry) => groups.get(entry.id))
    .filter((group): group is { id: string; label: string; items: MenuItem[]; activeCount: number } => Boolean(group && group.items.length > 0));
}

function normalizeOrderType(category?: string) {
  const value = (category ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (value.includes("desayuno")) return "desayuno";
  if (value.includes("almuerzo") || value.includes("plato fuerte") || value.includes("menu")) return "almuerzo";
  if (value.includes("adicion") || value.includes("acompanamiento") || value.includes("bebida")) return "adicion";

  return "otros";
}

function MenuMetric({ label, tone = "muted", value }: { label: string; tone?: "muted" | "strong"; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === "strong" ? "text-zinc-950" : "text-zinc-700"}`}>{value}</p>
    </div>
  );
}

function DishRow({ item, onDelete, onUpdate }: { item: MenuItem; onDelete: () => void; onUpdate: (patch: Partial<MenuItem>) => void }) {
  const name = item.displayName ?? item.product?.name ?? "Producto sin nombre";
  const price = item.priceOverride ?? item.product?.basePrice ?? 0;

  return (
    <article className={`grid gap-3 px-4 py-3 transition hover:bg-zinc-50 sm:grid-cols-[1fr_160px_156px] sm:items-center ${item.isAvailable ? "bg-white" : "bg-zinc-50/60"}`}>
      <div className="flex min-w-0 items-center gap-3">
        {item.product?.imageUrl && <ProductImage imageUrl={item.product.imageUrl} name={name} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={`truncate text-sm font-semibold ${item.isAvailable ? "text-zinc-950" : "text-zinc-500"}`}>{name}</h3>
            {!item.isAvailable && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">Oculto</span>}
          </div>
          {item.product?.description && <p className="mt-1 line-clamp-1 text-sm text-zinc-500">{item.product.description}</p>}
        </div>
      </div>
      <label className="inline-flex h-9 w-full items-center rounded-lg border border-zinc-200 bg-white px-3 transition focus-within:border-zinc-300 focus-within:ring-4 focus-within:ring-zinc-100 sm:w-40">
        <span className="text-xs font-medium text-zinc-400">$</span>
        <input
          aria-label={`Precio de ${name}`}
          className="ml-1 w-full bg-transparent text-right text-sm font-semibold text-zinc-950 outline-none"
          min="0"
          onChange={(event) => onUpdate({ priceOverride: Number(event.target.value) })}
          type="number"
          value={price}
        />
      </label>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <AvailabilitySwitch checked={item.isAvailable} onChange={() => onUpdate({ isAvailable: !item.isAvailable })} />
        <button className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-4 focus:ring-red-100" onClick={onDelete} title="Eliminar plato" type="button">
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

function AvailabilitySwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      aria-pressed={checked}
      className={`inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium transition focus:outline-none focus:ring-4 ${checked ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 focus:ring-emerald-100" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 focus:ring-zinc-100"}`}
      onClick={onChange}
      type="button"
    >
      <span className={`h-2 w-2 rounded-full ${checked ? "bg-emerald-500" : "bg-zinc-400"}`} />
      {checked ? "Activo" : "Inactivo"}
    </button>
  );
}

function AddDishModal(props: { items: MenuItem[]; products: Product[]; onAdd: (productId: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const existingIds = useMemo(() => new Set(props.items.map((item) => item.productId)), [props.items]);
  const availableProducts = props.products
    .filter((product) => product.isActive && !existingIds.has(product.id))
    .filter((product) => `${product.name} ${product.description ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <Modal title="Agregar desde catalogo" onClose={props.onClose}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={17} />
        <input
          autoFocus
          className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-10 pr-3 text-sm outline-none transition focus:border-zinc-300 focus:bg-white focus:ring-4 focus:ring-zinc-100"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar plato..."
          value={query}
        />
      </div>
      <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
        {availableProducts.map((product) => (
          <button
            className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
            key={product.id}
            onClick={() => {
              props.onAdd(product.id);
              props.onClose();
            }}
            type="button"
          >
            <ProductImage imageUrl={product.imageUrl} name={product.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-zinc-950">{product.name}</p>
              <p className="mt-1 truncate text-sm text-zinc-500">{product.description}</p>
            </div>
            <span className="text-sm font-semibold text-zinc-950">{formatPrice(product.basePrice)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function Summary({ activeCount, totalCount, onEditMenu }: { activeCount: number; totalCount: number; onEditMenu: () => void }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <span className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-sm font-medium ${activeCount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
        <span className={`h-2 w-2 rounded-full ${activeCount > 0 ? "bg-emerald-500" : "bg-zinc-400"}`} />
        {activeCount > 0 ? "Activo" : "Sin platos activos"}
      </span>
      <h2 className="mt-3 text-2xl font-semibold tracking-normal">Listo para operar hoy</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
        {activeCount} de {totalCount} platos estan activos para el chatbot de WhatsApp.
      </p>
      <button className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800" onClick={onEditMenu} type="button">
        <Edit3 size={17} />
        Actualizar menu de hoy
      </button>
    </section>
  );
}

function Catalog({
  imageColumnReady,
  products,
  onDelete,
  onSave,
}: {
  imageColumnReady: boolean;
  products: Product[];
  onDelete: (id: string) => void;
  onSave: (product: ProductFormValue) => Promise<void>;
}) {
  const [modalProduct, setModalProduct] = useState<Partial<Product> | null>(null);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionTitle title="Catalogo general" subtitle="Tabla `products` del schema tenant." />
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800" onClick={() => setModalProduct({ isActive: true })} type="button">
          <Plus size={17} />
          Nuevo producto
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} onDelete={() => onDelete(product.id)} onEdit={() => setModalProduct(product)} />
        ))}
      </div>
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

function ProductCard({ product, onDelete, onEdit }: { product: Product; onDelete: () => void; onEdit: () => void }) {
  return (
    <article className="group rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow-md">
      <div className="flex gap-3">
        <ProductImage imageUrl={product.imageUrl} name={product.name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{product.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-600">{product.description}</p>
          <p className="mt-2 text-sm font-semibold text-zinc-950">{formatPrice(product.basePrice)}</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
        <button className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50" onClick={onEdit} title="Editar producto" type="button">
          <Edit3 size={17} />
        </button>
        <button className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:border-red-100 hover:bg-red-50 hover:text-red-600" onClick={onDelete} title="Eliminar producto" type="button">
          <Trash2 size={17} />
        </button>
      </div>
    </article>
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
        className="space-y-3"
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
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">Imagen</span>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3">
            <ProductImage imageUrl={previewUrl} name={form.name ?? "Producto"} />
            <div className="min-w-0 flex-1">
              <input
                accept="image/jpeg,image/png,image/webp"
                className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!imageColumnReady}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setForm({ ...form, imageFile: file, imageUrl: undefined });
                  setPreviewUrl(URL.createObjectURL(file));
                }}
                type="file"
              />
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                {imageColumnReady
                  ? "Sube JPG, PNG o WebP. Se aloja en nuestro bucket `product-images`."
                  : "Imagen desactivada: falta aplicar la migracion `products.image_url`. El producto si se puede guardar."}
              </p>
            </div>
          </div>
        </label>
        <TextInput label="Descripcion" onChange={(value) => setForm({ ...form, description: value })} placeholder="Descripcion corta para WhatsApp" value={form.description ?? ""} />
        <div className="flex justify-end gap-2 pt-2">
          <button className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-200 px-4 text-sm font-semibold transition hover:bg-zinc-50" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70" disabled={isSaving} type="submit">
            {isSaving && <Loader2 className="animate-spin" size={16} />}
            {isSaving ? "Guardando" : "Guardar"}
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
    } catch (error) {
      setError(error instanceof Error && error.message === "gemini_quota_exhausted"
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
    <section className="space-y-4">
      <SectionTitle title="Subida inteligente" subtitle="Detecta platos y precios con Gemini antes de guardarlos en `products`." />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <label className="flex min-h-80 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/40">
          <input accept="image/*" className="sr-only" onChange={(event) => readFile(event.target.files?.[0])} type="file" />
          {preview ? (
            <img alt="Preview del menu" className="h-72 w-full rounded-lg object-cover" src={preview} />
          ) : (
            <>
              <div className="mb-4 grid h-14 w-14 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <Sparkles size={24} />
              </div>
              <p className="text-sm font-semibold">Sube una foto del menu</p>
              <p className="mt-1 max-w-xs text-sm text-zinc-500">El sistema detectara productos y precios para agregarlos al catalogo.</p>
            </>
          )}
        </label>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!selectedFile || isAnalyzing}
            onClick={() => void analyzeSelectedFile()}
            type="button"
          >
            {isAnalyzing ? <Loader2 className="animate-spin" size={17} /> : <SearchCheck size={17} />}
            {isAnalyzing ? "Analizando" : "Analizar menu"}
          </button>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
          <div className="mt-4 space-y-2">
            {results.length === 0 && (
              <div className="rounded-lg bg-zinc-50 p-4 text-center text-sm text-zinc-500">
                <Camera className="mx-auto mb-2 text-zinc-400" size={22} />
                Los productos detectados apareceran aqui.
              </div>
            )}
            {results.map((item) => (
              <div className="rounded-lg border border-zinc-200 p-3" key={item.name}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="shrink-0 text-sm font-semibold">{formatPrice(item.basePrice)}</p>
                </div>
                {item.description && <p className="mt-1 text-sm leading-5 text-zinc-600">{item.description}</p>}
                <p className="mt-2 text-xs text-zinc-500">
                  {item.category ?? "sin categoria"}
                  {item.confidence !== undefined ? ` · Confianza ${Math.round(item.confidence * 100)}%` : ""}
                </p>
              </div>
            ))}
          </div>
          {results.length > 0 && (
            <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 py-3 text-sm font-semibold transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isImporting} onClick={() => void importResults()} type="button">
              {isImporting ? <Loader2 className="animate-spin" size={17} /> : <Plus size={17} />}
              {isImporting ? "Guardando" : "Agregar al catalogo"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function ConfigRequiredScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f8f8f5] px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">42Today</p>
        <h1 className="mt-2 text-2xl font-semibold">Configura Supabase Auth</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Falta definir `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para habilitar el login del dashboard.
        </p>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f8f8f5]">
      <div className="inline-flex items-center gap-3 rounded-full bg-white px-4 py-3 text-sm font-medium text-zinc-600 ring-1 ring-zinc-200">
        <Loader2 className="animate-spin" size={18} />
        Cargando sesion...
      </div>
    </div>
  );
}

function TenantLoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f8f8f5]">
      <div className="inline-flex items-center gap-3 rounded-full bg-white px-4 py-3 text-sm font-medium text-zinc-600 ring-1 ring-zinc-200">
        <Loader2 className="animate-spin" size={18} />
        Cargando empresa...
      </div>
    </div>
  );
}

function TenantErrorScreen({ error, onLogout }: { error: string; onLogout: () => Promise<void> }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f8f8f5] px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">No se pudo cargar la empresa</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          El usuario inicio sesion, pero el dashboard no pudo consultar el API para resolver sus tenants.
        </p>
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
        <button
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-zinc-200 px-4 text-sm font-semibold transition hover:bg-zinc-50"
          onClick={() => void onLogout()}
          type="button"
        >
          Salir
        </button>
      </div>
    </div>
  );
}

function LoginScreen({ error, onLogin }: { error: string; onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="grid min-h-screen place-items-center bg-[#f8f8f5] px-4">
      <form
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm"
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
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">42Today</p>
        <h1 className="mt-2 text-2xl font-semibold">Ingreso empresas</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Cada empresa entra con su usuario de Supabase Auth y solo ve el tenant que tenga asignado en `control.tenant_users`.
        </p>
        <div className="mt-6 space-y-3">
          <TextInput label="Correo" onChange={setEmail} placeholder="empresa@correo.com" value={email} />
          <TextInput label="Contrasena" onChange={setPassword} placeholder="••••••••" type="password" value={password} />
        </div>
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        <button
          className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting && <Loader2 className="animate-spin" size={16} />}
          {isSubmitting ? "Entrando" : "Iniciar sesion"}
        </button>
      </form>
    </div>
  );
}

function NoTenantScreen({ onLogout }: { onLogout: () => Promise<void> }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f8f8f5] px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Usuario sin tenant asignado</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Este usuario existe en Supabase Auth, pero no tiene relacion activa en `control.tenant_users`. Asigna el tenant correspondiente para permitir el acceso.
        </p>
        <button
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-zinc-200 px-4 text-sm font-semibold transition hover:bg-zinc-50"
          onClick={() => void onLogout()}
          type="button"
        >
          Salir
        </button>
      </div>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-zinc-950/30 p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-zinc-200 sm:max-w-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(92vh-70px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-normal">{title}</h2>
      <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>
    </div>
  );
}

function TextInput(props: { label: string; onChange: (value: string) => void; placeholder: string; type?: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">{props.label}</span>
      <input
        className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none transition focus:border-zinc-300 focus:bg-white focus:ring-4 focus:ring-zinc-100"
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        type={props.type ?? "text"}
        value={props.value}
      />
    </label>
  );
}

function ProductImage({ imageUrl, name }: { imageUrl?: string; name: string }) {
  if (!imageUrl) {
    return (
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-400">
        <ImagePlus size={20} />
      </div>
    );
  }

  return <img alt={name} className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-zinc-200" src={imageUrl} />;
}

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-zinc-950 px-4 py-3 text-sm font-medium text-white shadow-xl lg:bottom-6">
      <Check size={17} />
      {message}
    </div>
  );
}
