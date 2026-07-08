import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem, OrderDetail, OrderLineItem, OrdersDashboardPayload, OrderStatus, OrderSummary } from "@42day/types";
import {
  acceptOrder,
  confirmOrderPaymentProof,
  DashboardApiError,
  getDeliveryCoverageSettings,
  getOrder,
  getOrderPaymentProof,
  listOrders,
  rejectOrderOutOfStock,
  retryOrderCustomerNotification,
  updateOrderStatus,
} from "./api";
import {
  AlertCircle,
  Check,
  ChevronRight,
  ClipboardList,
  Loader2,
  MessageSquareWarning,
  RefreshCcw,
  Store,
  Truck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatDashboardDateTime, formatDashboardPrice } from "./i18n";

type OrdersViewProps = {
  locale: "en" | "es";
  tenantSlug: string;
  menuItems: MenuItem[];
  onNotify: (message: string) => void;
};

type OrdersFilter = "pending" | "confirmed" | "closed" | "alerts";
type PendingLane = "restaurant" | "customer";
type ReplacementScope = "same" | "other";

type OrdersFilterConfig = {
  id: OrdersFilter;
  label: string;
  description: string;
};

type RejectModalSubmitValue = {
  orderItemId: string;
  markMenuItemUnavailable: boolean;
  replacementMenuItemIds: string[];
  note: string;
};

const pendingStatuses: OrderStatus[] = ["new", "pending_restaurant_confirmation", "needs_customer_replacement"];
const confirmedStatuses: OrderStatus[] = ["accepted", "payment_pending_review", "preparing", "on_the_way"];
const closedStatuses: OrderStatus[] = ["delivered", "cancelled"];
let activeOrdersLocale: "en" | "es" = "es";

function getFilterTabs(locale: "en" | "es"): OrdersFilterConfig[] {
  return [
    { id: "pending", label: locale === "en" ? "Pending" : "Pendientes", description: "" },
    { id: "confirmed", label: locale === "en" ? "Confirmed" : "Confirmados", description: "" },
    { id: "closed", label: locale === "en" ? "Closed" : "Cerrados", description: "" },
    { id: "alerts", label: locale === "en" ? "Alerts" : "Alertas", description: "" },
  ];
}

