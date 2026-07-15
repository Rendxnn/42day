import type { OrderDetail } from "@42day/types";

export function BillingSummaryCard({
  locale,
  order,
}: {
  locale: "en" | "es";
  order: OrderDetail;
}) {
  const billing = order.billing;
  const billingAddress = getBillingAddress(order);

  return (
    <>
      <div className="my-4 border-t border-[rgba(118,93,71,0.12)]" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
        {locale === "en" ? "Billing info" : "Datos de facturacion"}
      </p>
      <div className="mt-3 space-y-3">
        <SummaryRow
          label={locale === "en" ? "Type" : "Tipo"}
          value={billing?.type === "electronic"
            ? (locale === "en" ? "Electronic invoice" : "Factura electronica")
            : (locale === "en" ? "Normal invoice" : "Factura normal")}
        />
        {billing?.type === "electronic" ? (
          <>
            <SummaryRow label={locale === "en" ? "Legal name" : "Nombre o razon social"} value={billing.legalName || "-"} />
            <SummaryRow label={locale === "en" ? "Tax ID" : "Cedula o NIT"} value={billing.taxId || "-"} />
            <SummaryRow label={locale === "en" ? "Email" : "Correo electronico"} value={billing.email || "-"} />
          </>
        ) : (
          <>
            <SummaryRow label={locale === "en" ? "Full name" : "Nombre completo"} value={billing?.fullName || "-"} />
            <SummaryRow label={locale === "en" ? "Address" : "Direccion"} value={billingAddress || "-"} />
          </>
        )}
      </div>
    </>
  );
}

function getBillingAddress(order: OrderDetail): string | undefined {
  const explicitBillingAddress = order.billing?.billingAddress?.trim();
  if (explicitBillingAddress && !looksLikeCoordinateAddress(explicitBillingAddress)) {
    return explicitBillingAddress;
  }

  const writtenDeliveryAddress = order.customerAddressText?.trim();
  if (writtenDeliveryAddress && !looksLikeCoordinateAddress(writtenDeliveryAddress)) {
    return writtenDeliveryAddress;
  }

  return order.resolvedDeliveryAddress?.trim() || undefined;
}

function looksLikeCoordinateAddress(value: string): boolean {
  return /ubicaci[oó]n compartida\s*:\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/i.test(value)
    || /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(value);
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-[var(--text-faint)]">{label}</span>
      <span className="max-w-[65%] text-right font-semibold text-[var(--text-strong)]">{value}</span>
    </div>
  );
}
