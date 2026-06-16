import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChefHat,
  Clock3,
  CreditCard,
  LayoutDashboard,
  Menu,
  MessageCircle,
  PackageCheck,
  QrCode,
  ScanSearch,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  UploadCloud,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";

const SALES_WHATSAPP_URL = "https://wa.me/573000000000?text=Hola%2C%20quiero%20agendar%20una%20prueba%20de%20ParaHoy";

type NavItem = {
  href: string;
  label: string;
};

type ProblemCard = {
  copy: string;
  icon: typeof MessageCircle;
  title: string;
  visual: "chat" | "kitchen" | "payment" | "rush";
};

type FlowStep = {
  copy: string;
  eyebrow: string;
  title: string;
  visual: "menu" | "ai" | "ops";
};

type FeatureCard = {
  copy: string;
  icon: typeof UploadCloud;
  points: string[];
  title: string;
  visual: "menu" | "chat" | "states" | "payment" | "qr" | "control";
};

type UseCase = {
  copy: string;
  title: string;
};

const navItems: NavItem[] = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#producto", label: "Plataforma" },
  { href: "#funciones", label: "Funciones" },
  { href: "#faq", label: "Preguntas" },
];

const problemCards: ProblemCard[] = [
  {
    title: "Pedidos incompletos",
    copy: "El cliente escribe productos, direccion y cambios en mensajes separados.",
    icon: MessageCircle,
    visual: "chat",
  },
  {
    title: "Cocina sin contexto",
    copy: "Las notas importantes se pierden entre chats largos.",
    icon: ChefHat,
    visual: "kitchen",
  },
  {
    title: "Pagos mezclados",
    copy: "Comprobantes y confirmaciones quedan enterrados en la conversacion.",
    icon: Wallet,
    visual: "payment",
  },
  {
    title: "Horas pico sin control",
    copy: "El equipo responde tarde y algunos pedidos se pierden.",
    icon: Clock3,
    visual: "rush",
  },
];

const flowSteps: FlowStep[] = [
  {
    eyebrow: "Paso 1",
    title: "Carga tu menu",
    copy: "Sube Excel, CSV, PDF, imagen o texto. ParaHoy detecta productos, precios, categorias, variantes y disponibilidad.",
    visual: "menu",
  },
  {
    eyebrow: "Paso 2",
    title: "La IA conversa y valida",
    copy: "Responde preguntas, confirma productos, pide direccion, metodo de entrega y pago antes de cerrar el pedido.",
    visual: "ai",
  },
  {
    eyebrow: "Paso 3",
    title: "El equipo opera con orden",
    copy: "El pedido llega al panel con estado, notas, pago y contexto para cocina y entrega.",
    visual: "ops",
  },
];

const featureCards: FeatureCard[] = [
  {
    title: "Menu inteligente",
    copy: "Carga tu carta desde archivo, foto o texto. Edita productos, precios, categorias y disponibilidad desde el panel.",
    icon: UploadCloud,
    points: ["Excel, PDF, CSV, foto o texto", "Categorias y variantes", "Actualizacion desde el panel"],
    visual: "menu",
  },
  {
    title: "Toma de pedidos con IA",
    copy: "La IA entiende lenguaje natural, hace preguntas cuando faltan datos y resume el pedido antes de confirmarlo.",
    icon: Bot,
    points: ["Preguntas de validacion", "Notas y cantidades claras", "Resumen antes de confirmar"],
    visual: "chat",
  },
  {
    title: "Estados para cocina",
    copy: "Cada pedido avanza por estados claros: nuevo, pendiente de pago, confirmado, en preparacion y listo.",
    icon: PackageCheck,
    points: ["Visibilidad por estado", "Cola operativa", "Prioridad por tiempo"],
    visual: "states",
  },
  {
    title: "Pagos por transferencia",
    copy: "Marca pedidos como pendientes, adjunta comprobantes y confirma manualmente antes de preparar.",
    icon: CreditCard,
    points: ["Pedido pendiente de pago", "Revision de comprobante", "Confirmacion manual"],
    visual: "payment",
  },
  {
    title: "Carta digital con QR",
    copy: "Publica un menu escaneable para mesas, domicilios e Instagram, siempre conectado al panel.",
    icon: QrCode,
    points: ["Menu publico", "QR listo para compartir", "Conectado a disponibilidad"],
    visual: "qr",
  },
  {
    title: "Control humano",
    copy: "El equipo puede intervenir, editar, confirmar o pausar la automatizacion cuando sea necesario.",
    icon: ShieldCheck,
    points: ["Edicion manual", "Intervencion en vivo", "Reglas claras antes de cocina"],
    visual: "control",
  },
];

const useCases: UseCase[] = [
  { title: "Menu del dia", copy: "Recibe pedidos repetitivos sin responder lo mismo 50 veces." },
  { title: "Comidas rapidas", copy: "Acelera horas pico con pedidos claros y estados visibles." },
  { title: "Cafeterias", copy: "Ordena bebidas, combos y retiros sin enredar al equipo." },
  { title: "Cocinas ocultas", copy: "Opera todo desde WhatsApp con mejor control de entrega." },
  { title: "Restaurantes con domicilios", copy: "Confirma direccion, pago y notas sin perder contexto." },
  { title: "Negocios con horas pico", copy: "Reduce pedidos perdidos cuando entran varios chats al tiempo." },
];

const controlPoints = [
  "Confirmacion antes de preparar.",
  "Edicion manual de pedidos.",
  "Intervencion humana en cualquier conversacion.",
  "Control de productos agotados.",
  "Historial de cada pedido.",
  "Estados visibles para todo el equipo.",
];

const faqs = [
  "La IA puede equivocarse con un pedido?",
  "Puedo revisar antes de enviar a cocina?",
  "Puedo subir mi menu en Excel, PDF o foto?",
  "Que pasa si un producto se agota?",
  "Funciona con pagos por transferencia?",
  "Necesito cambiar mi numero de WhatsApp?",
  "Puedo tener carta digital con QR?",
  "Cuanto tarda la configuracion inicial?",
  "Puedo intervenir manualmente una conversacion?",
  "Sirve para restaurantes pequenos?",
];

const faqAnswers: Record<string, string> = {
  "La IA puede equivocarse con un pedido?": "Puede pedir aclaraciones cuando falten datos, y el restaurante mantiene la validacion final antes de confirmar o enviar a cocina.",
  "Puedo revisar antes de enviar a cocina?": "Si. El pedido llega listo para revisar, editar y confirmar antes de enviarlo a cocina.",
  "Puedo subir mi menu en Excel, PDF o foto?": "Si. La carga acepta Excel, CSV, PDF, imagen o texto antes de publicarlo.",
  "Que pasa si un producto se agota?": "Puedes ocultarlo o marcarlo no disponible para que deje de ofrecerse de inmediato.",
  "Funciona con pagos por transferencia?": "Si. El pedido puede quedar pendiente de pago y esperar confirmacion manual antes de prepararse.",
  "Necesito cambiar mi numero de WhatsApp?": "La integracion se prepara para operar con la configuracion del canal que defina el restaurante.",
  "Puedo tener carta digital con QR?": "Si. Cada restaurante puede publicar una carta digital y compartirla por QR o enlace.",
  "Cuanto tarda la configuracion inicial?": "Depende del menu y del canal, pero la idea es dejar operativa la carta y el flujo sin procesos largos.",
  "Puedo intervenir manualmente una conversacion?": "Si. El equipo puede intervenir, editar o confirmar cuando la situacion lo requiera.",
  "Sirve para restaurantes pequenos?": "Si. Esta pensado para equipos que quieren vender mas sin sumar complejidad al dia a dia.",
};

