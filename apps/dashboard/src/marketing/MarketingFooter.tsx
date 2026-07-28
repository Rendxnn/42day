import { ArrowRight } from "lucide-react";
import { LEGAL_IDENTITY } from "./legalIdentity";

export type MarketingLocale = "en" | "es";

function getSalesWhatsappUrl(locale: MarketingLocale) {
  const text = locale === "en"
    ? "Hi, I'm interested in learning more about how ParaHoy works and how it could help me organize my restaurant orders through WhatsApp."
    : "Hola, estoy interesado en conocer mejor cómo funciona ParaHoy y cómo podría ayudarme a organizar los pedidos de mi restaurante por WhatsApp.";
  return `https://wa.me/573207085729?text=${encodeURIComponent(text)}`;
}

export function MarketingFooter({ locale }: { locale: MarketingLocale }) {
  const isEnglish = locale === "en";
  const productLinks = [
    { href: "/#como-funciona", label: isEnglish ? "How it works" : "Cómo funciona" },
    { href: "/#producto", label: isEnglish ? "Platform" : "Plataforma" },
    { href: "/#funciones", label: isEnglish ? "Features" : "Funciones" },
    { href: "/#faq", label: isEnglish ? "FAQ" : "Preguntas frecuentes" },
  ];
  const companyLinks = [
    { href: "/acerca-de-nosotros", label: isEnglish ? "About us" : "Acerca de nosotros" },
    { href: "/politica-de-privacidad", label: isEnglish ? "Privacy policy" : "Política de privacidad" },
    { href: "/terminos-y-condiciones", label: isEnglish ? "Terms and conditions" : "Términos y condiciones" },
  ];

  return (
    <footer className="px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl rounded-[30px] border border-[var(--marketing-border)] bg-white px-6 py-8 shadow-[0_20px_60px_rgba(18,24,20,0.05)] md:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr_0.8fr_0.9fr]">
          <div>
            <div className="space-y-4">
              <a aria-label={isEnglish ? "ParaHoy home" : "Inicio de ParaHoy"} className="inline-flex" href="/">
                <img alt="ParaHoy" className="h-14 w-auto object-contain" src="/parahoy-logo.png" />
              </a>
              <p className="max-w-md text-sm leading-7 text-[var(--marketing-muted)]">
                {isEnglish
                  ? "Automate WhatsApp orders and organize menus, payments, and kitchen work in one operating flow."
                  : "Automatiza pedidos por WhatsApp y organiza menú, pagos y cocina desde un solo flujo."}
              </p>
              <p className="max-w-md text-xs leading-6 text-[var(--marketing-muted)]">
                {isEnglish
                  ? `Developed and legally represented by ${LEGAL_IDENTITY.name}. NIT ${LEGAL_IDENTITY.nit}.`
                  : `Desarrollado y representado legalmente por ${LEGAL_IDENTITY.name}. NIT ${LEGAL_IDENTITY.nit}.`}
              </p>
            </div>
          </div>

          <FooterColumn
            items={productLinks}
            title={isEnglish ? "Product" : "Producto"}
          />
          <FooterColumn
            items={companyLinks}
            title={isEnglish ? "Company and legal" : "Empresa y legal"}
          />

          <div>
            <p className="text-sm font-extrabold tracking-[-0.02em] text-[var(--marketing-text)]">
              {isEnglish ? "Access and contact" : "Acceso y contacto"}
            </p>
            <div className="mt-4 flex flex-col items-start gap-3">
              <a
                className="text-sm font-semibold text-[var(--marketing-muted)] transition hover:text-[var(--wa-green-dark)]"
                href="/login"
              >
                {isEnglish ? "Log in" : "Ingresar"}
              </a>
              <a
                className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--wa-green-dark)] transition hover:text-[var(--marketing-text)]"
                href={getSalesWhatsappUrl(locale)}
                rel="noreferrer"
                target="_blank"
              >
                {isEnglish ? "Book a demo" : "Agendar una prueba"}
                <ArrowRight size={15} />
              </a>
              <a
                className="break-all text-sm text-[var(--marketing-muted)] transition hover:text-[var(--wa-green-dark)]"
                href={`mailto:${LEGAL_IDENTITY.privacyEmail}`}
              >
                {LEGAL_IDENTITY.privacyEmail}
              </a>
              <a
                className="text-sm text-[var(--marketing-muted)] transition hover:text-[var(--wa-green-dark)]"
                href={`tel:+57${LEGAL_IDENTITY.phone}`}
              >
                +57 {LEGAL_IDENTITY.phone}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-[var(--marketing-border)] pt-6 text-xs text-[var(--marketing-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} ParaHoy.</p>
          <p>{isEnglish ? "WhatsApp ordering technology for restaurants." : "Tecnología de pedidos por WhatsApp para restaurantes."}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  items,
  title,
}: {
  items: Array<{ href: string; label: string }>;
  title: string;
}) {
  return (
    <nav aria-label={title}>
      <p className="text-sm font-extrabold tracking-[-0.02em] text-[var(--marketing-text)]">{title}</p>
      <ul className="mt-4 space-y-3 text-sm text-[var(--marketing-muted)]">
        {items.map((item) => (
          <li key={item.href}>
            <a className="transition hover:text-[var(--wa-green-dark)]" href={item.href}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