export function OrdersView({ locale, menuItems, onNotify, tenantSlug }: OrdersViewProps) {
  activeOrdersLocale = locale;
  const filterTabs = useMemo(() => getFilterTabs(locale), [locale]);
  const [filter, setFilter] = useState<OrdersFilter>("pending");
  const [pendingLane, setPendingLane] = useState<PendingLane>("restaurant");
  const [payload, setPayload] = useState<OrdersDashboardPayload | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [actionKey, setActionKey] = useState("");
  const [modalOrder, setModalOrder] = useState<OrderDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState<number | undefined>();

  const loadOrders = useCallback(
    async (mode: "initial" | "refresh" = "refresh") => {
      if (mode === "initial") {
        setOrdersLoading(true);
      } else {
        setOrdersRefreshing(true);
      }

      try {
        const nextPayload = await listOrders(tenantSlug, "all");
        setPayload(nextPayload);
        setOrdersError("");
      } catch (error) {
        setOrdersError(getDashboardErrorMessage(error, locale === "en" ? "Could not load orders." : "No se pudieron cargar los pedidos.", locale));
      } finally {
        if (mode === "initial") {
          setOrdersLoading(false);
        } else {
          setOrdersRefreshing(false);
        }
      }
    },
    [tenantSlug],
  );

  const loadOrderDetail = useCallback(
    async (orderId: string) => {
      setDetailLoading(true);
      try {
        const nextDetail = await getOrder(tenantSlug, orderId);
        setSelectedOrder(nextDetail);
        setDetailError("");
        return nextDetail;
      } catch (error) {
        setSelectedOrder(null);
        setDetailError(getDashboardErrorMessage(error, locale === "en" ? "Could not load order details." : "No se pudo cargar el detalle del pedido.", locale));
        return null;
      } finally {
        setDetailLoading(false);
      }
    },
    [tenantSlug],
  );

  useEffect(() => {
    let active = true;

    async function boot() {
      setPayload(null);
      setSelectedOrder(null);
      setSelectedOrderId("");
      if (!tenantSlug) return;

      setOrdersLoading(true);
      try {
        const nextPayload = await listOrders(tenantSlug, "all");
        if (!active) return;
        setPayload(nextPayload);
        setOrdersError("");
      } catch (error) {
        if (!active) return;
        setOrdersError(getDashboardErrorMessage(error, locale === "en" ? "Could not load orders." : "No se pudieron cargar los pedidos.", locale));
      } finally {
        if (active) {
          setOrdersLoading(false);
        }
      }
    }

    void boot();

    const intervalId = window.setInterval(() => {
      if (!active || !tenantSlug) return;
      void loadOrders("refresh");
    }, 20000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [loadOrders, tenantSlug]);

  useEffect(() => {
    let active = true;
    getDeliveryCoverageSettings(tenantSlug)
      .then((settings) => {
        if (active) setDeliveryRadiusKm(settings.deliveryRadiusKm);
      })
      .catch(() => {
        if (active) setDeliveryRadiusKm(undefined);
      });
    return () => { active = false; };
  }, [tenantSlug]);

  const allOrders = payload?.orders ?? [];
  const alertOrders = useMemo(
    () => allOrders.filter(isAlertOrder),
    [allOrders],
  );
  const counts = useMemo<Record<OrdersFilter, number>>(
    () => ({
      pending: allOrders.filter((order) => pendingStatuses.includes(order.status)).length,
      confirmed: allOrders.filter((order) => confirmedStatuses.includes(order.status)).length,
      closed: allOrders.filter((order) => closedStatuses.includes(order.status)).length,
      alerts: Math.max(alertOrders.length, payload?.counts.openAlerts ?? 0),
    }),
    [alertOrders.length, allOrders, payload?.counts.openAlerts],
  );

  const filteredOrders = useMemo(() => allOrders.filter((order) => matchesFilter(order, filter)), [allOrders, filter]);
  const pendingRestaurantOrders = useMemo(
    () => allOrders.filter((order) => order.status === "pending_restaurant_confirmation" || order.status === "new"),
    [allOrders],
  );
  const pendingCustomerOrders = useMemo(
    () => allOrders.filter((order) => order.status === "needs_customer_replacement"),
    [allOrders],
  );
  const pendingLaneOrders = pendingLane === "restaurant" ? pendingRestaurantOrders : pendingCustomerOrders;

  useEffect(() => {
    if (filteredOrders.length === 0) {
      setSelectedOrderId("");
      setSelectedOrder(null);
      setDetailError("");
      return;
    }

    if (!filteredOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId("");
      setSelectedOrder(null);
      setDetailOpen(false);
    }
  }, [filteredOrders, selectedOrderId]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrder(null);
      return;
    }

    void loadOrderDetail(selectedOrderId);
  }, [loadOrderDetail, selectedOrderId]);

  const selectedSummary = filteredOrders.find((order) => order.id === selectedOrderId)
    ?? allOrders.find((order) => order.id === selectedOrderId);

  async function refreshAfterMutation(targetOrderId?: string) {
    await loadOrders("refresh");
    if (targetOrderId) {
      await loadOrderDetail(targetOrderId);
    }
  }

  async function handleAccept(orderId: string) {
    setActionKey(`accept:${orderId}`);
    try {
      await acceptOrder(tenantSlug, orderId);
      onNotify(locale === "en" ? "Order confirmed and customer notified." : "Pedido confirmado y cliente notificado.");
      await refreshAfterMutation(orderId);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, locale === "en" ? "Could not confirm the order." : "No se pudo confirmar el pedido.", locale));
    } finally {
      setActionKey("");
    }
  }

  async function handleRetry(orderId: string, status: OrderStatus) {
    const type = status === "needs_customer_replacement" ? "out_of_stock" : "accepted";
    setActionKey(`retry:${orderId}`);
    try {
      await retryOrderCustomerNotification(tenantSlug, orderId, type);
      onNotify(locale === "en" ? "Notification sent again to the customer." : "Notificacion reenviada al cliente.");
      await refreshAfterMutation(orderId);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, locale === "en" ? "Could not retry the notification." : "No se pudo reintentar la notificacion.", locale));
    } finally {
      setActionKey("");
    }
  }

  async function handleReject(orderId: string, values: RejectModalSubmitValue) {
    setActionKey(`reject:${orderId}`);
    try {
      await rejectOrderOutOfStock(tenantSlug, orderId, {
        items: [
          {
            orderItemId: values.orderItemId,
            markMenuItemUnavailable: values.markMenuItemUnavailable,
            replacementMenuItemIds: values.replacementMenuItemIds,
          },
        ],
        note: values.note || undefined,
      });
      setModalOrder(null);
      onNotify(locale === "en" ? "Customer notified about the out-of-stock item." : "Cliente notificado por agotado.");
      await refreshAfterMutation(orderId);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, locale === "en" ? "Could not notify the out-of-stock item." : "No se pudo notificar el agotado.", locale));
    } finally {
      setActionKey("");
    }
  }

  async function handleAdvanceConfirmed(order: OrderDetail) {
    const nextStatus: OrderStatus = "on_the_way";
    const successMessage = order.fulfillmentType === "delivery"
      ? (locale === "en" ? "Order marked as 30 min delivery." : "Pedido marcado como delivery 30 min.")
      : (locale === "en" ? "Order marked as ready for pickup." : "Pedido marcado como listo para recoger.");

    setActionKey(`status:${order.id}:${nextStatus}`);
    try {
      await updateOrderStatus(tenantSlug, order.id, { status: nextStatus });
      onNotify(successMessage);
      await refreshAfterMutation(order.id);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, locale === "en" ? "Could not advance the order status." : "No se pudo avanzar el estado del pedido.", locale));
    } finally {
      setActionKey("");
    }
  }

  async function handleViewPaymentProof(order: OrderDetail) {
    setActionKey(`proof:view:${order.id}`);
    try {
      const blob = await getOrderPaymentProof(tenantSlug, order.id);
      const objectUrl = window.URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, locale === "en" ? "Could not open the payment proof." : "No se pudo abrir el comprobante.", locale));
    } finally {
      setActionKey("");
    }
  }

  async function handleConfirmPaymentProof(order: OrderDetail) {
    setActionKey(`proof:confirm:${order.id}`);
    try {
      await confirmOrderPaymentProof(tenantSlug, order.id);
      onNotify(locale === "en" ? "Payment confirmed and order ready to continue." : "Pago confirmado y pedido listo para continuar.");
      await refreshAfterMutation(order.id);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, locale === "en" ? "Could not confirm the payment." : "No se pudo confirmar el pago.", locale));
    } finally {
      setActionKey("");
    }
  }
  async function handleFinalizeOrder(order: OrderDetail) {
    setActionKey(`status:${order.id}:delivered`);
    try {
      await updateOrderStatus(tenantSlug, order.id, { status: "delivered" });
      onNotify(locale === "en" ? "Order completed and moved to closed." : "Pedido finalizado y movido a cerrados.");
      await refreshAfterMutation(order.id);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, locale === "en" ? "Could not finalize the order." : "No se pudo finalizar el pedido.", locale));
    } finally {
      setActionKey("");
    }
  }

  async function handleCancelOrder(order: OrderDetail) {
    setActionKey(`status:${order.id}:cancelled`);
    try {
      await updateOrderStatus(tenantSlug, order.id, { status: "cancelled" });
      onNotify(locale === "en" ? "Order cancelled." : "Pedido cancelado.");
      await refreshAfterMutation(order.id);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, locale === "en" ? "Could not cancel the order." : "No se pudo cancelar el pedido.", locale));
    } finally {
      setActionKey("");
    }
  }

  function openOrderDetail(orderId: string) {
    setSelectedOrderId(orderId);
    setDetailOpen(true);
  }

  async function openOutOfStock(orderId: string) {
    const detail = selectedOrder?.id === orderId ? selectedOrder : await loadOrderDetail(orderId);
    if (detail) {
      setSelectedOrderId(orderId);
      setModalOrder(detail);
    }
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="app-panel rounded-[20px] px-4 py-3 sm:rounded-[22px] sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">{locale === "en" ? "Live operation" : "Operacion en vivo"}</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--text-strong)]">{locale === "en" ? "Order queue" : "Bandeja de pedidos"}</h2>
          </div>
          <div className="grid w-full grid-cols-3 gap-1.5 sm:w-auto sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <MetricChip label={locale === "en" ? "Pending" : "Pendientes"} value={counts.pending} />
            <MetricChip label={locale === "en" ? "Confirmed" : "Confirmados"} value={counts.confirmed} />
            <MetricChip label={locale === "en" ? "Alerts" : "Alertas"} value={counts.alerts} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:justify-between">
        <div className="app-panel grid flex-1 grid-cols-4 gap-1 rounded-[20px] p-1.5 sm:gap-2 sm:rounded-[22px] sm:p-2">
          {filterTabs.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                className={`min-h-12 rounded-[15px] border px-1.5 py-2 text-center transition sm:min-h-[58px] sm:px-3 ${
                  getFilterTabClasses(tab.id, active)
                }`}
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                type="button"
              >
                <div className="flex flex-col items-center justify-center gap-1 sm:flex-row sm:gap-2">
                  <span className="text-[11px] font-semibold sm:text-sm">{tab.label}</span>
                  <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:min-w-7 sm:px-2 sm:text-xs ${getFilterCountClasses(tab.id, active)}`}>
                    {counts[tab.id]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <button
          className="inline-flex h-11 self-end items-center justify-center gap-2 rounded-[14px] border border-[rgba(255,242,227,0.12)] bg-[var(--surface-dark-button)] px-3 text-xs font-semibold text-[var(--text-on-dark)] transition hover:bg-[rgba(255,248,240,0.12)] disabled:cursor-not-allowed disabled:opacity-60 lg:h-[58px] lg:min-w-[120px] lg:text-sm"
          disabled={ordersRefreshing}
          onClick={() => void loadOrders("refresh")}
          type="button"
        >
          {ordersRefreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
          {locale === "en" ? "Refresh" : "Actualizar"}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(360px,440px)_minmax(0,1fr)]">
        <div className="app-panel overflow-hidden rounded-[22px] sm:rounded-[24px]">
          <div className="flex items-center justify-between border-b border-[rgba(118,93,71,0.12)] px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">{getFilterLabel(filter, locale)}</p>
              <p className="mt-1 text-xs text-[var(--text-soft)]">{locale === "en" ? "Tap an order to see all details" : "Toca un pedido para ver el detalle"}</p>
            </div>
            <span className="rounded-full bg-[rgba(118,93,71,0.09)] px-2.5 py-1 text-xs font-semibold text-[var(--text-soft)]">{filteredOrders.length}</span>
          </div>
          {ordersLoading ? (
            <LoadingBlock copy={locale === "en" ? "Loading orders..." : "Cargando pedidos..."} />
          ) : ordersError ? (
            <ErrorBlock message={ordersError} />
          ) : filteredOrders.length === 0 ? (
            <EmptyListState filter={filter} locale={locale} />
          ) : (
            <div className="app-scrollbar max-h-none space-y-3 overflow-y-auto p-3 sm:p-4 xl:max-h-[780px]">
              {filteredOrders.map((order) => (
                <OperationalOrderCard
                  actionKey={actionKey}
                  key={order.id}
                  locale={locale}
                  onAccept={() => void handleAccept(order.id)}
                  onOpen={() => openOrderDetail(order.id)}
                  onReportOutOfStock={() => void openOutOfStock(order.id)}
                  order={order}
                />
              ))}
            </div>
          )}
        </div>

        {false && (
        <div className="hidden">
          <div className="border-b border-[rgba(118,93,71,0.12)] px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{getFilterLabel(filter, locale)}</p>
                <p className="mt-2 text-sm text-[var(--text-soft)]">{getFilterDescription(filter, locale)}</p>
              </div>
              <span className="rounded-full bg-[rgba(118,93,71,0.08)] px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)]">
                {filteredOrders.length}
              </span>
            </div>
          </div>

          {ordersLoading ? (
            <LoadingBlock copy={locale === "en" ? "Loading orders..." : "Cargando pedidos..."} />
          ) : ordersError ? (
            <ErrorBlock message={ordersError} />
          ) : filteredOrders.length === 0 ? (
            <EmptyListState filter={filter} locale={locale} />
          ) : filter === "pending" ? (
            <>
              <div className="border-b border-[rgba(118,93,71,0.12)] px-4 py-4">
                <div className="grid grid-cols-1 gap-2 rounded-[20px] bg-[var(--surface-base)] p-2 sm:grid-cols-2">
                  <button
                    className={`rounded-[16px] px-4 py-3 text-left transition ${
                      pendingLane === "restaurant"
                        ? "border border-[rgba(137,164,196,0.28)] bg-[var(--surface-pending)] text-[var(--text-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
                        : "border border-transparent text-[var(--text-soft)] hover:bg-[var(--surface-muted)]"
                    }`}
                    onClick={() => setPendingLane("restaurant")}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{locale === "en" ? "Restaurant review" : "Confirma restaurante"}</span>
                      <span className="rounded-full bg-[rgba(137,164,196,0.18)] px-2 py-0.5 text-xs font-semibold text-[#4d6783]">
                        {pendingRestaurantOrders.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-soft)]">{locale === "en" ? "New orders ready for a decision." : "Pedidos nuevos listos para decision."}</p>
                  </button>
                  <button
                    className={`rounded-[16px] px-4 py-3 text-left transition ${
                      pendingLane === "customer"
                        ? "border border-[rgba(197,123,87,0.22)] bg-[rgba(197,123,87,0.1)] text-[var(--text-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
                        : "border border-transparent text-[var(--text-soft)] hover:bg-[var(--surface-muted)]"
                    }`}
                    onClick={() => setPendingLane("customer")}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{locale === "en" ? "Customer reply" : "Confirma cliente"}</span>
                      <span className="rounded-full bg-[rgba(197,123,87,0.14)] px-2 py-0.5 text-xs font-semibold text-[var(--warning)]">
                        {pendingCustomerOrders.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-soft)]">{locale === "en" ? "Changes or pending selection in WhatsApp." : "Cambios o seleccion pendiente en WhatsApp."}</p>
                  </button>
                </div>
              </div>
              <div className="app-scrollbar max-h-[58vh] overflow-y-auto px-3 py-3 sm:max-h-[760px] sm:px-4 sm:py-4">
                <OrderBucketSection
                  emptyCopy={pendingLane === "restaurant"
                    ? (locale === "en" ? "There are no orders waiting for restaurant confirmation." : "No hay pedidos esperando confirmacion del restaurante.")
                    : (locale === "en" ? "There are no orders waiting for the customer response." : "No hay pedidos esperando respuesta del cliente.")}
                  onSelectOrder={setSelectedOrderId}
                  orders={pendingLaneOrders}
                  selectedOrderId={selectedOrderId}
                  title={pendingLane === "restaurant"
                    ? (locale === "en" ? "Waiting on restaurant" : "Espera restaurante")
                    : (locale === "en" ? "Waiting on customer" : "Espera cliente")}
                  tone={pendingLane}
                />
              </div>
            </>
          ) : (
            <div className="app-scrollbar max-h-[58vh] space-y-3 overflow-y-auto px-3 py-3 sm:max-h-[860px] sm:px-4 sm:py-4">
              {filteredOrders.map((order) => {
                const active = order.id === selectedOrderId;
                const acceptedStage = order.status === "accepted";
                return (
                  <button
                    className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                      active
                        ? acceptedStage
                          ? "border-[rgba(79,122,97,0.38)] bg-[rgba(226,238,231,0.92)] shadow-[inset_5px_0_0_rgba(79,122,97,0.82)]"
                          : "border-[rgba(137,164,196,0.34)] bg-[var(--surface-strong)]"
                        : acceptedStage
                          ? "border-[rgba(79,122,97,0.28)] bg-[rgba(226,238,231,0.72)] shadow-[inset_5px_0_0_rgba(79,122,97,0.68)] hover:bg-[rgba(226,238,231,0.95)]"
                          : "border-[rgba(118,93,71,0.1)] bg-[var(--surface-base)] hover:bg-[var(--surface-muted)]"
                    }`}
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <OrderStatusBadge locale={locale} status={order.status} />
                          {order.customerNotificationStatus === "failed" && <NotificationBadge locale={locale} status="failed" />}
                        </div>
                        <p className="mt-3 truncate text-sm font-semibold text-[var(--text-strong)]">
                          {order.customerName?.trim() || order.customerPhone || (locale === "en" ? "Unnamed customer" : "Cliente sin nombre")}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[var(--text-faint)]">
                          {formatDateTime(order.createdAt, locale)}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">{getFulfillmentLabel(order, locale)}</p>
                        {filter === "confirmed" ? (
                          <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                            acceptedStage
                              ? "bg-[var(--success)] text-white shadow-[0_6px_18px_rgba(79,122,97,0.22)]"
                              : "bg-[rgba(79,122,97,0.12)] text-[var(--success)]"
                          }`}>
                            {getConfirmedProgressLabel(order, locale)}
                          </p>
                        ) : null}
                        {filter === "closed" ? (
                          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                            Cuenta #{getOrderReceiptCode(order.id)}
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm text-[var(--text-soft)]">{order.customerPhone || (locale === "en" ? "No phone" : "Sin telefono")}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <p className="text-sm font-semibold text-[var(--text-strong)]">{formatPrice(order.total, locale)}</p>
                        <ChevronRight className={active ? "text-[var(--warning)]" : "text-[var(--text-faint)]"} size={18} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        )}

        <div className="app-panel hidden min-w-0 overflow-hidden rounded-[26px] xl:block">
          {!selectedOrderId ? (
            <div className="grid min-h-[380px] place-items-center px-4 py-10 text-center sm:min-h-[520px] sm:px-5">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[rgba(118,93,71,0.08)] text-[var(--text-faint)]">
                  <ClipboardList size={24} />
                </div>
                <p className="app-display mt-5 text-[2.2rem] leading-none text-[var(--text-strong)]">{locale === "en" ? "No order selected" : "Sin pedido seleccionado"}</p>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-[var(--text-soft)]">
                  {locale === "en"
                    ? "Select an order from the list to review details, confirm it, or report an out-of-stock item."
                    : "Selecciona un pedido de la lista para revisar el detalle, confirmar o reportar un agotado."}
                </p>
              </div>
            </div>
          ) : detailLoading ? (
            <LoadingBlock copy={locale === "en" ? "Loading order details..." : "Cargando detalle del pedido..."} />
          ) : detailError ? (
            <ErrorBlock message={detailError} />
          ) : selectedOrder ? (
            <OrderDetailPanel
              actionKey={actionKey}
              deliveryRadiusKm={deliveryRadiusKm}
              menuItems={menuItems}
              onAccept={() => void handleAccept(selectedOrder.id)}
              onAdvanceConfirmed={() => void handleAdvanceConfirmed(selectedOrder)}
              onCancel={() => void handleCancelOrder(selectedOrder)}
              onConfirmPaymentProof={() => void handleConfirmPaymentProof(selectedOrder)}
              onFinalize={() => void handleFinalizeOrder(selectedOrder)}
              onOpenRejectModal={() => setModalOrder(selectedOrder)}
              onRetry={() => void handleRetry(selectedOrder.id, selectedOrder.status)}
              onViewPaymentProof={() => void handleViewPaymentProof(selectedOrder)}
              order={selectedOrder}
              selectedSummary={selectedSummary}
            />
          ) : (
            <ErrorBlock message={locale === "en" ? "Could not resolve the selected order details." : "No se pudo resolver el detalle del pedido seleccionado."} />
          )}
        </div>
      </div>

      {detailOpen ? (
        <div className="fixed inset-0 z-40 flex items-end bg-[rgba(14,11,9,0.58)] backdrop-blur-sm xl:hidden" onClick={() => setDetailOpen(false)}>
          <div className="app-panel app-scrollbar max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px]" onClick={(event) => event.stopPropagation()}>
            {detailLoading ? (
              <LoadingBlock copy={locale === "en" ? "Loading order details..." : "Cargando detalle del pedido..."} />
            ) : detailError ? (
              <ErrorBlock message={detailError} />
            ) : selectedOrder ? (
              <OrderDetailPanel
                actionKey={actionKey}
                deliveryRadiusKm={deliveryRadiusKm}
                menuItems={menuItems}
                onAccept={() => void handleAccept(selectedOrder.id)}
                onAdvanceConfirmed={() => void handleAdvanceConfirmed(selectedOrder)}
                onCancel={() => void handleCancelOrder(selectedOrder)}
                onClose={() => setDetailOpen(false)}
                onConfirmPaymentProof={() => void handleConfirmPaymentProof(selectedOrder)}
                onFinalize={() => void handleFinalizeOrder(selectedOrder)}
                onOpenRejectModal={() => setModalOrder(selectedOrder)}
                onRetry={() => void handleRetry(selectedOrder.id, selectedOrder.status)}
                onViewPaymentProof={() => void handleViewPaymentProof(selectedOrder)}
                order={selectedOrder}
                selectedSummary={selectedSummary}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {modalOrder && (
        <OutOfStockModal
          menuItems={menuItems}
          onClose={() => setModalOrder(null)}
          onSubmit={(values) => handleReject(modalOrder.id, values)}
          order={modalOrder}
          submitting={actionKey === `reject:${modalOrder.id}`}
        />
      )}
    </section>
  );
}

function OperationalOrderCard({
  actionKey,
  locale,
  onAccept,
  onOpen,
  onReportOutOfStock,
  order,
}: {
  actionKey: string;
  locale: "en" | "es";
  onAccept: () => void;
  onOpen: () => void;
  onReportOutOfStock: () => void;
  order: OrderSummary;
}) {
  const canDecide = order.status === "pending_restaurant_confirmation";
  const notificationFailed = order.customerNotificationStatus === "failed";

  return (
    <article
      className="cursor-pointer rounded-[20px] border border-[rgba(118,93,71,0.12)] bg-[rgba(255,251,246,0.92)] p-4 transition hover:border-[rgba(118,93,71,0.22)] hover:bg-white focus:outline-none focus:ring-4 focus:ring-[rgba(197,123,87,0.1)]"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <OrderStatusBadge locale={locale} status={order.status} />
          {notificationFailed ? <AlertCircle className="shrink-0 text-[var(--warning)]" size={15} /> : null}
        </div>
        <span className="shrink-0 text-xs font-medium text-[var(--text-faint)]">{formatRelativeTime(order.createdAt, locale)}</span>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 truncate text-base font-semibold text-[var(--text-strong)]">
          {locale === "en" ? "Order" : "Pedido"} #{getOrderReceiptCode(order.id)}
        </h3>
        <p className="shrink-0 text-base font-extrabold text-[var(--text-strong)]">{formatPrice(order.total, locale)}</p>
      </div>

      <p className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-[var(--text-strong)]">
        {getOrderItemsSummary(order.items, locale)}
      </p>
      <p className="mt-2 text-xs leading-5 text-[var(--text-soft)]">{getOperationalFulfillmentLabel(order, locale)}</p>

      {canDecide ? (
        <div className="mt-4 grid gap-2 min-[360px]:grid-cols-[minmax(0,1fr)_auto]">
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:opacity-60"
            disabled={actionKey === `accept:${order.id}`}
            onClick={(event) => {
              event.stopPropagation();
              onAccept();
            }}
            type="button"
          >
            {actionKey === `accept:${order.id}` ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
            {actionKey === `accept:${order.id}`
              ? (locale === "en" ? "Confirming..." : "Confirmando...")
              : (locale === "en" ? "Confirm order" : "Confirmar pedido")}
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-[rgba(197,123,87,0.2)] px-3 text-sm font-semibold text-[var(--warning)] transition hover:bg-[rgba(197,123,87,0.08)]"
            onClick={(event) => {
              event.stopPropagation();
              onReportOutOfStock();
            }}
            type="button"
          >
            <MessageSquareWarning size={15} />
            <span className="min-[390px]:hidden">{locale === "en" ? "Out" : "Agotado"}</span>
            <span className="hidden min-[390px]:inline">{locale === "en" ? "Report out" : "Reportar agotado"}</span>
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-end gap-1 text-xs font-semibold text-[var(--text-soft)]">
          {locale === "en" ? "View details" : "Ver detalle"}
          <ChevronRight size={15} />
        </div>
      )}
    </article>
  );
}

function OrderDetailPanel({
  actionKey,
  deliveryRadiusKm,
  menuItems,
  onAccept,
  onAdvanceConfirmed,
  onCancel,
  onClose,
  onConfirmPaymentProof,
  onFinalize,
  onOpenRejectModal,
  onRetry,
  onViewPaymentProof,
  order,
  selectedSummary,
}: {
  actionKey: string;
  deliveryRadiusKm?: number;
  menuItems: MenuItem[];
  onAccept: () => void;
  onAdvanceConfirmed: () => void;
  onCancel: () => void;
  onClose?: () => void;
  onConfirmPaymentProof: () => void;
  onFinalize: () => void;
  onOpenRejectModal: () => void;
  onRetry: () => void;
  onViewPaymentProof: () => void;
  order: OrderDetail;
  selectedSummary?: OrderSummary;
}) {
  const locale = activeOrdersLocale;
  const notificationFailed = order.customerNotificationStatus === "failed";
  const canAccept = order.status === "pending_restaurant_confirmation";
  const canReject = order.status === "pending_restaurant_confirmation";
  const canRetry = notificationFailed && (order.status === "accepted" || order.status === "needs_customer_replacement");
  const canAdvanceConfirmed = ["accepted", "preparing"].includes(order.status);
  const canFinalize = order.status === "on_the_way";
  const canCancel = !closedStatuses.includes(order.status);
  const canConfirmPaymentProof = order.status === "payment_pending_review" && Boolean(order.paymentProof);
  const replacementOptions = order.restaurantReviewMetadata?.replacementMenuItems ?? [];
  const unavailableItems = order.restaurantReviewMetadata?.unavailableItems ?? [];
  const advanceLabel = order.fulfillmentType === "delivery"
    ? (locale === "en" ? "Mark as 30 min delivery" : "Marcar delivery 30 min")
    : (locale === "en" ? "Mark as ready for pickup" : "Marcar listo para recoger");
  return (
    <div className="flex min-h-[420px] flex-col sm:min-h-[620px]">
      <div className="border-b border-[rgba(118,93,71,0.12)] px-4 py-5 sm:px-6">
        {onClose ? (
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">{locale === "en" ? "Order detail" : "Detalle del pedido"}</span>
            <button
              aria-label={locale === "en" ? "Close order detail" : "Cerrar detalle del pedido"}
              className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(118,93,71,0.12)] text-[var(--text-soft)]"
              onClick={onClose}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        ) : null}
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge locale={locale} status={order.status} />
              {notificationFailed && <NotificationBadge locale={locale} status="failed" />}
              {selectedSummary?.customerNotificationStatus === "sent" && <NotificationBadge locale={locale} status="sent" />}
            </div>
            <h3 className="app-display mt-4 text-[2rem] leading-none text-[var(--text-strong)] sm:text-[2.6rem]">
              {order.customerName?.trim() || order.customerPhone || (locale === "en" ? "Order without visible customer" : "Pedido sin cliente visible")}
            </h3>
            <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">
              {order.customerPhone || (locale === "en" ? "No phone" : "Sin telefono")} - {formatDateTime(order.createdAt, locale)}
            </p>
            <p className="mt-1 text-sm leading-7 text-[var(--text-soft)]">{getFulfillmentLabel(order, locale)}</p>
            {confirmedStatuses.includes(order.status) ? (
              <OrderProgressRail fulfillmentType={order.fulfillmentType} locale={locale} status={order.status} />
            ) : null}
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            {canAccept && (
              <ActionButton
                active={actionKey === `accept:${order.id}`}
                icon={Check}
                label={actionKey === `accept:${order.id}` ? (locale === "en" ? "Confirming..." : "Confirmando...") : (locale === "en" ? "Confirm order" : "Confirmar pedido")}
                onClick={onAccept}
                variant="primary"
              />
            )}
            {canReject && (
              <ActionButton
                icon={MessageSquareWarning}
                label={locale === "en" ? "Report out of stock" : "Reportar agotado"}
                onClick={onOpenRejectModal}
                variant="secondary"
              />
            )}
            {canRetry && (
              <ActionButton
                active={actionKey === `retry:${order.id}`}
                icon={RefreshCcw}
                label={actionKey === `retry:${order.id}` ? (locale === "en" ? "Sending again..." : "Reenviando...") : (locale === "en" ? "Retry WhatsApp" : "Reenviar WhatsApp")}
                onClick={onRetry}
                variant="warning"
              />
            )}
            {order.paymentProof && (
              <ActionButton
                active={actionKey === `proof:view:${order.id}`}
                icon={ClipboardList}
                label={actionKey === `proof:view:${order.id}` ? (locale === "en" ? "Opening..." : "Abriendo...") : (locale === "en" ? "View proof" : "Ver comprobante")}
                onClick={onViewPaymentProof}
                variant="secondary"
              />
            )}
            {canConfirmPaymentProof && (
              <ActionButton
                active={actionKey === `proof:confirm:${order.id}`}
                icon={Check}
                label={actionKey === `proof:confirm:${order.id}` ? (locale === "en" ? "Confirming payment..." : "Confirmando pago...") : (locale === "en" ? "Confirm payment" : "Confirmar pago")}
                onClick={onConfirmPaymentProof}
                variant="primary"
              />
            )}
            {canAdvanceConfirmed && (
              <ActionButton
                active={actionKey === `status:${order.id}:on_the_way`}
                icon={Check}
                label={actionKey === `status:${order.id}:on_the_way` ? (locale === "en" ? "Updating..." : "Actualizando...") : advanceLabel}
                onClick={onAdvanceConfirmed}
                variant="primary"
              />
            )}
            {canFinalize && (
              <ActionButton
                active={actionKey === `status:${order.id}:delivered`}
                icon={Check}
                label={actionKey === `status:${order.id}:delivered` ? (locale === "en" ? "Finishing..." : "Finalizando...") : (locale === "en" ? "Complete order" : "Finalizar pedido")}
                onClick={onFinalize}
                variant="primary"
              />
            )}
            {canCancel && !canAccept && (
              <ActionButton
                active={actionKey === `status:${order.id}:cancelled`}
                icon={X}
                label={actionKey === `status:${order.id}:cancelled` ? (locale === "en" ? "Cancelling..." : "Cancelando...") : (locale === "en" ? "Cancel order" : "Cancelar pedido")}
                onClick={onCancel}
                variant="warning"
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="divide-y divide-[rgba(118,93,71,0.12)]">
          <section className="px-4 py-5 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <InfoChip icon={order.fulfillmentType === "delivery" ? Truck : Store} label={order.fulfillmentType === "delivery" ? (locale === "en" ? "Delivery" : "Domicilio") : (locale === "en" ? "Pickup" : "Recoge en local")} />
              <InfoChip icon={ClipboardList} label={order.paymentMethod === "transfer" ? "Transferencia" : "Efectivo"} />
            </div>
            {order.deliveryAddress && (
              <p className="mt-5 text-sm leading-7 text-[var(--text-soft)]">
                <span className="font-semibold text-[var(--text-strong)]">{locale === "en" ? "Address:" : "Direccion:"}</span> {order.deliveryAddress}
              </p>
            )}
            {order.fulfillmentType === "delivery" ? (
              <DeliveryCoverageDetail deliveryRadiusKm={deliveryRadiusKm} locale={locale} order={order} />
            ) : null}
            {order.restaurantReviewNote && (
              <p className="mt-4 text-sm leading-7 text-[var(--text-soft)]">
                <span className="font-semibold text-[var(--text-strong)]">{locale === "en" ? "Internal note:" : "Nota interna:"}</span> {order.restaurantReviewNote}
              </p>
            )}
            {notificationFailed && order.customerNotificationError && (
              <p className="mt-4 rounded-[22px] border border-[rgba(197,123,87,0.18)] bg-[rgba(197,123,87,0.08)] px-4 py-3 text-sm font-medium text-[var(--warning)]">
                {locale === "en" ? "Customer notification error:" : "Error de envio al cliente:"} {order.customerNotificationError}
              </p>
            )}
            {order.paymentProof && (
              <div className="mt-4 rounded-[22px] border border-[rgba(97,135,158,0.18)] bg-[rgba(97,135,158,0.08)] px-4 py-4 text-sm text-[#46697c]">
                <p className="font-semibold text-[#2d5369]">{locale === "en" ? "Transfer proof" : "Comprobante de transferencia"}</p>
                <p className="mt-2">{locale === "en" ? "Status" : "Estado"}: {getPaymentProofStatusLabel(order.paymentProof.status, locale)}</p>
                <p className="mt-1">{locale === "en" ? "Received" : "Recibido"}: {formatDateTime(order.paymentProof.createdAt, locale)}</p>
                {order.paymentProof.mimeType && <p className="mt-1">{locale === "en" ? "Format" : "Formato"}: {order.paymentProof.mimeType}</p>}
                {order.paymentProof.fileSize !== undefined && <p className="mt-1">{locale === "en" ? "Size" : "Tamano"}: {formatFileSize(order.paymentProof.fileSize)}</p>}
              </div>
            )}
          </section>
          <section className="px-4 py-5 sm:px-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">{locale === "en" ? "Order items" : "Items del pedido"}</h4>
              <p className="text-xs text-[var(--text-faint)]">{order.items.length} {locale === "en" ? "products" : "productos"}</p>
            </div>
            <div className="space-y-3">
              {order.items.map((item, index) => (
                <OrderItemCard item={item} key={getOrderItemKey(item, index)} menuItems={menuItems} />
              ))}
            </div>
          </section>

          {order.status === "needs_customer_replacement" && (
            <section className="px-4 py-5 sm:px-6">
              <div className="rounded-[24px] border border-[rgba(197,123,87,0.18)] bg-[rgba(197,123,87,0.08)] p-5">
                <div className="flex items-center gap-2 text-[var(--warning)]">
                  <AlertCircle size={17} />
                  <h4 className="text-sm font-semibold uppercase tracking-[0.12em]">{locale === "en" ? "Waiting for customer decision" : "Esperando decision del cliente"}</h4>
                </div>
                {unavailableItems.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {unavailableItems.map((item) => (
                      <p className="text-sm leading-6 text-[var(--warning)]" key={item.orderItemId}>
                        {locale === "en" ? "Out of stock:" : "Agotado:"} <span className="font-semibold">{item.name}</span> - {locale === "en" ? "category" : "categoria"} {item.category || (locale === "en" ? "uncategorized" : "sin categoria")}
                      </p>
                    ))}
                  </div>
                )}
                {replacementOptions.length > 0 && (
                  <div className="mt-5 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--warning)]">{locale === "en" ? "Options sent" : "Opciones enviadas"}</p>
                    {replacementOptions.map((option, index) => (
                      <div className="flex flex-col gap-2 rounded-[18px] bg-white/75 px-3 py-3 text-sm text-[var(--text-strong)] sm:flex-row sm:items-center sm:justify-between" key={option.menuItemId}>
                        <span>{index + 1}. {option.name}</span>
                        <span className="font-semibold">{formatPrice(option.price, locale)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="border-t border-[rgba(118,93,71,0.12)] bg-[var(--panel-strong)] px-4 py-5 xl:border-l xl:border-t-0 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{locale === "en" ? "Bill and summary" : "Cuenta y factura"}</p>
          <div className="mt-4 rounded-[18px] bg-[var(--surface-base)] px-4 py-3">
            <SummaryRow label={locale === "en" ? "Receipt" : "Factura"} value={`#${getOrderReceiptCode(order.id)}`} />
          </div>
          <div className="mt-4 space-y-3">
            <SummaryRow label={locale === "en" ? "Subtotal" : "Subtotal"} value={formatPrice(order.subtotal, locale)} />
            <SummaryRow label={locale === "en" ? "Delivery" : "Domicilio"} value={formatPrice(order.deliveryFee, locale)} />
            <SummaryRow label={locale === "en" ? "Discount" : "Descuento"} value={formatPrice(order.discountTotal, locale)} />
          </div>
          <div className="my-4 border-t border-[rgba(118,93,71,0.12)]" />
          <SummaryRow emphasis label="Total" value={formatPrice(order.total, locale)} />
          <div className="my-4 border-t border-[rgba(118,93,71,0.12)]" />
          <div className="space-y-3">
            <SummaryRow label={locale === "en" ? "Status" : "Estado"} value={getOrderStatusLabel(order.status, locale)} />
            <SummaryRow label={locale === "en" ? "Updated" : "Actualizado"} value={formatDateTime(order.updatedAt, locale)} />
            <SummaryRow label={locale === "en" ? "Customer notification" : "Notificacion cliente"} value={getNotificationLabel(order.customerNotificationStatus, locale)} />
          </div>
          <div className="my-4 border-t border-[rgba(118,93,71,0.12)]" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">{locale === "en" ? "Order history" : "Historial del pedido"}</p>
          <div className="mt-3 space-y-3">
            <SummaryRow label={locale === "en" ? "Created" : "Creado"} value={formatDateTime(order.createdAt, locale)} />
            {order.restaurantConfirmedAt ? <SummaryRow label={locale === "en" ? "Confirmed" : "Confirmado"} value={formatDateTime(order.restaurantConfirmedAt, locale)} /> : null}
            {order.customerNotifiedAt ? <SummaryRow label={locale === "en" ? "Customer notified" : "Cliente notificado"} value={formatDateTime(order.customerNotifiedAt, locale)} /> : null}
            {order.paymentConfirmedAt ? <SummaryRow label={locale === "en" ? "Payment confirmed" : "Pago confirmado"} value={formatDateTime(order.paymentConfirmedAt, locale)} /> : null}
          </div>
        </aside>
      </div>

    </div>
  );
}

