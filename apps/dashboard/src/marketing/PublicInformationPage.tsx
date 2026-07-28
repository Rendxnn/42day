import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, Bot, CheckCircle2, MessageCircle, ShieldCheck, Store } from "lucide-react";
import { MarketingFooter } from "./MarketingFooter";
import type { MarketingLocale } from "./MarketingFooter";
import { useMarketingMetadata } from "./MarketingMetadata";
import { LEGAL_IDENTITY } from "./legalIdentity";
import type { PublicMarketingPage as PublicMarketingPageId } from "./marketingRoutes";

const LANDING_LOCALE_STORAGE_KEY = "parahoy-landing-locale";
const LEGAL_EFFECTIVE_DATE_ES = "27 de julio de 2026";
const LEGAL_EFFECTIVE_DATE_EN = "July 27, 2026";

function resolveInitialLocale(): MarketingLocale {
  const storedLocale = window.localStorage.getItem(LANDING_LOCALE_STORAGE_KEY);
  if (storedLocale === "es" || storedLocale === "en") return storedLocale;
  return window.navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

function t(locale: MarketingLocale, spanish: string, english: string) {
  return locale === "es" ? spanish : english;
}

export function PublicInformationPage({ page }: { page: Exclude<PublicMarketingPageId, "landing"> }) {
  const [locale, setLocale] = useState<MarketingLocale>(() => resolveInitialLocale());
  const metadata = getPageMetadata(page, locale);

  useEffect(() => {
    window.localStorage.setItem(LANDING_LOCALE_STORAGE_KEY, locale);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [locale, page]);

  useMarketingMetadata({
    description: metadata.description,
    locale,
    pathname: metadata.pathname,
    title: metadata.title,
  });

  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <PublicPageHeader locale={locale} onChangeLocale={setLocale} />
      <main>
        {page === "privacy" ? <PrivacyPolicy locale={locale} /> : null}
        {page === "terms" ? <TermsAndConditions locale={locale} /> : null}
        {page === "about" ? <AboutUs locale={locale} /> : null}
      </main>
      <MarketingFooter locale={locale} />
    </div>
  );
}

function getPageMetadata(page: Exclude<PublicMarketingPageId, "landing">, locale: MarketingLocale) {
  if (page === "privacy") {
    return {
      description: t(
        locale,
        "Conoce cómo ParaHoy recopila, utiliza, protege y permite ejercer derechos sobre los datos personales.",
        "Learn how ParaHoy collects, uses, protects, and supports rights over personal data.",
      ),
      pathname: "/politica-de-privacidad",
      title: t(locale, "Política de privacidad | ParaHoy", "Privacy policy | ParaHoy"),
    };
  }

  if (page === "terms") {
    return {
      description: t(
        locale,
        "Consulta las condiciones aplicables al uso de ParaHoy por restaurantes y usuarios que interactúan mediante WhatsApp.",
        "Review the terms that apply to restaurants and users interacting with ParaHoy through WhatsApp.",
      ),
      pathname: "/terminos-y-condiciones",
      title: t(locale, "Términos y condiciones | ParaHoy", "Terms and conditions | ParaHoy"),
    };
  }

  return {
    description: t(
      locale,
      "Conoce el propósito de ParaHoy, la solución que ofrece a restaurantes y quién la desarrolla y representa legalmente.",
      "Learn about ParaHoy, the solution it provides to restaurants, and who develops and legally represents it.",
    ),
    pathname: "/acerca-de-nosotros",
    title: t(locale, "Acerca de nosotros | ParaHoy", "About us | ParaHoy"),
  };
}

function PublicPageHeader({
  locale,
  onChangeLocale,
}: {
  locale: MarketingLocale;
  onChangeLocale: (locale: MarketingLocale) => void;
}) {
  return (
    <header className="sticky top-0 z-50 px-3 py-3 sm:px-5">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-full border border-[rgba(7,94,84,0.12)] bg-[rgba(255,253,248,0.9)] px-4 py-3 shadow-[0_18px_45px_rgba(16,22,18,0.08)] backdrop-blur-xl sm:px-5">
        <a aria-label={t(locale, "Inicio de ParaHoy", "ParaHoy home")} className="flex min-w-0 items-center" href="/">
          <img alt="ParaHoy" className="h-11 w-auto max-w-[170px] object-contain sm:h-13 sm:max-w-[210px]" src="/parahoy-logo.png" />
        </a>
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            className="hidden items-center gap-2 text-sm font-semibold text-[var(--marketing-muted)] transition hover:text-[var(--wa-green-dark)] sm:inline-flex"
            href="/"
          >
            <ArrowLeft size={15} />
            {t(locale, "Volver al inicio", "Back home")}
          </a>
          <div aria-label={t(locale, "Idioma", "Language")} className="inline-flex rounded-full border border-[var(--marketing-border)] bg-white p-1">
            {(["es", "en"] as MarketingLocale[]).map((option) => (
              <button
                aria-pressed={locale === option}
                className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] transition ${
                  locale === option ? "bg-[var(--wa-green)] text-[#032a1a]" : "text-[var(--marketing-muted)]"
                }`}
                key={option}
                onClick={() => onChangeLocale(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

function PageHero({
  eyebrow,
  intro,
  title,
}: {
  eyebrow: string;
  intro: string;
  title: string;
}) {
  return (
    <section className="px-4 pb-10 pt-12 sm:px-6 sm:pb-14 sm:pt-18">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--wa-green-dark)]">{eyebrow}</p>
        <h1 className="mt-4 max-w-3xl text-[2.7rem] font-extrabold leading-[0.96] tracking-[-0.055em] sm:text-[4.3rem]">{title}</h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-[var(--marketing-muted)] sm:text-lg">{intro}</p>
      </div>
    </section>
  );
}

function LegalDocument({
  children,
  locale,
}: {
  children: ReactNode;
  locale: MarketingLocale;
}) {
  return (
    <section className="px-4 pb-12 sm:px-6 sm:pb-18">
      <article className="mx-auto max-w-4xl rounded-[30px] border border-[var(--marketing-border)] bg-white px-6 py-8 shadow-[0_20px_60px_rgba(18,24,20,0.05)] sm:px-10 sm:py-12">
        <p className="mb-8 text-sm font-semibold text-[var(--marketing-muted)]">
          {t(locale, "Fecha de entrada en vigencia:", "Effective date:")}{" "}
          {locale === "es" ? LEGAL_EFFECTIVE_DATE_ES : LEGAL_EFFECTIVE_DATE_EN}
        </p>
        {children}
      </article>
    </section>
  );
}

function LegalSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="border-t border-[var(--marketing-border)] py-8 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-extrabold tracking-[-0.025em] text-[var(--marketing-text)] sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-8 text-[var(--marketing-muted)]">{children}</div>
    </section>
  );
}

function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-[var(--wa-green-dark)]">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function PrivacyPolicy({ locale }: { locale: MarketingLocale }) {
  return (
    <>
      <PageHero
        eyebrow={t(locale, "Privacidad y datos personales", "Privacy and personal data")}
        intro={t(
          locale,
          "Esta política explica cómo ParaHoy trata la información de restaurantes, usuarios del panel y personas que realizan pedidos mediante WhatsApp.",
          "This policy explains how ParaHoy processes information belonging to restaurants, dashboard users, and people placing orders through WhatsApp.",
        )}
        title={t(locale, "Política de privacidad", "Privacy policy")}
      />
      <LegalDocument locale={locale}>
        <LegalSection title={t(locale, "1. Identidad del responsable", "1. Identity of the controller")}>
          <p>
            {t(locale, "ParaHoy es un producto desarrollado y representado legalmente por", "ParaHoy is a product developed and legally represented by")}{" "}
            <strong className="text-[var(--marketing-text)]">{LEGAL_IDENTITY.name}</strong>,{" "}
            {t(locale, "persona natural identificada con NIT", "a natural person identified with tax ID")}{" "}
            <strong className="text-[var(--marketing-text)]">{LEGAL_IDENTITY.nit}</strong>.
          </p>
          <LegalList items={[
            `${t(locale, "Correo para privacidad y protección de datos", "Privacy and data protection email")}: ${LEGAL_IDENTITY.privacyEmail}`,
            `${t(locale, "Teléfono", "Phone")}: +57 ${LEGAL_IDENTITY.phone}`,
            `${t(locale, "Dirección física y de notificaciones", "Physical and service address")}: ${LEGAL_IDENTITY.domicileAndAddress}`,
          ]} />
        </LegalSection>

        <LegalSection title={t(locale, "2. Alcance y roles", "2. Scope and roles")}>
          <p>
            {t(
              locale,
              "ParaHoy actúa como responsable cuando decide las finalidades del tratamiento de datos de visitantes, interesados comerciales, restaurantes contratantes, usuarios del panel y solicitudes de soporte.",
              "ParaHoy acts as controller when it determines the purposes for processing data belonging to visitors, prospects, restaurant customers, dashboard users, and support requesters.",
            )}
          </p>
          <p>
            {t(
              locale,
              "Cuando un comensal conversa con un restaurante por WhatsApp para realizar un pedido, el restaurante normalmente actúa como responsable y ParaHoy actúa como encargado tecnológico, tratando la información según las instrucciones del restaurante y para operar el servicio contratado.",
              "When a diner communicates with a restaurant through WhatsApp to place an order, the restaurant normally acts as controller and ParaHoy acts as a technology processor, handling information under the restaurant's instructions to provide the contracted service.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "3. Información que tratamos", "3. Information we process")}>
          <LegalList items={[
            t(locale, "Datos de identificación y contacto, como nombre, teléfono, correo y rol dentro del restaurante.", "Identity and contact data such as name, phone number, email, and restaurant role."),
            t(locale, "Mensajes, audios, archivos y demás contenido enviado mediante WhatsApp.", "Messages, audio, files, and other content sent through WhatsApp."),
            t(locale, "Productos, cantidades, preferencias, notas, estado del pedido y datos necesarios para entrega o recogida.", "Products, quantities, preferences, notes, order status, and information required for delivery or pickup."),
            t(locale, "Direcciones, referencias de entrega, coordenadas o ubicación compartida y resultados de validación de cobertura.", "Addresses, delivery references, shared coordinates or location, and delivery coverage validation results."),
            t(locale, "Nombre o razón social, identificación tributaria, correo y dirección suministrados para facturación.", "Name or legal name, tax identification, email, and address provided for billing."),
            t(locale, "Método de pago y comprobantes de transferencia. ParaHoy no obtiene credenciales bancarias ni valida automáticamente el movimiento en la cuenta del restaurante.", "Payment method and transfer receipts. ParaHoy does not collect banking credentials or automatically validate the transaction in the restaurant's account."),
            t(locale, "Datos de cuentas, autenticación, configuración, menús, catálogos y actividad operativa de los restaurantes.", "Account, authentication, configuration, menu, catalog, and restaurant operational data."),
            t(locale, "Datos técnicos y de seguridad, como dirección IP, registros de errores, eventos y preferencia de idioma guardada en el navegador.", "Technical and security data such as IP address, error logs, events, and browser-stored language preference."),
          ]} />
          <p>
            {t(
              locale,
              "ParaHoy no solicita datos sensibles como parte ordinaria del pedido. Si una persona comparte voluntariamente información relacionada con alergias, salud u otra información sensible en una nota, esta debe limitarse a lo estrictamente necesario para atender el pedido y recibir protección reforzada.",
              "ParaHoy does not request sensitive data as an ordinary part of an order. If a person voluntarily shares allergy, health, or other sensitive information in a note, it must be limited to what is strictly necessary to fulfill the order and receive enhanced protection.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "4. Finalidades", "4. Purposes")}>
          <LegalList items={[
            t(locale, "Prestar, configurar, mantener y mejorar ParaHoy.", "Provide, configure, maintain, and improve ParaHoy."),
            t(locale, "Recibir e interpretar solicitudes por WhatsApp, aclarar información faltante y estructurar borradores y pedidos.", "Receive and interpret WhatsApp requests, clarify missing information, and structure draft and final orders."),
            t(locale, "Calcular precios con las reglas del menú y permitir la revisión humana antes de enviar pedidos a cocina.", "Calculate prices under menu rules and allow human review before orders reach the kitchen."),
            t(locale, "Validar cobertura, coordinar entrega o recogida, gestionar facturación y apoyar la revisión de comprobantes.", "Validate delivery coverage, coordinate delivery or pickup, manage billing, and support transfer-receipt review."),
            t(locale, "Autenticar usuarios, proteger cuentas, prevenir fraude, diagnosticar fallas y conservar trazabilidad operativa.", "Authenticate users, protect accounts, prevent fraud, diagnose failures, and maintain operational traceability."),
            t(locale, "Atender solicitudes comerciales, soporte y ejercicio de derechos de protección de datos.", "Handle sales inquiries, support requests, and data protection rights."),
            t(locale, "Cumplir obligaciones legales, contractuales y requerimientos de autoridades competentes.", "Comply with legal and contractual obligations and requests from competent authorities."),
          ]} />
          <p>
            {t(
              locale,
              "ParaHoy no vende los datos personales ni utiliza los datos de los comensales para crear perfiles publicitarios propios.",
              "ParaHoy does not sell personal data or use diner data to build its own advertising profiles.",
            )}
          </p>
          <p>
            {t(
              locale,
              "El tratamiento se realiza con la autorización previa, expresa e informada del titular cuando la ley la exige, para ejecutar la relación contractual solicitada, cumplir obligaciones legales o atender las demás situaciones autorizadas por la normativa aplicable. Cada restaurante debe proporcionar su aviso y obtener la autorización que corresponda frente a sus propios clientes.",
              "Processing is performed with the data subject's prior, express, and informed authorization where required by law, to perform the requested contractual relationship, comply with legal duties, or address other situations permitted by applicable law. Each restaurant must provide its notice and obtain any authorization required from its own customers.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "5. Inteligencia artificial y decisiones humanas", "5. Artificial intelligence and human decisions")}>
          <p>
            {t(
              locale,
              `ParaHoy utiliza ${LEGAL_IDENTITY.activeAiProvider} como proveedor activo de inteligencia artificial para interpretar lenguaje natural y convertir mensajes en operaciones estructuradas. El modelo no fija precios, no decide disponibilidad final y no confirma por sí solo la preparación del pedido. Estas decisiones se validan mediante reglas del sistema y control del restaurante.`,
              `ParaHoy uses ${LEGAL_IDENTITY.activeAiProvider} as its active artificial intelligence provider to interpret natural language and convert messages into structured operations. The model does not set prices, make final availability decisions, or confirm preparation on its own. System rules and restaurant staff validate those decisions.`,
            )}
          </p>
          <p>
            {t(
              locale,
              "Si el restaurante habilita el tratamiento de notas de voz, el audio puede ser enviado a un proveedor de transcripción configurado para convertirlo en texto. El proveedor activo de transcripción debe confirmarse antes de publicar esta política.",
              "If a restaurant enables voice-note processing, audio may be sent to a configured transcription provider to convert it into text. The active transcription provider must be confirmed before this policy is published.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "6. Proveedores y transmisión de datos", "6. Providers and data processing")}>
          <p>
            {t(
              locale,
              "Para operar el servicio, la información puede ser tratada por proveedores tecnológicos que actúan bajo sus propios términos o como encargados, según corresponda:",
              "To operate the service, information may be processed by technology providers acting under their own terms or as processors, as applicable:",
            )}
          </p>
          <LegalList items={[
            t(locale, "Meta Platforms y WhatsApp, como canal de mensajería.", "Meta Platforms and WhatsApp as the messaging channel."),
            t(locale, `${LEGAL_IDENTITY.activeAiProvider} para interpretación de lenguaje y Google Maps para geocodificación, cuando esta función esté habilitada.`, `${LEGAL_IDENTITY.activeAiProvider} for language interpretation and Google Maps for geocoding when enabled.`),
            t(locale, "Supabase para base de datos, autenticación y almacenamiento de archivos.", "Supabase for database, authentication, and file storage."),
            t(locale, "Cloudflare para ejecución del backend y recepción de webhooks.", "Cloudflare for backend execution and webhook handling."),
            t(locale, "Vercel para alojamiento de la interfaz web.", "Vercel for hosting the web interface."),
          ]} />
          <p>
            {t(
              locale,
              "Algunos proveedores pueden procesar información fuera de Colombia. ParaHoy adopta medidas contractuales, técnicas y organizativas razonables y exige que el tratamiento se limite a la prestación del servicio.",
              "Some providers may process information outside Colombia. ParaHoy adopts reasonable contractual, technical, and organizational measures and requires processing to remain limited to service delivery.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "7. Conservación y eliminación", "7. Retention and deletion")}>
          <p>
            {t(
              locale,
              "Los datos se conservan mientras sean necesarios para operar el servicio, cumplir el contrato con el restaurante, mantener trazabilidad de pedidos, atender controversias y cumplir obligaciones legales. Cuando termina la finalidad y no existe un deber legal o contractual de conservación, la información se elimina, anonimiza o bloquea de manera segura.",
              "Data is retained while necessary to operate the service, fulfill the restaurant agreement, maintain order traceability, resolve disputes, and comply with legal obligations. When the purpose ends and no legal or contractual retention duty remains, information is securely deleted, anonymized, or restricted.",
            )}
          </p>
          <p>
            {t(
              locale,
              "Los periodos concretos de conservación por categoría de datos deben aprobarse antes de publicación y documentarse internamente.",
              "Specific retention periods for each data category must be approved before publication and documented internally.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "8. Seguridad", "8. Security")}>
          <p>
            {t(
              locale,
              "ParaHoy aplica controles de acceso, separación lógica por restaurante, autenticación, cifrado en tránsito, almacenamiento privado para comprobantes y registros para detectar errores o accesos indebidos. Ningún sistema es completamente infalible; ante un incidente se actuará conforme a la ley y al nivel de riesgo.",
              "ParaHoy uses access controls, logical restaurant separation, authentication, encryption in transit, private receipt storage, and logs to detect errors or unauthorized access. No system is completely infallible; incidents will be handled according to applicable law and risk.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "9. Derechos y procedimiento", "9. Rights and procedure")}>
          <p>
            {t(
              locale,
              "Los titulares pueden conocer, actualizar, rectificar y solicitar la supresión de sus datos; pedir prueba de la autorización; conocer el uso dado a la información; revocar la autorización cuando proceda; y presentar quejas ante la Superintendencia de Industria y Comercio después de agotar el trámite directo.",
              "Data subjects may access, update, correct, and request deletion of their data; request proof of authorization; learn how their information has been used; withdraw authorization when applicable; and file complaints with Colombia's Superintendence of Industry and Commerce after completing the direct request process.",
            )}
          </p>
          <p>
            {t(locale, "Las solicitudes deben enviarse a", "Requests must be sent to")}{" "}
            <a className="font-semibold text-[var(--wa-green-dark)] underline" href={`mailto:${LEGAL_IDENTITY.privacyEmail}`}>{LEGAL_IDENTITY.privacyEmail}</a>{" "}
            {t(
              locale,
              "indicando nombre, identificación, datos de contacto, descripción de la solicitud y documentos que acrediten la identidad o representación.",
              "and include name, identification, contact details, a description of the request, and documents proving identity or representation.",
            )}
          </p>
          <p>
            {t(
              locale,
              `La atención de consultas, peticiones y reclamos de protección de datos estará a cargo de ${LEGAL_IDENTITY.name}.`,
              `${LEGAL_IDENTITY.name} is responsible for handling data protection inquiries, requests, and complaints.`,
            )}
          </p>
          <p>
            {t(
              locale,
              "Las consultas se atenderán en un máximo de diez días hábiles y los reclamos en un máximo de quince días hábiles, con las extensiones permitidas por la Ley 1581 de 2012 cuando resulte necesario.",
              "Access requests will be answered within ten business days and complaints within fifteen business days, subject to extensions permitted by Colombia's Law 1581 of 2012 when necessary.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "10. Menores, cambios y contacto", "10. Minors, changes, and contact")}>
          <p>
            {t(
              locale,
              "ParaHoy no está dirigido específicamente a menores de edad. Los restaurantes deben evitar solicitar datos de menores salvo que sea necesario, lícito y cuenten con la autorización correspondiente.",
              "ParaHoy is not specifically directed at minors. Restaurants must avoid requesting data from minors unless necessary, lawful, and supported by the required authorization.",
            )}
          </p>
          <p>
            {t(
              locale,
              "Esta política podrá actualizarse para reflejar cambios legales, técnicos o del servicio. La versión vigente se publicará en esta URL con su fecha de actualización.",
              "This policy may be updated to reflect legal, technical, or service changes. The current version will be published at this URL with its update date.",
            )}
          </p>
        </LegalSection>
      </LegalDocument>
    </>
  );
}

function TermsAndConditions({ locale }: { locale: MarketingLocale }) {
  return (
    <>
      <PageHero
        eyebrow={t(locale, "Condiciones del servicio", "Service conditions")}
        intro={t(
          locale,
          "Estas condiciones explican el alcance de ParaHoy, las responsabilidades de los restaurantes y las reglas aplicables a quienes interactúan con el servicio.",
          "These terms explain ParaHoy's scope, restaurant responsibilities, and the rules that apply to those interacting with the service.",
        )}
        title={t(locale, "Términos y condiciones", "Terms and conditions")}
      />
      <LegalDocument locale={locale}>
        <LegalSection title={t(locale, "1. Titular y aceptación", "1. Operator and acceptance")}>
          <p>
            {t(locale, "ParaHoy es desarrollado y representado legalmente por", "ParaHoy is developed and legally represented by")}{" "}
            <strong className="text-[var(--marketing-text)]">{LEGAL_IDENTITY.name}</strong>,{" "}
            {t(locale, "persona natural con NIT", "a natural person with tax ID")}{" "}
            <strong className="text-[var(--marketing-text)]">{LEGAL_IDENTITY.nit}</strong>.
          </p>
          <p>
            {t(
              locale,
              "El acceso o uso de las funciones públicas implica conocer estas condiciones. El uso comercial por parte de un restaurante también está sujeto a la propuesta, orden de servicio o contrato particular aceptado durante su vinculación.",
              "Access to or use of public features means acknowledging these terms. Commercial use by a restaurant is also subject to the proposal, service order, or individual agreement accepted during onboarding.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "2. Qué ofrece ParaHoy", "2. What ParaHoy provides")}>
          <p>
            {t(
              locale,
              "ParaHoy es una solución tecnológica para restaurantes que recibe conversaciones por WhatsApp, interpreta solicitudes, estructura pedidos, conecta el menú y permite al equipo revisar disponibilidad, pagos y estados operativos desde un panel.",
              "ParaHoy is a technology solution for restaurants that receives WhatsApp conversations, interprets requests, structures orders, connects menu information, and lets staff review availability, payments, and operational status through a dashboard.",
            )}
          </p>
          <p>
            {t(
              locale,
              "ParaHoy no es el restaurante, vendedor de alimentos, operador de entrega, entidad financiera ni pasarela de pagos. La compraventa de alimentos se celebra entre el restaurante y su cliente.",
              "ParaHoy is not the restaurant, food seller, delivery operator, financial institution, or payment gateway. Food sales take place between the restaurant and its customer.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "3. Responsabilidades del restaurante", "3. Restaurant responsibilities")}>
          <LegalList items={[
            t(locale, "Mantener actualizados menú, precios, impuestos, categorías, disponibilidad, horarios y cobertura.", "Keep menus, prices, taxes, categories, availability, hours, and delivery coverage current."),
            t(locale, "Revisar y confirmar los pedidos antes de prepararlos cuando el flujo lo exija.", "Review and confirm orders before preparation when required by the workflow."),
            t(locale, "Responder por la calidad, inocuidad, preparación, facturación, cobro, entrega y garantías de sus productos.", "Remain responsible for product quality, safety, preparation, billing, collection, delivery, and warranties."),
            t(locale, "Obtener las autorizaciones y avisos necesarios para tratar los datos de sus clientes.", "Provide required notices and obtain any authorization needed to process customer data."),
            t(locale, "Usar WhatsApp y los servicios de Meta conforme a sus términos y políticas comerciales.", "Use WhatsApp and Meta services in accordance with their terms and business policies."),
            t(locale, "Proteger sus credenciales y asignar acceso únicamente a personal autorizado.", "Protect credentials and grant access only to authorized staff."),
            t(locale, "No utilizar ParaHoy para actividades ilegales, engañosas, abusivas, discriminatorias o que vulneren derechos de terceros.", "Not use ParaHoy for illegal, misleading, abusive, discriminatory activities or to infringe third-party rights."),
          ]} />
        </LegalSection>

        <LegalSection title={t(locale, "4. Inteligencia artificial y control humano", "4. Artificial intelligence and human control")}>
          <p>
            {t(
              locale,
              `ParaHoy utiliza ${LEGAL_IDENTITY.activeAiProvider} para interpretar lenguaje natural. La inteligencia artificial puede solicitar aclaraciones o producir interpretaciones incompletas. Los precios se calculan con reglas del sistema, la disponibilidad final corresponde al restaurante y el equipo conserva la capacidad de intervenir, editar, pausar o confirmar.`,
              `ParaHoy uses ${LEGAL_IDENTITY.activeAiProvider} to interpret natural language. Artificial intelligence may request clarification or produce incomplete interpretations. Prices are calculated by system rules, final availability remains with the restaurant, and staff retain the ability to intervene, edit, pause, or confirm.`,
            )}
          </p>
          <p>
            {t(
              locale,
              "El restaurante no debe depender exclusivamente de la automatización en situaciones que requieran criterio profesional, atención de emergencias, alérgenos, información sensible o cumplimiento de obligaciones especiales.",
              "Restaurants must not rely exclusively on automation where professional judgment, emergencies, allergens, sensitive information, or special compliance duties are involved.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "5. Pedidos, pagos y comprobantes", "5. Orders, payments, and receipts")}>
          <p>
            {t(
              locale,
              "Los pedidos pueden permanecer pendientes hasta que el cliente y el restaurante completen las confirmaciones previstas. La recepción de un comprobante de transferencia no equivale a validación bancaria ni garantiza que el dinero haya sido abonado. El restaurante debe verificarlo antes de preparar o entregar el pedido.",
              "Orders may remain pending until the customer and restaurant complete the required confirmations. Receiving a transfer receipt is not bank validation and does not guarantee funds have been credited. The restaurant must verify the payment before preparation or delivery.",
            )}
          </p>
          <p>
            {t(
              locale,
              "Cancelaciones, devoluciones, garantías, retractos y controversias sobre alimentos o entregas deben ser gestionados por el restaurante conforme a la ley y a sus propias políticas.",
              "Cancellations, refunds, warranties, withdrawals, and disputes concerning food or delivery must be handled by the restaurant under applicable law and its own policies.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "6. Cuentas y seguridad", "6. Accounts and security")}>
          <p>
            {t(
              locale,
              "Cada usuario debe proporcionar información veraz, mantener sus credenciales confidenciales y reportar accesos no autorizados. ParaHoy puede suspender accesos cuando detecte riesgo de seguridad, incumplimiento, uso abusivo o una obligación legal.",
              "Each user must provide accurate information, keep credentials confidential, and report unauthorized access. ParaHoy may suspend access in response to security risk, breach, abusive use, or a legal obligation.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "7. Planes, facturación y terminación", "7. Plans, billing, and termination")}>
          <p>
            {t(
              locale,
              "Precios, impuestos, periodo de prueba, alcance de soporte, fecha de cobro, permanencia y condiciones de cancelación se definirán en la oferta comercial o contrato aplicable a cada restaurante. En caso de conflicto, el acuerdo particular prevalece sobre estas condiciones generales.",
              "Prices, taxes, trial period, support scope, billing date, minimum term, and cancellation conditions will be defined in the commercial offer or agreement applicable to each restaurant. If there is a conflict, the individual agreement prevails over these general terms.",
            )}
          </p>
          <p>
            {t(
              locale,
              "Al terminar el servicio se deshabilitarán los accesos y los datos se conservarán o eliminarán de acuerdo con la política de privacidad, el contrato y las obligaciones legales.",
              "When the service ends, access will be disabled and data will be retained or deleted according to the privacy policy, the agreement, and legal obligations.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "8. Servicios de terceros", "8. Third-party services")}>
          <p>
            {t(
              locale,
              `ParaHoy depende de servicios como WhatsApp y Meta, ${LEGAL_IDENTITY.activeAiProvider}, Google Maps, Supabase, Cloudflare, Vercel y operadores de telecomunicaciones. Interrupciones, restricciones o cambios de estos terceros pueden afectar temporalmente el servicio sin que ello implique control directo de ParaHoy sobre su infraestructura.`,
              `ParaHoy relies on services including WhatsApp and Meta, ${LEGAL_IDENTITY.activeAiProvider}, Google Maps, Supabase, Cloudflare, Vercel, and telecommunications operators. Third-party interruptions, restrictions, or changes may temporarily affect the service even though ParaHoy does not directly control their infrastructure.`,
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "9. Propiedad intelectual", "9. Intellectual property")}>
          <p>
            {t(
              locale,
              "ParaHoy, su software, diseño, documentación, marcas y componentes propios están protegidos por las normas aplicables. El restaurante conserva la titularidad o licencias sobre su marca, menú, imágenes y contenidos, y autoriza su uso únicamente para prestar el servicio.",
              "ParaHoy, its software, design, documentation, brands, and proprietary components are protected by applicable law. Restaurants retain ownership or licenses over their brand, menu, images, and content and authorize their use only to provide the service.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "10. Privacidad y confidencialidad", "10. Privacy and confidentiality")}>
          <p>
            {t(locale, "El tratamiento de información personal se rige por la", "Personal data processing is governed by the")}{" "}
            <a className="font-semibold text-[var(--wa-green-dark)] underline" href="/politica-de-privacidad">
              {t(locale, "Política de privacidad de ParaHoy", "ParaHoy Privacy Policy")}
            </a>.
            {" "}
            {t(
              locale,
              "Cada restaurante debe garantizar que cuenta con base jurídica para compartir información y dar instrucciones de tratamiento.",
              "Each restaurant must ensure it has a lawful basis to share information and provide processing instructions.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "11. Disponibilidad y responsabilidad", "11. Availability and liability")}>
          <p>
            {t(
              locale,
              "ParaHoy procura mantener un servicio seguro y disponible, pero no garantiza operación ininterrumpida ni ausencia absoluta de errores. Dentro de los límites permitidos por la ley, ParaHoy responde por daños directos que le sean legalmente imputables y no por decisiones del restaurante, información incorrecta del menú, fallas de terceros, lucro cesante o daños indirectos.",
              "ParaHoy aims to maintain a secure and available service but does not guarantee uninterrupted operation or complete absence of errors. To the extent permitted by law, ParaHoy is responsible for direct damages legally attributable to it, not for restaurant decisions, incorrect menu information, third-party failures, lost profits, or indirect damages.",
            )}
          </p>
          <p>
            {t(
              locale,
              "Nada en estas condiciones limita derechos irrenunciables ni responsabilidades que la ley colombiana prohíba excluir.",
              "Nothing in these terms limits non-waivable rights or liabilities that Colombian law does not permit to be excluded.",
            )}
          </p>
        </LegalSection>

        <LegalSection title={t(locale, "12. Ley aplicable, cambios y contacto", "12. Governing law, changes, and contact")}>
          <p>
            {t(
              locale,
              "Estas condiciones se rigen por las leyes de la República de Colombia. Las partes procurarán resolver de buena fe cualquier diferencia antes de acudir a las autoridades o jueces competentes.",
              "These terms are governed by the laws of the Republic of Colombia. The parties will seek to resolve disputes in good faith before resorting to competent authorities or courts.",
            )}
          </p>
          <p>
            {t(
              locale,
              "La versión vigente se publicará en esta URL con su fecha de actualización. Las consultas pueden enviarse a",
              "The current version will be published at this URL with its update date. Questions may be sent to",
            )}{" "}
            <a className="font-semibold text-[var(--wa-green-dark)] underline" href={`mailto:${LEGAL_IDENTITY.privacyEmail}`}>{LEGAL_IDENTITY.privacyEmail}</a>.
          </p>
          {locale === "en" ? (
            <p>The Spanish version is the controlling legal version if a translation creates any inconsistency.</p>
          ) : null}
        </LegalSection>
      </LegalDocument>
    </>
  );
}

function AboutUs({ locale }: { locale: MarketingLocale }) {
  const principles = [
    {
      icon: MessageCircle,
      title: t(locale, "Conversaciones que se vuelven pedidos claros", "Conversations that become clear orders"),
      copy: t(locale, "ParaHoy organiza productos, cantidades, notas, entrega y pago sin obligar al cliente a aprender un flujo rígido.", "ParaHoy organizes products, quantities, notes, delivery, and payment without forcing customers into a rigid flow."),
    },
    {
      icon: Bot,
      title: t(locale, "IA con límites operativos", "AI with operational limits"),
      copy: t(locale, `${LEGAL_IDENTITY.activeAiProvider} interpreta el lenguaje; las reglas del sistema calculan y el restaurante conserva la decisión final.`, `${LEGAL_IDENTITY.activeAiProvider} interprets language; system rules calculate and the restaurant retains the final decision.`),
    },
    {
      icon: ShieldCheck,
      title: t(locale, "Control humano", "Human control"),
      copy: t(locale, "El equipo puede revisar, editar, confirmar o pausar la automatización cuando la situación lo requiera.", "Staff can review, edit, confirm, or pause automation whenever the situation requires it."),
    },
  ];

  return (
    <>
      <PageHero
        eyebrow={t(locale, "Quiénes somos", "Who we are")}
        intro={t(
          locale,
          "Construimos tecnología para que los restaurantes puedan atender pedidos por WhatsApp sin perder el trato cercano ni el control de su operación.",
          "We build technology so restaurants can handle WhatsApp orders without losing the human touch or control over their operation.",
        )}
        title={t(locale, "Menos caos en el chat. Más claridad para operar.", "Less chat chaos. More operational clarity.")}
      />

      <section className="px-4 pb-16 sm:px-6 sm:pb-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <article className="rounded-[30px] border border-[var(--marketing-border)] bg-white p-7 shadow-[0_20px_60px_rgba(18,24,20,0.05)] sm:p-10">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(37,211,102,0.12)] text-[var(--wa-green-dark)]">
                <Store size={22} />
              </div>
              <h2 className="mt-6 text-2xl font-extrabold tracking-[-0.035em] sm:text-3xl">
                {t(locale, "Una herramienta pensada para el trabajo real del restaurante", "A tool designed around real restaurant work")}
              </h2>
              <div className="mt-5 space-y-4 text-[15px] leading-8 text-[var(--marketing-muted)]">
                <p>
                  {t(
                    locale,
                    "ParaHoy conecta WhatsApp, el menú y el panel operativo. La solución interpreta mensajes naturales, solicita datos faltantes, estructura el pedido y deja al equipo la revisión de disponibilidad, pago, cocina y entrega.",
                    "ParaHoy connects WhatsApp, menu information, and the operations dashboard. It interprets natural messages, asks for missing details, structures the order, and leaves availability, payment, kitchen, and delivery review to staff.",
                  )}
                </p>
                <p>
                  {t(
                    locale,
                    "Está dirigido principalmente a restaurantes pequeños y medianos que quieren responder más rápido, reducir pedidos incompletos y mantener control humano durante las horas de mayor demanda.",
                    "It is primarily designed for small and medium-sized restaurants that want faster responses, fewer incomplete orders, and human control during peak hours.",
                  )}
                </p>
              </div>
            </article>

            <aside className="rounded-[30px] bg-[linear-gradient(135deg,#08140f,#101827_56%,#20110b_100%)] p-7 text-white shadow-[0_28px_70px_rgba(9,13,17,0.22)] sm:p-10">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--wa-green)]">
                {t(locale, "Identidad legal", "Legal identity")}
              </p>
              <h2 className="mt-5 text-2xl font-extrabold leading-tight tracking-[-0.035em] sm:text-3xl">
                {t(
                  locale,
                  "ParaHoy es desarrollado y representado legalmente por Samuel Rendón Trujillo.",
                  "ParaHoy is developed and legally represented by Samuel Rendón Trujillo.",
                )}
              </h2>
              <div className="mt-6 space-y-3 text-sm leading-7 text-[rgba(232,242,236,0.72)]">
                <p>{t(locale, "Persona natural", "Natural person")}</p>
                <p>NIT {LEGAL_IDENTITY.nit}</p>
                <p>+57 {LEGAL_IDENTITY.phone}</p>
                <a className="block break-all font-semibold text-white underline" href={`mailto:${LEGAL_IDENTITY.privacyEmail}`}>
                  {LEGAL_IDENTITY.privacyEmail}
                </a>
              </div>
            </aside>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {principles.map(({ copy, icon: Icon, title }) => (
              <article className="rounded-[26px] border border-[var(--marketing-border)] bg-white p-6" key={title}>
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[rgba(7,94,84,0.08)] text-[var(--wa-green-dark)]">
                  <Icon size={20} />
                </div>
                <h3 className="mt-5 text-lg font-extrabold tracking-[-0.025em]">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--marketing-muted)]">{copy}</p>
              </article>
            ))}
          </div>

          <div className="mt-10 rounded-[28px] border border-[rgba(37,211,102,0.22)] bg-[rgba(37,211,102,0.07)] px-6 py-8 sm:px-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-[var(--wa-green-dark)]">
                  <CheckCircle2 size={17} />
                  {t(locale, "Conoce ParaHoy en funcionamiento", "See ParaHoy in action")}
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--marketing-muted)]">
                  {t(locale, "Agenda una conversación para revisar cómo encajaría en la operación de tu restaurante.", "Book a conversation to see how ParaHoy could fit your restaurant's operation.")}
                </p>
              </div>
              <a
                className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--wa-green)] px-6 text-sm font-bold text-[#032a1a] transition hover:bg-[var(--wa-green-dark)] hover:text-white"
                href="https://wa.me/573207085729"
                rel="noreferrer"
                target="_blank"
              >
                {t(locale, "Hablar por WhatsApp", "Talk on WhatsApp")}
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
