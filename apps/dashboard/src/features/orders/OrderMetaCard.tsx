import type { OrderDetail } from "@42day/types";

export function OrderMetaCard({
  formatDateTime,
  getNotificationLabel,
  getOrderStatusLabel,
  locale,
  order,
}: {
  formatDateTime: (value: string | undefined, locale: "en" | "es") => string;
  getNotificationLabel: (status: OrderDetail["customerNotificationStatus"] | undefined, locale: "en" | "es") => string;
  getOrderStatusLabel: (status: OrderDetail["status"], locale: "en" | "es") => string;
  locale: "en" | "es";
  order: OrderDetail;
}) {
  return (
    <section className="px-4 py-5 sm:px-6">
      <div className="rounded-[22px] border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
          {locale === "en" ? "Order meta and history" : "Estado e historial"}
        </p>
        <div className="mt-4 space-y-3">
          <SummaryRow label={locale === "en" ? "Status" : "Estado"} value={getOrderStatusLabel(order.status, locale)} />
          <SummaryRow label={locale === "en" ? "Updated" : "Actualizado"} value={formatDateTime(order.updatedAt, locale)} />
          <SummaryRow label={locale === "en" ? "Customer notification" : "Notificacion cliente"} value={getNotificationLabel(order.customerNotificationStatus, locale)} />
        </div>
        <div className="my-4 border-t border-[rgba(118,93,71,0.12)]" />
        <div className="space-y-3">
          <SummaryRow label={locale === "en" ? "Created" : "Creado"} value={formatDateTime(order.createdAt, locale)} />
          {order.restaurantConfirmedAt ? <SummaryRow label={locale === "en" ? "Confirmed" : "Confirmado"} value={formatDateTime(order.restaurantConfirmedAt, locale)} /> : null}
          {order.customerNotifiedAt ? <SummaryRow label={locale === "en" ? "Customer notified" : "Cliente notificado"} value={formatDateTime(order.customerNotifiedAt, locale)} /> : null}
          {order.paymentConfirmedAt ? <SummaryRow label={locale === "en" ? "Payment confirmed" : "Pago confirmado"} value={formatDateTime(order.paymentConfirmedAt, locale)} /> : null}
        </div>
      </div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-[var(--text-faint)]">{label}</span>
      <span className="max-w-[65%] text-right font-semibold text-[var(--text-strong)]">{value}</span>
    </div>
  );
}