const diagnosticDefaults = {
  dailyOrders: 45,
  responseMinutes: 11,
  staffCount: 2,
  manualPayments: true,
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function createFloatStyle(verticalOffset: number, transitionDelay?: string) {
  return {
    ...(transitionDelay ? { transitionDelay } : {}),
    ["--float-y"]: `${verticalOffset}px`,
  } as CSSProperties;
}

function useElementProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 1;
      const raw = (viewportHeight - rect.top) / (rect.height + viewportHeight * 0.45);
      setProgress(clamp(raw));
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return { progress, ref };
}

function useMinWidth(minWidth: number) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const update = () => setMatches(window.innerWidth >= minWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [minWidth]);

  return matches;
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerSolid, setHeaderSolid] = useState(false);
  const [heroOffset, setHeroOffset] = useState(0);
  const [heroStatusIndex, setHeroStatusIndex] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      setHeaderSolid(window.scrollY > 18);
      setHeroOffset(clamp(window.scrollY / 520));
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroStatusIndex((current) => (current + 1) % 3);
    }, 2200);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <LandingHeader
        headerSolid={headerSolid}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMenu={() => setMobileMenuOpen((current) => !current)}
      />
      <main>
        <HeroSection heroOffset={heroOffset} heroStatusIndex={heroStatusIndex} />
        <FlowSection />
        <ProductSection />
        <FeatureSection />
        <FAQAccordion />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}