function OutOfStockModal({
  menuItems,
  onClose,
  onSubmit,
  order,
  submitting,
}: {
  menuItems: MenuItem[];
  onClose: () => void;
  onSubmit: (values: RejectModalSubmitValue) => Promise<void>;
  order: OrderDetail;
  submitting: boolean;
}) {
  const locale = activeOrdersLocale;
  const [selectedOrderItemId, setSelectedOrderItemId] = useState(order.items.find((item) => item.id)?.id ?? "");
  const [markMenuItemUnavailable, setMarkMenuItemUnavailable] = useState(true);
  const [selectedReplacementIds, setSelectedReplacementIds] = useState<string[]>([]);
  const [replacementScope, setReplacementScope] = useState<ReplacementScope>("same");
  const [note, setNote] = useState("");

  const selectedOrderItem = useMemo(
    () => order.items.find((item) => item.id === selectedOrderItemId) ?? null,
    [order.items, selectedOrderItemId],
  );

  const replacementPools = useMemo(() => {
    if (!selectedOrderItem) {
      return { same: [] as MenuItem[], other: [] as MenuItem[] };
    }

    const category = resolveOrderItemCategory(selectedOrderItem, menuItems);
    const normalizedCategory = normalizeCategoryKey(category);

    const activeCandidates = menuItems
      .filter((item) => item.isAvailable)
      .filter((item) => item.product?.isActive !== false)
      .filter((item) => item.id !== selectedOrderItem.menuItemId)
      .filter((item) => item.productId !== selectedOrderItem.productId)
      .filter((item) => item.product?.id !== selectedOrderItem.productId)
      .sort((left, right) => left.sortOrder - right.sortOrder);

    return {
      same: activeCandidates
        .filter((item) => normalizeCategoryKey(resolveMenuItemCategory(item, menuItems)) === normalizedCategory)
        .slice(0, 8),
      other: activeCandidates
        .filter((item) => normalizeCategoryKey(resolveMenuItemCategory(item, menuItems)) !== normalizedCategory)
        .slice(0, 16),
    };
  }, [menuItems, selectedOrderItem]);

  const replacementSuggestions = replacementScope === "same" ? replacementPools.same : replacementPools.other;

  useEffect(() => {
    setReplacementScope("same");
    setSelectedReplacementIds(replacementPools.same.slice(0, 3).map((item) => item.id));
  }, [replacementPools.same]);

  function selectReplacementScope(scope: ReplacementScope) {
    setReplacementScope(scope);
    setSelectedReplacementIds(replacementPools[scope].slice(0, 3).map((item) => item.id));
  }

  const categoryLabel = (selectedOrderItem
    ? resolveOrderItemCategory(selectedOrderItem, menuItems)
    : undefined)
    || (locale === "en" ? "uncategorized" : "sin categoria");

  const canSubmit = Boolean(selectedOrderItemId) && selectedReplacementIds.length > 0;

  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-[rgba(14,11,9,0.55)] p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="app-panel reveal-up flex max-h-[96vh] w-full flex-col overflow-hidden rounded-t-[28px] sm:max-h-[92vh] sm:max-w-3xl sm:rounded-[30px]">
        <div className="flex items-start justify-between border-b border-[rgba(118,93,71,0.12)] px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{locale === "en" ? "Out of stock" : "Agotados"}</p>
            <h3 className="app-display mt-2 text-[2.2rem] leading-none text-[var(--text-strong)]">{locale === "en" ? "Report out of stock" : "Reportar agotado"}</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
              {locale === "en"
                ? "The customer will receive active alternatives. We prioritize the same category, and you can open other categories if needed."
                : "El cliente recibira alternativas activas. Priorizamos la misma categoria y puedes abrir otras categorias si hace falta."}
            </p>
          </div>
          <button
            className="grid h-10 w-10 place-items-center rounded-2xl border border-[rgba(118,93,71,0.12)] text-[var(--text-soft)] transition hover:bg-white"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="app-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          <section className="rounded-[24px] bg-[rgba(248,241,232,0.58)] p-4">
            <StepLabel step={1} title={locale === "en" ? "Out-of-stock item" : "Item agotado"} />
            <div className="mt-4 space-y-2">
              {order.items.map((item, index) => {
                const itemId = item.id ?? "";
                const active = itemId === selectedOrderItemId;
                return (
                  <button
                    className={`flex w-full flex-col gap-2 rounded-[20px] border px-4 py-3 text-left transition sm:flex-row sm:items-center sm:justify-between ${
                      active
                        ? "border-[rgba(197,123,87,0.22)] bg-[rgba(197,123,87,0.08)] text-[var(--text-strong)]"
                        : "border-[rgba(118,93,71,0.1)] bg-white/80 text-[var(--text-strong)] hover:bg-white"
                    }`}
                    disabled={!item.id}
                    key={getOrderItemKey(item, index)}
                    onClick={() => setSelectedOrderItemId(itemId)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.quantity} x {item.name}</p>
                      <p className="mt-1 text-xs text-[var(--text-faint)]">
                        {resolveOrderItemCategory(item, menuItems) || (locale === "en" ? "uncategorized" : "sin categoria")}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold">{formatPrice(item.lineTotal, locale)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[24px] bg-[rgba(248,241,232,0.58)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <StepLabel step={2} title={locale === "en" ? "Alternatives for the customer" : "Alternativas para el cliente"} />
                <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">{locale === "en" ? "Category used" : "Categoria usada"}: {categoryLabel}</p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-soft)]">
                <input
                  checked={markMenuItemUnavailable}
                  className="h-4 w-4 rounded border-[rgba(118,93,71,0.32)]"
                  onChange={(event) => setMarkMenuItemUnavailable(event.target.checked)}
                  type="checkbox"
                />
                {locale === "en" ? "Mark as unavailable in menu" : "Marcar no disponible en menu"}
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 rounded-[20px] bg-[var(--surface-base)] p-2 sm:grid-cols-2">
              <ReplacementScopeTab
                active={replacementScope === "same"}
                count={replacementPools.same.length}
                label={locale === "en" ? "Same category" : "Misma categoria"}
                onClick={() => selectReplacementScope("same")}
              />
              <ReplacementScopeTab
                active={replacementScope === "other"}
                count={replacementPools.other.length}
                label={locale === "en" ? "Other categories" : "Otras categorias"}
                onClick={() => selectReplacementScope("other")}
              />
            </div>

            {replacementSuggestions.length === 0 ? (
              <div className="mt-4 rounded-[20px] border border-[rgba(197,123,87,0.18)] bg-[rgba(197,123,87,0.08)] px-4 py-3 text-sm leading-6 text-[var(--warning)]">
                {replacementScope === "same"
                  ? (locale === "en"
                    ? "There are no active products in this category. Open other categories to suggest a different menu option."
                    : "No hay productos activos en esta categoria. Abre otras categorias para recomendar otra opcion del menu.")
                  : (locale === "en"
                    ? "There are no other active products available to suggest."
                    : "No hay otros productos activos disponibles para recomendar.")}
              </div>
            ) : (
              <div className="app-scrollbar mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                {replacementSuggestions.map((item) => {
                  const checked = selectedReplacementIds.includes(item.id);
                  return (
                    <label
                      className="flex flex-col gap-3 rounded-[20px] border border-[rgba(118,93,71,0.1)] bg-white/80 px-4 py-3 text-sm text-[var(--text-strong)] sm:flex-row sm:items-start sm:justify-between"
                      key={item.id}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          checked={checked}
                          className="mt-0.5 h-4 w-4 rounded border-[rgba(118,93,71,0.32)]"
                          onChange={(event) => {
                            setSelectedReplacementIds((current) => (
                              event.target.checked
                                ? [...current, item.id]
                                : current.filter((entry) => entry !== item.id)
                            ));
                          }}
                          type="checkbox"
                        />
                        <div>
                          <p className="font-semibold">{getMenuItemDisplayName(item)}</p>
                          <p className="mt-1 text-xs text-[var(--text-faint)]">{item.product?.category || categoryLabel}</p>
                        </div>
                      </div>
                      <span className="shrink-0 font-semibold">{formatPrice(resolveMenuItemPrice(item), locale)}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {replacementSuggestions.length > 0 && selectedReplacementIds.length === 0 ? (
              <p className="mt-3 text-xs font-semibold text-[var(--warning)]">
                {locale === "en" ? "Select at least one alternative before sending." : "Selecciona al menos una alternativa antes de enviar."}
              </p>
            ) : null}
          </section>

          <section className="rounded-[24px] bg-[rgba(248,241,232,0.58)] p-4">
            <StepLabel step={3} title={locale === "en" ? "Internal note" : "Nota interna"} />
            <textarea
              className="mt-4 min-h-28 w-full rounded-[20px] border border-[rgba(118,93,71,0.12)] bg-white/80 px-4 py-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:bg-white focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
              onChange={(event) => setNote(event.target.value)}
              placeholder={locale === "en" ? "Ex. No Coca-Cola, offer other cold drinks." : "Ej. Sin Coca-Cola, se ofrecen otras bebidas frias."}
              value={note}
            />
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[rgba(118,93,71,0.12)] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-[rgba(118,93,71,0.12)] px-4 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[rgba(248,241,232,0.6)]"
            onClick={onClose}
            type="button"
          >
            {locale === "en" ? "Cancel" : "Cancelar"}
          </button>
          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-5 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSubmit || submitting}
            onClick={() => {
              if (!canSubmit) return;
              void onSubmit({
                orderItemId: selectedOrderItemId,
                markMenuItemUnavailable,
                replacementMenuItemIds: selectedReplacementIds,
                note,
              });
            }}
            type="button"
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : <MessageSquareWarning size={16} />}
            {submitting ? (locale === "en" ? "Sending..." : "Enviando...") : (locale === "en" ? "Send by WhatsApp" : "Enviar por WhatsApp")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeliveryCoverageDetail({
  deliveryRadiusKm,
  locale,
  order,
}: {
  deliveryRadiusKm?: number;
  locale: "en" | "es";
  order: OrderDetail;
}) {
  const requiresLocation = order.coverageValidationMethod === "written_address_reference"
    && (order.customerLatitude === undefined || order.customerLongitude === undefined);
  const status = requiresLocation
    ? (locale === "en" ? "Location required" : "Requiere ubicacion")
    : order.isInsideDeliveryCoverage === true
      ? (locale === "en" ? "Inside coverage" : "Dentro de cobertura")
      : order.isInsideDeliveryCoverage === false
        ? (locale === "en" ? "Outside coverage" : "Fuera de cobertura")
        : (locale === "en" ? "Not validated" : "No validado");
  const statusClass = order.isInsideDeliveryCoverage === true
    ? "bg-[rgba(79,122,97,0.12)] text-[var(--success)]"
    : "bg-[rgba(197,123,87,0.12)] text-[var(--warning)]";
  const method = {
    whatsapp_location: locale === "en" ? "WhatsApp location" : "Ubicacion de WhatsApp",
    written_address_reference: locale === "en" ? "Written address reference" : "Direccion escrita como referencia",
    geocoded_address: locale === "en" ? "Geocoded address" : "Direccion geocodificada",
    not_validated: locale === "en" ? "Not validated" : "No validado",
  }[order.coverageValidationMethod ?? "not_validated"];

  return (
    <div className="mt-5 border-t border-[rgba(118,93,71,0.12)] pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">{locale === "en" ? "Delivery" : "Domicilio"}</h4>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{status}</span>
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <SummaryRow label={locale === "en" ? "Method" : "Metodo"} value={method} />
        <SummaryRow label={locale === "en" ? "Distance" : "Distancia"} value={order.deliveryDistanceKm !== undefined ? `${order.deliveryDistanceKm.toFixed(1)} km` : (locale === "en" ? "Not calculated" : "Sin calcular")} />
        <SummaryRow label={locale === "en" ? "Allowed radius" : "Radio permitido"} value={deliveryRadiusKm !== undefined ? `${deliveryRadiusKm} km` : (locale === "en" ? "Not available" : "No disponible")} />
        <SummaryRow label={locale === "en" ? "Coordinates" : "Coordenadas"} value={order.customerLatitude !== undefined && order.customerLongitude !== undefined ? `${order.customerLatitude.toFixed(6)}, ${order.customerLongitude.toFixed(6)}` : (locale === "en" ? "Not received" : "No recibidas")} />
      </div>
      {order.customerAddressText ? <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]"><span className="font-semibold text-[var(--text-strong)]">{locale === "en" ? "Customer reference:" : "Referencia del cliente:"}</span> {order.customerAddressText}</p> : null}
      {requiresLocation ? (
        <div className="mt-4 flex items-start gap-2 rounded-[14px] bg-[rgba(197,123,87,0.1)] px-3 py-3 text-sm leading-6 text-[var(--warning)]">
          <AlertCircle className="mt-0.5 shrink-0" size={16} />
          {locale === "en" ? "The customer wrote an address, but coverage has not been validated with an exact location yet." : "El cliente escribio una direccion, pero todavia no se valido cobertura con ubicacion exacta."}
        </div>
      ) : null}
    </div>
  );
}

function OrderItemCard({ item, menuItems }: { item: OrderLineItem; menuItems: MenuItem[] }) {
  const locale = activeOrdersLocale;
  return (
    <article className="rounded-[22px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.86)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-strong)]">
            {item.quantity} x {item.name}
          </p>
          <p className="mt-1 text-xs text-[var(--text-faint)]">
            {locale === "en" ? "Category" : "Categoria"}: {item.categorySnapshot || resolveCategoryFromMenuItem(menuItems, item.menuItemId) || (locale === "en" ? "uncategorized" : "sin categoria")}
          </p>
          {item.notes && <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">{locale === "en" ? "Note" : "Nota"}: {item.notes}</p>}
        </div>
        <p className="shrink-0 text-sm font-semibold text-[var(--text-strong)]">{formatPrice(item.lineTotal, locale)}</p>
      </div>
    </article>
  );
}

function StepLabel({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--text-strong)] text-xs font-semibold text-white">{step}</span>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{title}</p>
    </div>
  );
}

function ReplacementScopeTab({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-[16px] px-3 py-2 text-left text-sm font-semibold transition ${
        active
          ? "border border-[rgba(197,123,87,0.22)] bg-[rgba(197,123,87,0.1)] text-[var(--text-strong)]"
          : "border border-transparent text-[var(--text-soft)] hover:bg-[var(--surface-muted)]"
      }`}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      <span className="ml-2 rounded-full bg-[rgba(118,93,71,0.12)] px-2 py-0.5 text-xs">{count}</span>
    </button>
  );
}

function MetricChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[13px] bg-[var(--surface-base)] px-1.5 py-2 text-[10px] font-semibold text-[var(--text-soft)] sm:flex-row sm:gap-2 sm:rounded-full sm:px-3 sm:text-xs">
      {label}
      <span className="rounded-full bg-[rgba(118,93,71,0.14)] px-2 py-0.5 text-[10px] sm:text-xs">{value}</span>
    </span>
  );
}

function OrderBucketSection({
  emptyCopy,
  onSelectOrder,
  orders,
  selectedOrderId,
  title,
  tone,
}: {
  emptyCopy: string;
  onSelectOrder: (orderId: string) => void;
  orders: OrderSummary[];
  selectedOrderId: string;
  title: string;
  tone: PendingLane;
}) {
  const locale = activeOrdersLocale;
  const titlePalette = tone === "restaurant"
    ? "bg-[rgba(137,164,196,0.12)] text-[#4f6884]"
    : "bg-[rgba(197,123,87,0.16)] text-[var(--warning)]";

  return (
    <section className={`rounded-[22px] border px-3 py-3 ${
      tone === "restaurant"
        ? "border-[rgba(137,164,196,0.18)] bg-[rgba(220,231,244,0.54)]"
        : "border-[rgba(197,123,87,0.16)] bg-[rgba(237,228,220,0.72)]"
    }`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${titlePalette}`}>{title}</span>
        <span className="rounded-full bg-[rgba(118,93,71,0.12)] px-2 py-0.5 text-xs font-semibold text-[var(--text-soft)]">
          {orders.length}
        </span>
      </div>
      {orders.length === 0 ? (
        <p className="rounded-[16px] bg-[var(--surface-base)] px-3 py-4 text-sm text-[var(--text-soft)]">{emptyCopy}</p>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const active = order.id === selectedOrderId;
            return (
              <button
                className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${
                  active
                    ? "border-[rgba(137,164,196,0.34)] bg-[var(--surface-strong)]"
                    : "border-[rgba(118,93,71,0.1)] bg-[var(--surface-base)] hover:bg-[var(--surface-muted)]"
                }`}
                key={order.id}
                onClick={() => onSelectOrder(order.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <OrderStatusBadge locale={locale} status={order.status} />
                      {order.customerNotificationStatus === "failed" ? <NotificationBadge locale={locale} status="failed" /> : null}
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-[var(--text-strong)]">
                      {order.customerName?.trim() || order.customerPhone || (locale === "en" ? "Unnamed customer" : "Cliente sin nombre")}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-faint)]">{formatDateTime(order.createdAt, locale)}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                      Cuenta #{getOrderReceiptCode(order.id)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-[var(--text-strong)]">{formatPrice(order.total, locale)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SummaryRow({ emphasis = false, label, value }: { emphasis?: boolean; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className={`min-w-0 ${emphasis ? "text-sm font-semibold text-[var(--text-strong)]" : "text-sm text-[var(--text-soft)]"}`}>{label}</span>
      <span className={`min-w-0 break-words text-right ${emphasis ? "text-sm font-semibold text-[var(--text-strong)]" : "text-sm font-medium text-[var(--text-strong)]"}`}>{value}</span>
    </div>
  );
}

function ActionButton({
  active = false,
  icon: Icon,
  label,
  onClick,
  variant,
}: {
  active?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant: "primary" | "secondary" | "warning";
}) {
  const palette = {
    primary: "bg-[var(--text-strong)] text-white hover:bg-[#312923]",
    secondary: "border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] text-[var(--text-strong)] hover:bg-[var(--surface-muted)]",
    warning: "border border-[rgba(197,123,87,0.18)] bg-[rgba(197,123,87,0.08)] text-[var(--warning)] hover:bg-[rgba(197,123,87,0.12)]",
  }[variant];

  return (
    <button
      className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition sm:w-auto ${palette}`}
      disabled={active}
      onClick={onClick}
      type="button"
    >
      {active ? <Loader2 className="animate-spin" size={16} /> : <Icon size={16} />}
      {label}
    </button>
  );
}

function OrderProgressRail({
  fulfillmentType,
  locale,
  status,
}: {
  fulfillmentType: OrderSummary["fulfillmentType"];
  locale: "en" | "es";
  status: OrderStatus;
}) {
  const steps = [
    { id: "accepted", label: locale === "en" ? "Accepted" : "Aceptado" },
    { id: "preparing", label: locale === "en" ? "Preparing" : "Preparando" },
    { id: "on_the_way", label: fulfillmentType === "delivery" ? (locale === "en" ? "On the way" : "En camino") : (locale === "en" ? "Ready" : "Listo") },
  ] as const;
  const currentIndex = getConfirmedStageIndex(status);

  return (
    <div className="mt-4 rounded-[22px] border border-[rgba(79,122,97,0.18)] bg-[rgba(226,238,231,0.72)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-sm font-extrabold text-[var(--success)]">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--success)] text-white">
            <Check size={16} />
          </span>
          {getConfirmedProgressLabel({ status, fulfillmentType }, locale)}
        </div>
        <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--success)]">
          {locale === "en" ? "Confirmed status" : "Estado confirmado"}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {steps.map((step, index) => {
          const reached = index <= currentIndex;
          return (
            <div
              className={`rounded-2xl border px-3 py-2 text-xs font-bold ${
                reached
                  ? "border-[rgba(79,122,97,0.2)] bg-white text-[var(--success)]"
                  : "border-[rgba(118,93,71,0.08)] bg-[rgba(255,251,246,0.5)] text-[var(--text-faint)]"
              }`}
              key={step.id}
            >
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(79,122,97,0.12)] text-[11px]">
                {index + 1}
              </span>
              {step.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderStatusBadge({ locale, status }: { locale: "en" | "es"; status: OrderStatus }) {
  const palette = {
    new: "bg-[rgba(118,93,71,0.08)] text-[var(--text-soft)]",
    pending_restaurant_confirmation: "bg-[rgba(193,157,98,0.14)] text-[#8a6a3f]",
    needs_customer_replacement: "bg-[rgba(197,123,87,0.12)] text-[var(--warning)]",
    payment_pending_review: "bg-[rgba(97,135,158,0.12)] text-[#46697c]",
    accepted: "bg-[var(--success)] text-white shadow-[0_6px_18px_rgba(79,122,97,0.22)]",
    preparing: "bg-[rgba(132,111,164,0.12)] text-[#65567f]",
    on_the_way: "bg-[rgba(90,111,170,0.12)] text-[#4c5f8f]",
    delivered: "bg-[rgba(118,93,71,0.12)] text-[var(--text-soft)]",
    cancelled: "bg-[rgba(180,94,84,0.12)] text-[#914d47]",
  }[status];

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${palette}`}>
      {getOrderStatusLabel(status, locale)}
    </span>
  );
}

function NotificationBadge({ locale, status }: { locale: "en" | "es"; status: "failed" | "sent" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
        status === "failed"
          ? "bg-[rgba(197,123,87,0.12)] text-[var(--warning)]"
          : "bg-[rgba(79,122,97,0.12)] text-[var(--success)]"
      }`}
    >
      {status === "failed"
        ? (locale === "en" ? "WhatsApp failed" : "WhatsApp fallido")
        : (locale === "en" ? "WhatsApp sent" : "WhatsApp enviado")}
    </span>
  );
}

function InfoChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex w-full items-center gap-2 rounded-full bg-[var(--surface-base)] px-3 py-2 text-xs font-semibold text-[var(--text-soft)] ring-1 ring-[rgba(118,93,71,0.12)] sm:w-auto">
      <Icon size={14} />
      {label}
    </span>
  );
}

function LoadingBlock({ copy }: { copy: string }) {
  return (
    <div className="grid min-h-[380px] place-items-center px-5 py-10 sm:min-h-[620px]">
      <div className="inline-flex items-center gap-3 rounded-full bg-[rgba(248,241,232,0.72)] px-5 py-3 text-sm font-semibold text-[var(--text-soft)]">
        <Loader2 className="animate-spin" size={17} />
        {copy}
      </div>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="grid min-h-[380px] place-items-center px-5 py-10 sm:min-h-[620px]">
      <div className="max-w-md rounded-[24px] border border-[rgba(180,94,84,0.18)] bg-[rgba(190,110,95,0.08)] px-5 py-5 text-sm leading-7 text-[#8c4e47]">
        {message}
      </div>
    </div>
  );
}

function EmptyListState({ filter, locale }: { filter: OrdersFilter; locale: "en" | "es" }) {
  const copy = {
    pending: locale === "en" ? "There are no pending orders right now." : "No hay pedidos pendientes en este momento.",
    confirmed: locale === "en" ? "There are no confirmed orders in progress." : "No hay pedidos confirmados en curso.",
    closed: locale === "en" ? "There are no closed orders in this tenant yet." : "Todavia no hay pedidos cerrados en este tenant.",
    alerts: locale === "en" ? "There are no orders requiring attention." : "No hay pedidos que requieran atencion.",
  }[filter];

  return (
    <div className="grid min-h-[380px] place-items-center px-6 py-10 text-center">
      <div>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[rgba(118,93,71,0.08)] text-[var(--text-faint)]">
          <ClipboardList size={24} />
        </div>
        <p className="app-display mt-5 text-[2rem] leading-none text-[var(--text-strong)]">{locale === "en" ? "Empty queue" : "Bandeja vacia"}</p>
        <p className="mt-3 max-w-xs text-sm leading-7 text-[var(--text-soft)]">{copy}</p>
      </div>
    </div>
  );
}

function matchesFilter(order: OrderSummary, filter: OrdersFilter) {
  if (filter === "pending") {
    return pendingStatuses.includes(order.status);
  }

  if (filter === "confirmed") {
    return confirmedStatuses.includes(order.status);
  }

  if (filter === "alerts") {
    return isAlertOrder(order);
  }

  return closedStatuses.includes(order.status);
}

function isAlertOrder(order: OrderSummary) {
  return order.customerNotificationStatus === "failed"
    || order.status === "needs_customer_replacement"
    || order.status === "payment_pending_review";
}

function getFilterLabel(filter: OrdersFilter, locale: "en" | "es") {
  return getFilterTabs(locale).find((tab) => tab.id === filter)?.label ?? (locale === "en" ? "Orders" : "Pedidos");
}

function getFilterDescription(filter: OrdersFilter, locale: "en" | "es") {
  return getFilterTabs(locale).find((tab) => tab.id === filter)?.description ?? "";
}

function getFilterTabClasses(filter: OrdersFilter, active: boolean) {
  if (!active) {
    return "border-transparent text-[var(--text-soft)] hover:bg-[var(--surface-muted)]";
  }

  return {
    pending: "border-[rgba(137,164,196,0.22)] bg-[var(--surface-pending)] text-[var(--text-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]",
    confirmed: "border-[rgba(79,122,97,0.18)] bg-[var(--surface-confirmed)] text-[var(--text-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]",
    closed: "border-[rgba(118,93,71,0.16)] bg-[var(--surface-closed)] text-[var(--text-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]",
    alerts: "border-[rgba(197,123,87,0.2)] bg-[rgba(197,123,87,0.1)] text-[var(--warning)]",
  }[filter];
}

function getFilterCountClasses(filter: OrdersFilter, active: boolean) {
  if (!active) {
    return "bg-[rgba(118,93,71,0.08)] text-[var(--text-soft)]";
  }

  return {
    pending: "bg-[rgba(137,164,196,0.18)] text-[#4d6783]",
    confirmed: "bg-[rgba(79,122,97,0.14)] text-[var(--success)]",
    closed: "bg-[rgba(118,93,71,0.12)] text-[var(--text-soft)]",
    alerts: "bg-[rgba(197,123,87,0.14)] text-[var(--warning)]",
  }[filter];
}

function getOrderStatusLabel(status: OrderStatus, locale: "en" | "es") {
  return {
    new: locale === "en" ? "New" : "Nuevo",
    pending_restaurant_confirmation: locale === "en" ? "Restaurant pending" : "Pendiente restaurante",
    needs_customer_replacement: locale === "en" ? "Waiting on customer" : "Esperando cliente",
    payment_pending_review: locale === "en" ? "Payment pending" : "Pago pendiente",
    accepted: locale === "en" ? "Accepted" : "Aceptado",
    preparing: locale === "en" ? "Preparing" : "En preparacion",
    on_the_way: locale === "en" ? "On the way" : "En camino",
    delivered: locale === "en" ? "Delivered" : "Entregado",
    cancelled: locale === "en" ? "Cancelled" : "Cancelado",
  }[status];
}

function getConfirmedStageIndex(status: OrderStatus) {
  if (status === "on_the_way") return 2;
  if (status === "preparing" || status === "payment_pending_review") return 1;
  return 0;
}

function getConfirmedProgressLabel(order: Pick<OrderSummary, "status" | "fulfillmentType">, locale: "en" | "es") {
  if (order.status === "on_the_way") {
    return order.fulfillmentType === "delivery"
      ? (locale === "en" ? "Delivery in 30 min" : "Delivery 30 min")
      : (locale === "en" ? "Order ready for pickup" : "Pedido listo para recoger");
  }

  if (order.status === "accepted" || order.status === "preparing" || order.status === "payment_pending_review") {
    return locale === "en" ? "We are preparing your order" : "Estamos preparando tu pedido";
  }

  return "";
}
function getNotificationLabel(status: OrderDetail["customerNotificationStatus"] | undefined, locale: "en" | "es") {
  if (status === "failed") {
    return locale === "en" ? "failed" : "fallida";
  }

  if (status === "sent") {
    return locale === "en" ? "sent" : "enviada";
  }

  return locale === "en" ? "pending" : "pendiente";
}

function getPaymentProofStatusLabel(status: string | undefined, locale: "en" | "es") {
  if (status === "approved") return locale === "en" ? "Approved" : "Aprobado";
  if (status === "review_pending") return locale === "en" ? "Pending review" : "Pendiente de revision";
  if (status === "stored") return locale === "en" ? "Stored" : "Guardado";
  if (status === "received") return locale === "en" ? "Received" : "Recibido";
  if (status === "rejected") return locale === "en" ? "Rejected" : "Rechazado";
  return locale === "en" ? "No status" : "Sin estado";
}

function getDashboardErrorMessage(error: unknown, fallback: string, locale: "en" | "es") {
  if (error instanceof DashboardApiError) {
    if (error.backendError === "order_module_unavailable") {
      return locale === "en"
        ? "This tenant does not have the orders module available in the database yet."
        : "El tenant aun no tiene el modulo de ordenes disponible en base de datos.";
    }

    return error.backendError ? `${fallback} (${error.backendError})` : fallback;
  }

  if (error instanceof Error) {
    return `${fallback} (${error.message})`;
  }

  return fallback;
}

function getFulfillmentLabel(order: Pick<OrderSummary, "fulfillmentType" | "paymentMethod" | "scheduledFor" | "serviceTiming">, locale: "en" | "es") {
  const fulfillment = order.fulfillmentType === "delivery"
    ? (locale === "en" ? "Delivery" : "Domicilio")
    : locale === "en" ? "Pickup" : "Recoge en local";
  const payment = order.paymentMethod === "transfer"
    ? (locale === "en" ? "bank transfer" : "transferencia")
    : (locale === "en" ? "cash" : "efectivo");
  const serviceTiming = order.serviceTiming === "scheduled" && order.scheduledFor
    ? `${locale === "en" ? "scheduled" : "programado"} ${formatDateTime(order.scheduledFor, locale)}`
    : locale === "en" ? "as soon as possible" : "lo antes posible";
  return `${fulfillment} - ${payment} - ${serviceTiming}`;
}

function getOperationalFulfillmentLabel(
  order: Pick<OrderSummary, "fulfillmentType" | "paymentMethod" | "scheduledFor" | "serviceTiming">,
  locale: "en" | "es",
) {
  const fulfillment = order.fulfillmentType === "delivery"
    ? (locale === "en" ? "Delivery" : "Domicilio")
    : (locale === "en" ? "Pickup" : "Recoge en local");
  const payment = order.paymentMethod === "transfer"
    ? (locale === "en" ? "Bank transfer" : "Transferencia")
    : (locale === "en" ? "Cash" : "Efectivo");
  const timing = order.serviceTiming === "scheduled" && order.scheduledFor
    ? formatDateTime(order.scheduledFor, locale)
    : (locale === "en" ? "As soon as possible" : "Lo antes posible");

  return `${fulfillment} · ${payment} · ${timing}`;
}

function getOrderItemsSummary(items: OrderLineItem[] | undefined, locale: "en" | "es") {
  if (!items || items.length === 0) {
    return locale === "en" ? "Products available in order details" : "Productos disponibles en el detalle";
  }

  const visible = items.slice(0, 2).map((item) => `${item.quantity}x ${item.name}`);
  const remaining = items.length - visible.length;
  return remaining > 0
    ? `${visible.join(", ")} +${remaining}`
    : visible.join(", ");
}

function formatRelativeTime(value: string | undefined, locale: "en" | "es") {
  if (!value) return locale === "en" ? "just now" : "ahora";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return locale === "en" ? "just now" : "ahora";

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return locale === "en" ? "just now" : "ahora";
  if (elapsedMinutes < 60) return locale === "en" ? `${elapsedMinutes} min ago` : `hace ${elapsedMinutes} min`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return locale === "en" ? `${elapsedHours} h ago` : `hace ${elapsedHours} h`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return locale === "en" ? `${elapsedDays} d ago` : `hace ${elapsedDays} d`;
}

function formatPrice(value: number | undefined, locale: "en" | "es") {
  return formatDashboardPrice(locale, value);
}

function formatDateTime(value: string | undefined, locale: "en" | "es") {
  return formatDashboardDateTime(locale, value);
}

function formatFileSize(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveCategoryFromMenuItem(menuItems: MenuItem[], menuItemId?: string) {
  if (!menuItemId) return undefined;
  return menuItems.find((item) => item.id === menuItemId)?.product?.category;
}

function resolveCategoryFromProductId(menuItems: MenuItem[], productId?: string) {
  if (!productId) return undefined;
  return menuItems.find((item) => item.productId === productId || item.product?.id === productId)?.product?.category;
}

function resolveMenuItemCategory(item: MenuItem, menuItems: MenuItem[]) {
  return item.product?.category
    || resolveCategoryFromProductId(menuItems, item.productId ?? item.product?.id)
    || resolveCategoryFromMenuItem(menuItems, item.id);
}

function resolveOrderItemCategory(item: OrderLineItem, menuItems: MenuItem[]) {
  return item.categorySnapshot
    || resolveCategoryFromProductId(menuItems, item.productId)
    || resolveCategoryFromMenuItem(menuItems, item.menuItemId);
}

function resolveMenuItemPrice(item: MenuItem) {
  return item.priceOverride ?? item.product?.basePrice ?? 0;
}

function getMenuItemDisplayName(item: MenuItem) {
  return item.displayName || item.product?.name || "Producto sin nombre";
}

function getOrderItemKey(item: OrderLineItem, index: number) {
  return item.id ?? `${item.name}-${item.quantity}-${index}`;
}

function normalizeText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeCategoryKey(value?: string | null) {
  const normalized = normalizeText(value);
  if (normalized.length <= 4) return normalized;
  if (normalized.endsWith("ces")) return `${normalized.slice(0, -3)}z`;
  if (normalized.endsWith("s")) return normalized.slice(0, -1);
  return normalized;
}

function getOrderReceiptCode(orderId: string) {
  const compact = orderId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return compact.slice(-8) || orderId.slice(-8);
}