function LandingHeader({
  headerSolid,
  mobileMenuOpen,
  onToggleMenu,
}: {
  headerSolid: boolean;
  mobileMenuOpen: boolean;
  onToggleMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-50 px-3 py-3 sm:px-5">
      <div
        className={cn(
          "mx-auto max-w-7xl rounded-[26px] border px-3 py-3 transition-all sm:rounded-full sm:px-5",
          headerSolid
            ? "border-[rgba(7,94,84,0.12)] bg-[rgba(255,253,248,0.86)] shadow-[0_18px_45px_rgba(16,22,18,0.08)] backdrop-blur-xl"
            : "border-[rgba(7,94,84,0.08)] bg-[rgba(255,253,248,0.6)] backdrop-blur-lg",
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <a className="flex min-w-0 items-center gap-3 no-underline" href="/">
            <img
              alt="ParaHoy"
              className="h-10 w-auto max-w-[155px] object-contain drop-shadow-[0_12px_24px_rgba(7,94,84,0.12)] sm:h-16 sm:max-w-[250px] lg:h-[4.4rem] lg:max-w-[280px]"
              src="/parahoy-name.png"
            />
          </a>

          <nav className="hidden items-center gap-7 lg:flex">
            {navItems.map((item) => (
              <a className="text-sm font-semibold text-[var(--marketing-muted)] transition hover:text-[var(--marketing-text)]" href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <a
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--marketing-border)] px-5 text-sm font-semibold text-[var(--marketing-text)] transition hover:border-[var(--wa-green-dark)] hover:text-[var(--wa-green-dark)]"
              href="/login"
            >
              Ingresar
            </a>
            <a
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--wa-green)] px-5 text-sm font-semibold text-[#032a1a] shadow-[0_18px_34px_rgba(37,211,102,0.22)] transition hover:bg-[var(--wa-green-dark)] hover:text-white"
              href={SALES_WHATSAPP_URL}
              rel="noreferrer"
              target="_blank"
            >
              Agendar una prueba
              <ArrowRight size={16} />
            </a>
          </div>

          <button
            aria-label={mobileMenuOpen ? "Cerrar menu" : "Abrir menu"}
            className="grid h-11 w-11 place-items-center rounded-full border border-[var(--marketing-border)] bg-white text-[var(--marketing-text)] lg:hidden"
            onClick={onToggleMenu}
            type="button"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {mobileMenuOpen ? (
          <div className="mt-4 space-y-3 border-t border-[rgba(7,94,84,0.08)] pt-4 lg:hidden">
            {navItems.map((item) => (
              <a className="block rounded-2xl px-1 py-2 text-sm font-semibold text-[var(--marketing-muted)] transition hover:text-[var(--marketing-text)]" href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
            <div className="grid grid-cols-1 gap-2 pt-2">
              <a className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--marketing-border)] text-sm font-semibold text-[var(--marketing-text)]" href="/login">
                Ingresar
              </a>
              <a
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--wa-green)] text-sm font-semibold text-[#032a1a]"
                href={SALES_WHATSAPP_URL}
                rel="noreferrer"
                target="_blank"
              >
                Agendar una prueba
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function HeroSection({ heroOffset, heroStatusIndex }: { heroOffset: number; heroStatusIndex: number }) {
  const statuses = [
    { label: "Nuevo", tone: "bg-[rgba(37,211,102,0.12)] text-[var(--wa-green-dark)]" },
    { label: "Confirmado", tone: "bg-[rgba(7,94,84,0.12)] text-[var(--wa-green-dark)]" },
    { label: "En preparacion", tone: "bg-[rgba(255,122,26,0.14)] text-[var(--warm-accent)]" },
  ];
  const activeStatus = statuses[heroStatusIndex] ?? {
    label: "Nuevo",
    tone: "bg-[rgba(37,211,102,0.12)] text-[var(--wa-green-dark)]",
  };

  return (
    <section className="relative overflow-hidden px-4 pb-14 pt-4 sm:px-6 sm:pb-22 sm:pt-10">
      <div className="pointer-events-none absolute inset-x-0 top-[-180px] h-[460px] bg-[radial-gradient(circle_at_top,rgba(37,211,102,0.16),transparent_42%),radial-gradient(circle_at_16%_38%,rgba(255,122,26,0.2),transparent_26%),radial-gradient(circle_at_80%_16%,rgba(7,94,84,0.12),transparent_30%)]" />
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center lg:gap-10">
        <div className="relative z-10">
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[rgba(7,94,84,0.12)] bg-white/90 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--wa-green-dark)] shadow-[0_12px_30px_rgba(22,28,24,0.06)] sm:mt-4 sm:px-4 sm:text-[11px] sm:tracking-[0.18em]">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--wa-green)]" />
            WhatsApp, IA y operacion conectados
          </div>
          <h1 className="mt-5 max-w-3xl text-[2.2rem] font-extrabold leading-[0.92] tracking-[-0.06em] text-[var(--marketing-text)] sm:text-[4.4rem] xl:text-[4.2rem]">
            Tu WhatsApp ya no tiene que ser un caos.
          </h1>
          <p className="mt-4 max-w-3xl text-[1.15rem] font-semibold leading-[1.12] tracking-[-0.03em] text-[var(--marketing-muted)] sm:mt-5 sm:text-[2.1rem] xl:text-[2rem]">
            La IA lo atiende, ordena los pedidos y tu cocina prepara.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--marketing-border)] bg-white px-6 text-[15px] font-bold text-[var(--marketing-text)] transition hover:border-[var(--wa-green-dark)] hover:text-[var(--wa-green-dark)] sm:h-13"
              href="/login"
            >
              Ingresar
            </a>
            <a
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--wa-green)] px-6 text-[15px] font-bold text-[#032a1a] shadow-[0_20px_40px_rgba(37,211,102,0.24)] transition hover:bg-[var(--wa-green-dark)] hover:text-white sm:h-13"
              href={SALES_WHATSAPP_URL}
              rel="noreferrer"
              target="_blank"
            >
              Agendar una prueba
              <ArrowRight size={18} />
            </a>
          </div>
          <div className="mt-6 flex flex-wrap gap-2.5 sm:mt-8 sm:gap-3">
            {["Carga menu por archivo o foto", "Estados claros", "Carta QR conectada"].map((chip) => (
              <span className="rounded-full border border-[rgba(7,94,84,0.1)] bg-[rgba(255,255,255,0.88)] px-3 py-2 text-[13px] font-semibold text-[var(--marketing-muted)] sm:px-4 sm:text-sm" key={chip}>
                {chip}
              </span>
            ))}
          </div>
        </div>

        <div className="lg:hidden">
          <div className="relative overflow-hidden rounded-[30px] border border-[rgba(7,94,84,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.56))] p-4 shadow-[0_24px_64px_rgba(16,22,18,0.1)]">
            <div className="landing-grid absolute inset-0 opacity-35" />
            <div className="pointer-events-none absolute inset-x-[18%] top-5 h-16 rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.14),transparent_68%)] blur-3xl" />
            <div className="relative space-y-3">
              <div
                className="w-[88%] rounded-[24px] border border-[rgba(7,94,84,0.08)] bg-white p-4 shadow-[0_16px_30px_rgba(22,28,24,0.08)]"
                style={{ transform: `translate3d(0, ${heroOffset * -10}px, 0) rotate(-3deg)` }}
              >
                <MiniSurfaceHeader icon={MessageCircle} subtitle="Cliente" title="WhatsApp" tone="light" />
                <div className="mt-3 space-y-2.5 text-sm text-[#1f2937]">
                  <ChatBubble align="left" copy="Hola, quiero 2 almuerzos y una limonada." />
                  <ChatBubble align="right" copy="Te confirmo productos, entrega y pago." />
                </div>
              </div>

              <div
                className="ml-auto w-[82%] rounded-[24px] border border-[rgba(37,211,102,0.16)] bg-[linear-gradient(180deg,#ffffff,#f3fbf5)] p-4 shadow-[0_20px_32px_rgba(22,28,24,0.08)]"
                style={{ transform: `translate3d(0, ${heroOffset * -6}px, 0)` }}
              >
                <MiniSurfaceHeader icon={Bot} subtitle="IA" title="Procesando pedido" tone="soft" />
                <div className="mt-3 rounded-[20px] border border-[rgba(37,211,102,0.18)] bg-[rgba(37,211,102,0.08)] p-3">
                  <div className="space-y-2">
                    <KeyValueLine label="Items" value="2 almuerzos" />
                    <KeyValueLine label="Pago" value="Transferencia" />
                  </div>
                </div>
              </div>

              <div
                className="rounded-[26px] border border-[rgba(16,24,39,0.08)] bg-[#101714] p-4 text-white shadow-[0_20px_36px_rgba(16,22,18,0.14)]"
                style={{ transform: `translate3d(0, ${heroOffset * -8}px, 0)` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[rgba(236,247,240,0.52)]">Pedido listo</p>
                    <h3 className="mt-1 text-lg font-bold tracking-[-0.03em] text-white">Resumen para el equipo</h3>
                  </div>
                  <span className={cn("rounded-full px-3 py-1 text-[11px] font-bold transition-all", activeStatus.tone)}>
                    {activeStatus.label}
                  </span>
                </div>
                <div className="mt-3 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-3">
                  <p className="text-sm font-bold text-white">Pedido #2841 · Laura M.</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <HeroSummaryRow label="Pago" value="Transferencia pendiente" />
                    <HeroSummaryRow label="Siguiente paso" value="Confirmar y enviar" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative hidden min-h-[700px] lg:block lg:min-h-[680px]">
          <div className="absolute inset-0 rounded-[34px] border border-[rgba(7,94,84,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(255,255,255,0.42))] shadow-[0_28px_74px_rgba(16,22,18,0.12)] backdrop-blur-xl" />
          <div className="landing-grid absolute inset-0 rounded-[34px] opacity-40" />
          <div className="pointer-events-none absolute inset-x-[8%] top-[12%] h-24 rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.14),transparent_68%)] blur-3xl" />

          <div
            className="absolute left-4 top-5 z-10 w-[78%] rounded-[26px] border border-[rgba(7,94,84,0.08)] bg-white p-4 shadow-[0_18px_34px_rgba(22,28,24,0.08)] sm:left-6 sm:top-7 sm:w-[48%] lg:left-[4%] lg:top-[11%] lg:w-[34%]"
            style={{ transform: `translate3d(0, ${heroOffset * -18}px, 0) rotate(-4deg)` }}
          >
            <MiniSurfaceHeader icon={MessageCircle} subtitle="Cliente" title="WhatsApp" tone="light" />
            <div className="mt-4 space-y-3 text-sm text-[#1f2937]">
              <ChatBubble align="left" copy="Hola, quiero 2 almuerzos y una limonada sin azucar." />
              <ChatBubble align="right" copy="Te confirmo productos, entrega y pago." />
              <ChatBubble align="left" copy="Domicilio en Laureles. Pago por transferencia." />
            </div>
          </div>

          <div
            className="absolute right-4 top-[31%] z-20 w-[76%] rounded-[28px] border border-[rgba(37,211,102,0.16)] bg-[linear-gradient(180deg,#ffffff,#f3fbf5)] p-4 shadow-[0_24px_40px_rgba(22,28,24,0.08)] sm:right-6 sm:top-[22%] sm:w-[46%] lg:left-[33%] lg:right-auto lg:top-[16%] lg:w-[27%]"
            style={{ transform: `translate3d(0, ${heroOffset * -10}px, 0)` }}
          >
            <MiniSurfaceHeader icon={Bot} subtitle="IA" title="Procesando pedido" tone="soft" />
            <div className="mt-4 rounded-[22px] border border-[rgba(37,211,102,0.18)] bg-[rgba(37,211,102,0.08)] p-4">
              <div className="flex items-center gap-3">
                <span className="landing-pulse grid h-10 w-10 place-items-center rounded-2xl bg-[var(--wa-green)] text-[#063e27]">
                  <Bot size={18} />
                </span>
                <div>
                  <p className="text-sm font-bold text-[var(--marketing-text)]">Pedido resumido</p>
                  <p className="text-xs text-[var(--marketing-muted)]">Items, notas, direccion y pago</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <KeyValueLine label="Items" value="2 almuerzos" />
                <KeyValueLine label="Bebida" value="1 limonada" />
                <KeyValueLine label="Direccion" value="Laureles" />
                <KeyValueLine label="Pago" value="Transferencia" />
              </div>
            </div>
          </div>

          <div
            className="absolute bottom-4 left-4 right-4 z-30 rounded-[28px] border border-[rgba(16,24,39,0.08)] bg-[#101714] p-5 text-white shadow-[0_22px_44px_rgba(16,22,18,0.14)] sm:bottom-6 sm:left-auto sm:right-6 sm:w-[62%] lg:bottom-[10%] lg:right-[4%] lg:w-[40%]"
            style={{ transform: `translate3d(0, ${heroOffset * -12}px, 0)` }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[rgba(236,247,240,0.52)]">Pedido listo</p>
                <h3 className="mt-1 text-xl font-bold tracking-[-0.03em] text-white sm:text-2xl">Resumen para el equipo</h3>
              </div>
              <span className={cn("rounded-full px-3 py-1 text-xs font-bold transition-all", activeStatus.tone)}>
                {activeStatus.label}
              </span>
            </div>
            <div className="mt-4 rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4">
              <p className="text-sm font-bold text-white">Pedido #2841 · Laura M.</p>
              <p className="mt-1 text-sm text-[rgba(236,247,240,0.66)]">2 almuerzos, 1 limonada · Domicilio</p>
              <div className="mt-4 space-y-2 text-sm">
                <HeroSummaryRow label="Pago" value="Transferencia pendiente" />
                <HeroSummaryRow label="Notas" value="Una proteina sin salsa" />
                <HeroSummaryRow label="Siguiente paso" value="Confirmar y enviar a cocina" />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-[rgba(37,211,102,0.12)] px-3 py-2 text-xs font-bold text-[var(--wa-green)]">18 nuevos hoy</span>
              <span className="rounded-full bg-[rgba(255,255,255,0.08)] px-3 py-2 text-xs font-bold text-[rgba(236,247,240,0.72)]">7 en preparacion</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20" ref={ref}>
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          overline="Problema"
          subtitle="Cuando los pedidos llegan por partes, tu equipo pierde tiempo confirmando datos, copiando mensajes y revisando pagos."
          title="El problema no es WhatsApp. Es operar pedidos desde un chat desordenado."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {problemCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <article
                className={cn(
                  "landing-reveal rounded-[24px] border border-[var(--marketing-border)] bg-white p-4 shadow-[0_16px_38px_rgba(18,24,20,0.05)] sm:rounded-[26px] sm:p-5",
                  visible && "is-visible",
                )}
                key={card.title}
                style={{ transitionDelay: `${index * 80}ms` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[rgba(7,94,84,0.08)] text-[var(--wa-green-dark)]">
                    <Icon size={18} />
                  </div>
                  <span className="hidden rounded-full border border-[rgba(7,94,84,0.08)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--marketing-muted)] sm:inline-flex">
                    Riesgo
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold tracking-[-0.03em] text-[var(--marketing-text)] sm:text-xl">{card.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--marketing-muted)]">{card.copy}</p>
                <div className="mt-4 rounded-[18px] border border-[rgba(7,94,84,0.08)] bg-[#fbfbf8] p-3">
                  <ProblemMiniVisual visual={card.visual} />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FlowSection() {
  const { progress, ref } = useElementProgress<HTMLElement>();
  const isDesktop = useMinWidth(1024);

  return (
    <section className="bg-[linear-gradient(180deg,rgba(255,255,255,0.58),rgba(245,251,246,0.92))] px-4 py-16 sm:px-6 sm:py-20" id="como-funciona" ref={ref}>
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,0.76fr)_minmax(0,1.24fr)]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionIntro
            overline="Flujo"
            subtitle="La conversacion se organiza, se valida y llega lista para que tu equipo prepare sin perder tiempo."
            title="Del chat a la cocina, sin enredos."
          />
          <div className="mt-6 rounded-[28px] border border-[var(--marketing-border)] bg-white p-5 shadow-[0_16px_38px_rgba(18,24,20,0.05)]">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[rgba(37,211,102,0.12)] text-[var(--wa-green-dark)]">
                <Clock3 size={20} />
              </span>
              <div>
                <p className="text-sm font-bold text-[var(--marketing-text)]">Respuesta mas corta</p>
                <p className="text-sm text-[var(--marketing-muted)]">Menos espera, menos errores y mejor orden interno.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-6 top-6 hidden h-[calc(100%-3rem)] w-px bg-[linear-gradient(180deg,rgba(7,94,84,0.08),rgba(7,94,84,0.18),rgba(7,94,84,0.08))] lg:block" />
          <div className="space-y-4">
            {flowSteps.map((step, index) => {
              const shiftX = isDesktop ? (index - 1) * 24 - progress * 26 + index * 4 : 0;
              const shiftY = isDesktop ? (progress - 0.45) * (index + 1) * 14 : (progress - 0.45) * (index + 1) * 8;

              return (
                <article
                  className="rounded-[26px] border border-[var(--marketing-border)] bg-white p-5 shadow-[0_20px_46px_rgba(18,24,20,0.06)] transition-transform duration-300 sm:rounded-[30px] sm:p-6"
                  key={step.title}
                  style={{ transform: `translate3d(${shiftX}px, ${shiftY}px, 0)` }}
                >
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,0.68fr)_minmax(0,0.32fr)] lg:items-center">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--wa-green-dark)]">{step.eyebrow}</p>
                      <h3 className="mt-3 text-[1.9rem] font-extrabold leading-none tracking-[-0.05em] text-[var(--marketing-text)]">
                        {step.title}
                      </h3>
                      <p className="mt-4 text-[15px] leading-8 text-[var(--marketing-muted)]">{step.copy}</p>
                    </div>
                    <div className="rounded-[22px] border border-[rgba(7,94,84,0.08)] bg-[#fbfbf8] p-4">
                      <FlowMiniVisual visual={step.visual} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductSection() {
  const { ref: progressRef, progress } = useElementProgress<HTMLElement>();
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20" id="producto" ref={progressRef}>
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          overline="Vista del equipo"
          subtitle="Cada pedido llega con productos, notas, pago y siguientes pasos en una sola vista."
          title="Todo el pedido claro antes de que entre a cocina."
        />
        <article
          className={cn("landing-reveal mt-8 overflow-hidden rounded-[30px] border border-[var(--marketing-border)] bg-white shadow-[0_24px_64px_rgba(18,24,20,0.08)]", visible && "is-visible")}
          ref={ref}
          style={createFloatStyle((0.5 - progress) * 26)}
        >
          <div className="space-y-4 p-4 lg:hidden">
            <div className="flex items-center gap-3 rounded-[22px] bg-[#f7f7f3] p-4">
              <img alt="ParaHoy" className="h-10 w-10 rounded-2xl object-cover" src="/Logo.png" />
              <div>
                <p className="text-sm font-bold text-[var(--marketing-text)]">ParaHoy</p>
                <p className="text-xs text-[var(--marketing-muted)]">Pedidos en tiempo real</p>
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--marketing-border)] bg-[#fcfcfa] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--marketing-muted)]">Seguimiento en tiempo real</p>
              <h3 className="mt-2 text-[1.45rem] font-extrabold leading-none tracking-[-0.04em] text-[var(--marketing-text)]">
                Pedidos de hoy
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <MetricPill label="18 nuevos" tone="green" />
                <MetricPill label="7 en preparacion" tone="dark" />
                <MetricPill label="4 pagos" tone="warm" />
                <div className="flex items-center justify-center rounded-[18px] border border-[var(--marketing-border)] px-3 py-3 text-sm font-semibold text-[var(--marketing-muted)]">
                  Buscar
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-[24px] border border-[var(--marketing-border)] bg-[#fbfbf8] p-3">
              <StatusColumn
                orders={[
                  { customer: "Laura M.", total: "$34.000", channel: "WhatsApp", time: "Hace 2 min" },
                  { customer: "Camilo P.", total: "$21.500", channel: "WhatsApp", time: "Hace 5 min" },
                ]}
                title="Nuevo"
                tone="green"
              />
              <StatusColumn
                orders={[
                  { customer: "Sara T.", total: "$19.000", channel: "WhatsApp", time: "Pago pendiente" },
                ]}
                title="Pendiente de pago"
                tone="warm"
              />
            </div>

            <article className="rounded-[24px] border border-[var(--marketing-border)] bg-[#fcfcfa] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[var(--marketing-text)]">Pedido #2841</p>
                  <p className="mt-1 text-sm text-[var(--marketing-muted)]">Laura M. · WhatsApp</p>
                </div>
                <span className="rounded-full bg-[rgba(37,211,102,0.12)] px-3 py-1 text-xs font-bold text-[var(--wa-green-dark)]">
                  Nuevo
                </span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <DetailRow label="Productos" value="2 almuerzos del dia" />
                <DetailRow label="Cantidades" value="2 platos + 1 limonada" />
                <DetailRow label="Pago" value="Transferencia pendiente" />
              </div>
              <div className="mt-5 flex flex-col gap-2">
                <ActionButton tone="primary">Confirmar</ActionButton>
                <ActionButton tone="secondary">Enviar a cocina</ActionButton>
              </div>
            </article>
          </div>

          <div className="hidden lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="border-b border-[rgba(7,94,84,0.08)] bg-[#f7f7f3] p-5 lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-3">
                <img alt="ParaHoy" className="h-10 w-10 rounded-2xl object-cover" src="/Logo.png" />
                <div>
                  <p className="text-sm font-bold text-[var(--marketing-text)]">ParaHoy</p>
                  <p className="text-xs text-[var(--marketing-muted)]">Pedidos en tiempo real</p>
                </div>
              </div>
              <div className="mt-6 space-y-2">
                {[
                  { icon: LayoutDashboard, label: "Pedidos", active: true },
                  { icon: UploadCloud, label: "Menu" },
                  { icon: Users, label: "Clientes" },
                  { icon: CreditCard, label: "Pagos" },
                  { icon: Settings2, label: "Configuracion" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold",
                        item.active
                          ? "bg-[rgba(37,211,102,0.12)] text-[var(--wa-green-dark)]"
                          : "text-[var(--marketing-muted)]",
                      )}
                      key={item.label}
                    >
                      <Icon size={16} />
                      {item.label}
                    </div>
                  );
                })}
              </div>
            </aside>

            <div className="p-5">
              <div className="flex flex-col gap-4 border-b border-[rgba(7,94,84,0.08)] pb-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--marketing-muted)]">Seguimiento en tiempo real</p>
                  <h3 className="mt-2 text-[1.8rem] font-extrabold leading-none tracking-[-0.04em] text-[var(--marketing-text)]">Pedidos de hoy</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {["Nuevo", "Pendiente de pago", "Confirmado", "En preparacion", "Listo"].map((filterLabel, index) => (
                    <span
                      className={cn(
                        "rounded-full px-3 py-2 text-xs font-bold",
                        index === 0
                          ? "bg-[rgba(37,211,102,0.12)] text-[var(--wa-green-dark)]"
                          : "border border-[var(--marketing-border)] text-[var(--marketing-muted)]",
                      )}
                      key={filterLabel}
                    >
                      {filterLabel}
                    </span>
                  ))}
                  <div className="flex h-10 items-center gap-2 rounded-2xl border border-[var(--marketing-border)] px-3 text-sm text-[var(--marketing-muted)]">
                    <Search size={15} />
                    Buscar
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
                <div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricPill label="18 nuevos" tone="green" />
                    <MetricPill label="7 en preparacion" tone="dark" />
                    <MetricPill label="4 pendientes de pago" tone="warm" />
                  </div>

                  <div className="mt-4 rounded-[24px] border border-[var(--marketing-border)] bg-[#fbfbf8] p-3">
                    <div className="grid gap-3 lg:grid-cols-3">
                      <StatusColumn
                        orders={[
                          { customer: "Laura M.", total: "$34.000", channel: "WhatsApp", time: "Hace 2 min" },
                          { customer: "Camilo P.", total: "$21.500", channel: "WhatsApp", time: "Hace 5 min" },
                        ]}
                        title="Nuevo"
                        tone="green"
                      />
                      <StatusColumn
                        orders={[
                          { customer: "Sara T.", total: "$19.000", channel: "WhatsApp", time: "Pago pendiente" },
                        ]}
                        title="Pendiente de pago"
                        tone="warm"
                      />
                      <StatusColumn
                        orders={[
                          { customer: "Nora C.", total: "$27.000", channel: "WhatsApp", time: "En cocina" },
                          { customer: "Juan D.", total: "$32.000", channel: "WhatsApp", time: "Listo para salir" },
                        ]}
                        title="Confirmado"
                        tone="dark"
                      />
                    </div>
                  </div>
                </div>

                <article className="rounded-[24px] border border-[var(--marketing-border)] bg-[#fcfcfa] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[var(--marketing-text)]">Pedido #2841</p>
                      <p className="mt-1 text-sm text-[var(--marketing-muted)]">Laura M. · WhatsApp</p>
                    </div>
                    <span className="rounded-full bg-[rgba(37,211,102,0.12)] px-3 py-1 text-xs font-bold text-[var(--wa-green-dark)]">
                      Nuevo
                    </span>
                  </div>
                  <div className="mt-4 space-y-3 text-sm">
                    <DetailRow label="Productos" value="2 almuerzos del dia" />
                    <DetailRow label="Cantidades" value="2 platos + 1 limonada" />
                    <DetailRow label="Notas" value="Una proteina sin salsa" />
                    <DetailRow label="Direccion" value="Laureles, Medellin" />
                    <DetailRow label="Pago" value="Transferencia pendiente" />
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <ActionButton tone="primary">Confirmar</ActionButton>
                    <ActionButton tone="secondary">Enviar a cocina</ActionButton>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function FeatureSection() {
  const { ref: progressRef, progress } = useElementProgress<HTMLElement>();
  const { ref, visible } = useReveal<HTMLDivElement>();

  return (
    <section className="bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(255,255,255,0.96))] px-4 py-16 sm:px-6 sm:py-20" id="funciones" ref={progressRef}>
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          overline="Funciones"
          subtitle="La plataforma esta pensada para que el pedido quede claro desde el primer mensaje hasta la entrega."
          title="Lo que necesitas para vender por WhatsApp con mas orden."
        />
        <div className="mt-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-3" ref={ref}>
          {featureCards.map((feature, index) => {
            const Icon = feature.icon;
            const verticalOffset = (0.42 - progress) * (index % 3 === 1 ? 22 : 16);
            return (
              <article
                className={cn(
                  "landing-reveal flex h-full flex-col rounded-[28px] border border-[var(--marketing-border)] bg-white p-5 shadow-[0_18px_46px_rgba(18,24,20,0.06)]",
                  "sm:p-5 p-4",
                  visible && "is-visible",
                )}
                key={feature.title}
                style={createFloatStyle(verticalOffset, `${index * 90}ms`)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(7,94,84,0.08)] text-[var(--wa-green-dark)]">
                    <Icon size={20} />
                  </div>
                  <span className="hidden rounded-full border border-[rgba(7,94,84,0.08)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--marketing-muted)] sm:inline-flex">
                    Producto
                  </span>
                </div>
                <h3 className="mt-4 text-[1.15rem] font-bold tracking-[-0.04em] text-[var(--marketing-text)] sm:text-[1.35rem]">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--marketing-muted)]">{feature.copy}</p>
                <div className="mt-4 rounded-[18px] border border-[rgba(7,94,84,0.08)] bg-[#fbfbf8] p-3">
                  <FeatureMiniVisual visual={feature.visual} />
                </div>
                <div className="mt-4 space-y-3">
                  {feature.points.map((point) => (
                    <div className="flex items-start gap-3 text-sm text-[var(--marketing-muted)]" key={point}>
                      <CheckCircle2 className="mt-0.5 shrink-0 text-[var(--wa-green)]" size={17} />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RestaurantUseCases() {
  const { ref: progressRef, progress } = useElementProgress<HTMLElement>();
  const { ref, visible } = useReveal<HTMLDivElement>();

  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20" ref={progressRef}>
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          overline="Para restaurantes"
          subtitle="Casos concretos donde el problema se repite todos los dias."
          title="Hecho para restaurantes que venden todos los dias por WhatsApp."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3" ref={ref}>
          {useCases.map((item, index) => (
            <article
              className={cn(
                "landing-reveal rounded-[26px] border border-[var(--marketing-border)] bg-white p-5 shadow-[0_16px_40px_rgba(18,24,20,0.05)]",
                "sm:p-5 p-4",
                visible && "is-visible",
              )}
              key={item.title}
              style={createFloatStyle((0.45 - progress) * (12 + (index % 3) * 5), `${index * 75}ms`)}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-lg font-bold tracking-[-0.03em] text-[var(--marketing-text)]">{item.title}</p>
                <span className="hidden rounded-full bg-[rgba(255,122,26,0.1)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--warm-accent)] sm:inline-flex">
                  Caso real
                </span>
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--marketing-muted)]">{item.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HumanControlSection() {
  const { ref: progressRef, progress } = useElementProgress<HTMLElement>();
  const { ref, visible } = useReveal<HTMLDivElement>();

  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20" ref={progressRef}>
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center">
        <div
          className={cn(
            "landing-reveal rounded-[30px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,#0b1613,#101827)] p-7 text-white shadow-[0_28px_72px_rgba(10,16,13,0.18)]",
            visible && "is-visible",
          )}
          ref={ref}
          style={createFloatStyle((0.52 - progress) * 24)}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.05)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[rgba(237,246,240,0.72)]">
            <ShieldCheck size={14} />
            Confianza operativa
          </div>
          <h2 className="mt-6 text-[1.9rem] font-extrabold leading-[1.02] tracking-[-0.05em] sm:text-[2.15rem]">
            La IA ayuda, pero tu restaurante mantiene el control.
          </h2>
          <p className="mt-5 text-[15px] leading-8 text-[rgba(237,246,240,0.72)]">
            ParaHoy no manda pedidos a cocina sin reglas claras. Tu equipo puede revisar, editar y confirmar cuando lo necesite.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {controlPoints.map((point, index) => (
            <article
              className={cn(
                "landing-reveal rounded-[24px] border border-[var(--marketing-border)] bg-white p-5 shadow-[0_16px_36px_rgba(18,24,20,0.05)]",
                visible && "is-visible",
              )}
              key={point}
              style={createFloatStyle((0.48 - progress) * (10 + index * 3), `${index * 80}ms`)}
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 shrink-0 text-[var(--wa-green)]" size={18} />
                <p className="text-sm font-semibold leading-7 text-[var(--marketing-text)]">{point}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function DiagnosticCalculatorPreview({
  diagnostic,
  onChange,
  weeklyHigh,
  weeklyLow,
}: {
  diagnostic: typeof diagnosticDefaults;
  onChange: (value: typeof diagnosticDefaults) => void;
  weeklyHigh: number;
  weeklyLow: number;
}) {
  return (
    <section className="bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(245,251,246,0.9))] px-4 py-16 sm:px-6 sm:py-20" id="diagnostico">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)]">
        <div>
          <SectionIntro
            overline="Diagnostico"
            subtitle="Calcula en menos de un minuto si tu WhatsApp esta frenando tus ventas."
            title="Cuantos pedidos estas perdiendo por responder tarde?"
          />
          <div className="mt-8 rounded-[28px] border border-[var(--marketing-border)] bg-white p-6 shadow-[0_20px_50px_rgba(18,24,20,0.06)]">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Pedidos diarios aproximados">
                <input
                  className="landing-input"
                  min={1}
                  onChange={(event) => onChange({ ...diagnostic, dailyOrders: Number(event.target.value) || 0 })}
                  type="number"
                  value={diagnostic.dailyOrders}
                />
              </Field>
              <Field label="Tiempo promedio de respuesta">
                <div className="relative">
                  <input
                    className="landing-input pr-14"
                    min={0}
                    onChange={(event) => onChange({ ...diagnostic, responseMinutes: Number(event.target.value) || 0 })}
                    type="number"
                    value={diagnostic.responseMinutes}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-[var(--marketing-muted)]">min</span>
                </div>
              </Field>
              <Field label="Personas atendiendo WhatsApp">
                <input
                  className="landing-input"
                  min={1}
                  onChange={(event) => onChange({ ...diagnostic, staffCount: Number(event.target.value) || 1 })}
                  type="number"
                  value={diagnostic.staffCount}
                />
              </Field>
              <Field label="Confirmas pagos manualmente">
                <div className="flex h-[3.25rem] items-center justify-between rounded-2xl border border-[rgba(7,94,84,0.12)] bg-white px-4">
                  <span className="text-sm font-semibold text-[var(--marketing-text)]">
                    {diagnostic.manualPayments ? "Si" : "No"}
                  </span>
                  <button
                    aria-label="Cambiar confirmacion manual de pagos"
                    className={cn(
                      "relative h-7 w-12 rounded-full transition",
                      diagnostic.manualPayments ? "bg-[var(--wa-green)]" : "bg-[rgba(7,94,84,0.16)]",
                    )}
                    onClick={() => onChange({ ...diagnostic, manualPayments: !diagnostic.manualPayments })}
                    type="button"
                  >
                    <span
                      className={cn(
                        "absolute top-1 h-5 w-5 rounded-full bg-white transition",
                        diagnostic.manualPayments ? "left-6" : "left-1",
                      )}
                    />
                  </button>
                </div>
              </Field>
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,#0b1613,#111827)] p-6 text-white shadow-[0_28px_72px_rgba(10,16,13,0.18)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[rgba(237,246,240,0.62)]">Resultado visual</p>
              <h3 className="mt-3 text-[2rem] font-extrabold leading-none tracking-[-0.04em]">Impacto semanal</h3>
            </div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(37,211,102,0.14)] text-[var(--wa-green)]">
              <ScanSearch size={20} />
            </span>
          </div>
          <div className="mt-6 rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-5">
            <p className="text-xl font-bold leading-9 text-white">
              Podrias estar perdiendo entre {weeklyLow} y {weeklyHigh} pedidos por semana por demoras o errores operativos.
            </p>
            <p className="mt-4 text-sm leading-7 text-[rgba(237,246,240,0.72)]">
              Este bloque puede conectarse luego a una calculadora comercial mas precisa. Por ahora ya deja clara la oportunidad.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <MetricPill label={`${diagnostic.dailyOrders} pedidos por dia`} tone="green" />
            <MetricPill label={`${diagnostic.responseMinutes} min de respuesta`} tone="dark" />
            <MetricPill label={`${diagnostic.staffCount} personas en WhatsApp`} tone="warm" />
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQAccordion() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20" id="faq">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        <div className="rounded-[28px] border border-[var(--marketing-border)] bg-white p-6 shadow-[0_20px_50px_rgba(18,24,20,0.06)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--wa-green-dark)]">Preguntas frecuentes</p>
          <h2 className="mt-4 text-[1.9rem] font-extrabold leading-[1.02] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[2.2rem]">
            Preguntas antes de automatizar pedidos por WhatsApp.
          </h2>
          <p className="mt-4 text-[15px] leading-8 text-[var(--marketing-muted)]">
            Respuestas directas para las dudas que suelen aparecer antes de activar el servicio.
          </p>
        </div>
        <div className="space-y-3">
          {faqs.map((question) => (
            <details className="group rounded-[24px] border border-[var(--marketing-border)] bg-white p-5 shadow-[0_14px_34px_rgba(18,24,20,0.05)]" key={question}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-bold text-[var(--marketing-text)]">
                <span>{question}</span>
                <ChevronDown className="shrink-0 text-[var(--marketing-muted)] transition group-open:rotate-180" size={20} />
              </summary>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--marketing-muted)]">{faqAnswers[question]}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="px-4 pb-8 pt-4 sm:px-6 sm:pb-10">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[32px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(135deg,#08140f,#101827_56%,#20110b_100%)] px-6 py-10 text-white shadow-[0_32px_80px_rgba(9,13,17,0.24)] sm:px-10 sm:py-14">
        <div className="max-w-3xl">
          <h2 className="mt-4 text-[2rem] font-extrabold leading-[0.98] tracking-[-0.05em] sm:text-[3.3rem]">
            Deja de copiar pedidos desde WhatsApp.
          </h2>
          <p className="mt-5 max-w-2xl text-[15px] leading-8 text-[rgba(232,242,236,0.72)]">
            Empieza a recibir pedidos claros, pagos controlados y cocina organizada desde una sola plataforma.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a className="inline-flex h-13 items-center justify-center rounded-full border border-[rgba(255,255,255,0.16)] px-6 text-sm font-bold text-white transition hover:bg-[rgba(255,255,255,0.08)]" href="/login">
              Ingresar
            </a>
            <a
              className="inline-flex h-13 items-center justify-center rounded-full bg-[var(--wa-green)] px-6 text-sm font-bold text-[#032a1a] transition hover:bg-[#1eb957]"
              href={SALES_WHATSAPP_URL}
              rel="noreferrer"
              target="_blank"
            >
              Agendar una prueba
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="px-4 py-10 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-8 rounded-[30px] border border-[var(--marketing-border)] bg-white px-6 py-8 shadow-[0_20px_60px_rgba(18,24,20,0.05)] md:grid-cols-[1.3fr_0.7fr_0.7fr] md:px-8">
        <div>
          <div className="space-y-4">
            <img alt="ParaHoy" className="h-14 w-auto object-contain" src="/parahoy-name.png" />
            <p className="max-w-md text-sm leading-7 text-[var(--marketing-muted)]">
              Automatiza pedidos por WhatsApp y organiza menu, pagos y cocina desde un solo flujo.
            </p>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--marketing-muted)]">
              Powered by Thaledon
            </p>
          </div>
        </div>
        <FooterColumn items={["Como funciona", "Plataforma", "Funciones", "Preguntas"]} title="Explora" />
        <div>
          <p className="text-sm font-extrabold tracking-[-0.02em] text-[var(--marketing-text)]">Acceso</p>
          <div className="mt-4 flex flex-col gap-3">
            <a
              className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--marketing-border)] px-5 text-sm font-semibold text-[var(--marketing-text)] transition hover:border-[var(--wa-green-dark)] hover:text-[var(--wa-green-dark)]"
              href="/login"
            >
              Ingresar
            </a>
            <a
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--wa-green)] px-5 text-sm font-semibold text-[#032a1a] transition hover:bg-[var(--wa-green-dark)] hover:text-white"
              href={SALES_WHATSAPP_URL}
              rel="noreferrer"
              target="_blank"
            >
              Agendar una prueba
            </a>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--marketing-muted)]">By Thaledon</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ items, title }: { items: string[]; title: string }) {
  return (
    <div>
      <p className="text-sm font-extrabold tracking-[-0.02em] text-[var(--marketing-text)]">{title}</p>
      <div className="mt-4 space-y-3 text-sm text-[var(--marketing-muted)]">
        {items.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </div>
  );
}

function MiniSurfaceHeader({
  icon: Icon,
  subtitle,
  title,
  tone,
}: {
  icon: typeof UploadCloud;
  subtitle: string;
  title: string;
  tone: "light" | "soft";
}) {
  const toneClass = tone === "soft"
    ? "bg-[rgba(255,122,26,0.1)] text-[var(--warm-accent)]"
    : "bg-[rgba(37,211,102,0.1)] text-[var(--wa-green-dark)]";

  return (
    <div className="flex items-center gap-3">
      <span className={cn("grid h-10 w-10 place-items-center rounded-2xl", toneClass)}>
        <Icon size={18} />
      </span>
      <div>
        <p className="text-sm font-bold text-[var(--marketing-text)]">{title}</p>
        <p className="text-xs text-[var(--marketing-muted)]">{subtitle}</p>
      </div>
    </div>
  );
}

function ChatBubble({ align, copy }: { align: "left" | "right"; copy: string }) {
  return (
    <div className={cn("flex", align === "right" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-[18px] px-3 py-3 text-[13px] leading-6 shadow-[0_10px_20px_rgba(18,24,20,0.05)]",
          align === "right"
            ? "bg-[rgba(37,211,102,0.15)] text-[var(--marketing-text)]"
            : "bg-[#f5f2eb] text-[var(--marketing-text)]",
        )}
      >
        {copy}
      </div>
    </div>
  );
}

function KeyValueLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[rgba(7,94,84,0.08)] pb-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--marketing-muted)]">{label}</span>
      <span className="max-w-[58%] text-right text-sm font-semibold text-[var(--marketing-text)]">{value}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--marketing-muted)]">{label}</span>
      <span className="max-w-[58%] text-right text-sm font-semibold text-[var(--marketing-text)]">{value}</span>
    </div>
  );
}

function HeroSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[rgba(236,247,240,0.46)]">{label}</span>
      <span className="max-w-[58%] text-right text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function MetricPill({ label, tone }: { label: string; tone: "dark" | "green" | "warm" }) {
  const toneClass = tone === "green"
    ? "bg-[rgba(37,211,102,0.12)] text-[var(--wa-green-dark)]"
    : tone === "warm"
      ? "bg-[rgba(255,122,26,0.14)] text-[var(--warm-accent)]"
      : "bg-[rgba(7,94,84,0.1)] text-[var(--wa-green-dark)]";

  return <div className={cn("rounded-[18px] px-4 py-3 text-sm font-bold", toneClass)}>{label}</div>;
}

function StatusColumn({
  orders,
  title,
  tone,
}: {
  orders: Array<{ channel: string; customer: string; time: string; total: string }>;
  title: string;
  tone: "dark" | "green" | "warm";
}) {
  return (
    <div className="rounded-[20px] border border-[var(--marketing-border)] bg-white p-3">
      <MetricPill label={title} tone={tone} />
      <div className="mt-3 space-y-3">
        {orders.map((order) => (
          <article className="rounded-[16px] border border-[rgba(7,94,84,0.08)] bg-[#fcfcfa] p-3" key={`${order.customer}-${order.total}`}>
            <p className="text-sm font-bold text-[var(--marketing-text)]">{order.customer}</p>
            <p className="mt-1 text-xs text-[var(--marketing-muted)]">{order.channel} · {order.time}</p>
            <p className="mt-2 text-sm font-semibold text-[var(--marketing-text)]">{order.total}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ActionButton({ children, tone }: { children: ReactNode; tone: "primary" | "secondary" }) {
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-bold transition",
        tone === "primary"
          ? "bg-[var(--wa-green)] text-[#032a1a] hover:bg-[var(--wa-green-dark)] hover:text-white"
          : "border border-[var(--marketing-border)] text-[var(--marketing-text)] hover:border-[var(--wa-green-dark)]",
      )}
      type="button"
    >
      {children}
    </button>
  );
}

function ProblemMiniVisual({ visual }: { visual: ProblemCard["visual"] }) {
  if (visual === "chat") {
    return (
      <div className="space-y-2">
        <MiniBubble tone="neutral">2 almuerzos</MiniBubble>
        <MiniBubble tone="neutral">Domicilio en...</MiniBubble>
        <MiniBubble tone="green">Falta direccion completa</MiniBubble>
      </div>
    );
  }

  if (visual === "kitchen") {
    return (
      <div className="space-y-2">
        <MiniBadge label="Pedido #2841" tone="dark" />
        <MiniLine left="Notas" right="No aparece la salsa" />
        <MiniLine left="Cocina" right="Sin contexto" />
      </div>
    );
  }

  if (visual === "payment") {
    return (
      <div className="space-y-2">
        <MiniBadge label="Comprobante" tone="warm" />
        <MiniLine left="Transferencia" right="Sin revisar" />
        <MiniLine left="Estado" right="Pendiente" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <MiniLine left="08:12" right="Nuevo pedido" />
      <MiniLine left="08:14" right="Otro chat" />
      <MiniBadge label="Equipo saturado" tone="green" />
    </div>
  );
}

function FlowMiniVisual({ visual }: { visual: FlowStep["visual"] }) {
  if (visual === "menu") {
    return (
      <div className="space-y-2">
        <MiniBadge label="Excel / PDF / Foto" tone="dark" />
        <MiniLine left="Categorias" right="Detectadas" />
        <MiniLine left="Precios" right="Listos" />
      </div>
    );
  }

  if (visual === "ai") {
    return (
      <div className="space-y-2">
        <MiniBubble tone="neutral">Es para domicilio?</MiniBubble>
        <MiniBubble tone="green">Pago por transferencia</MiniBubble>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <MiniBadge label="Confirmado" tone="green" />
      <MiniLine left="Cocina" right="En preparacion" />
      <MiniLine left="Entrega" right="Lista" />
    </div>
  );
}

function FeatureMiniVisual({ visual }: { visual: FeatureCard["visual"] }) {
  if (visual === "menu") {
    return (
      <div className="space-y-2">
        <MiniLine left="Menu del dia" right="15 productos" />
        <MiniLine left="Variantes" right="Activas" />
      </div>
    );
  }

  if (visual === "chat") {
    return (
      <div className="space-y-2">
        <MiniBubble tone="neutral">Falta metodo de pago</MiniBubble>
        <MiniBubble tone="green">Transferencia confirmada</MiniBubble>
      </div>
    );
  }

  if (visual === "states") {
    return (
      <div className="flex flex-wrap gap-2">
        <MiniBadge label="Nuevo" tone="green" />
        <MiniBadge label="Pendiente" tone="warm" />
        <MiniBadge label="Listo" tone="dark" />
      </div>
    );
  }

  if (visual === "payment") {
    return (
      <div className="space-y-2">
        <MiniLine left="Comprobante" right="Adjunto" />
        <MiniBadge label="Revision manual" tone="warm" />
      </div>
    );
  }

  if (visual === "qr") {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="grid h-14 w-14 grid-cols-3 gap-1 rounded-xl bg-[#f4f4ef] p-2">
          {Array.from({ length: 9 }).map((_, index) => (
            <span className={cn("rounded-[3px]", index % 2 === 0 ? "bg-[var(--marketing-text)]" : "bg-transparent")} key={index} />
          ))}
        </div>
        <MiniBadge label="Carta conectada" tone="green" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <MiniLine left="Intervencion" right="Activa" />
      <MiniBadge label="Editar pedido" tone="dark" />
    </div>
  );
}

function MiniBubble({ children, tone }: { children: ReactNode; tone: "green" | "neutral" }) {
  return (
    <div className={cn("rounded-[14px] px-3 py-2 text-[12px] font-semibold", tone === "green" ? "bg-[rgba(37,211,102,0.14)] text-[var(--wa-green-dark)]" : "bg-white text-[var(--marketing-muted)]")}>
      {children}
    </div>
  );
}

function MiniBadge({ label, tone }: { label: string; tone: "dark" | "green" | "warm" }) {
  const toneClass = tone === "green"
    ? "bg-[rgba(37,211,102,0.12)] text-[var(--wa-green-dark)]"
    : tone === "warm"
      ? "bg-[rgba(255,122,26,0.14)] text-[var(--warm-accent)]"
      : "bg-[rgba(7,94,84,0.1)] text-[var(--wa-green-dark)]";

  return <div className={cn("inline-flex rounded-full px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em]", toneClass)}>{label}</div>;
}

function MiniLine({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[rgba(7,94,84,0.08)] bg-white px-3 py-2 text-[12px]">
      <span className="font-semibold text-[var(--marketing-muted)]">{left}</span>
      <span className="font-bold text-[var(--marketing-text)]">{right}</span>
    </div>
  );
}

function SectionIntro({
  overline,
  subtitle,
  title,
}: {
  overline: string;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--wa-green-dark)]">{overline}</p>
      <h2 className="mt-4 text-[2.25rem] font-extrabold leading-[1.02] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[3rem]">
        {title}
      </h2>
      <p className="mt-4 text-[15px] leading-8 text-[var(--marketing-muted)] sm:text-base">{subtitle}</p>
    </div>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--marketing-muted)]">{label}</span>
      {children}
    </label>
  );
}
