import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem, OrderDetail, OrderLineItem, OrdersDashboardPayload, OrderStatus, OrderSummary } from "@42day/types";
import {
  acceptOrder,
  DashboardApiError,
  getOrder,
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

type OrdersViewProps = {
  tenantSlug: string;
  menuItems: MenuItem[];
  onNotify: (message: string) => void;
};

type OrdersFilter = "pending" | "confirmed" | "closed";
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

const filterTabs: OrdersFilterConfig[] = [
  { id: "pending", label: "Pedidos Pendientes", description: "Sin confirmar o esperando respuesta en WhatsApp." },
  { id: "confirmed", label: "Pedidos Confirmados", description: "En preparacion o listos para entrega/retiro." },
  { id: "closed", label: "Pedidos Cerrados", description: "Entregados o cancelados." },
];

const pendingStatuses: OrderStatus[] = ["new", "pending_restaurant_confirmation", "needs_customer_replacement"];
const confirmedStatuses: OrderStatus[] = ["accepted", "payment_pending_review", "preparing", "on_the_way"];
const closedStatuses: OrderStatus[] = ["delivered", "cancelled"];

export function OrdersView({ menuItems, onNotify, tenantSlug }: OrdersViewProps) {
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
        setOrdersError(getDashboardErrorMessage(error, "No se pudieron cargar los pedidos."));
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
        setDetailError(getDashboardErrorMessage(error, "No se pudo cargar el detalle del pedido."));
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
        setOrdersError(getDashboardErrorMessage(error, "No se pudieron cargar los pedidos."));
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

  const allOrders = payload?.orders ?? [];
  const counts = useMemo<Record<OrdersFilter, number>>(
    () => ({
      pending: allOrders.filter((order) => pendingStatuses.includes(order.status)).length,
      confirmed: allOrders.filter((order) => confirmedStatuses.includes(order.status)).length,
      closed: allOrders.filter((order) => closedStatuses.includes(order.status)).length,
    }),
    [allOrders],
  );

  const pendingConfirmationCount = useMemo(
    () => allOrders.filter((order) => order.status === "pending_restaurant_confirmation").length,
    [allOrders],
  );
  const pendingReplacementCount = useMemo(
    () => allOrders.filter((order) => order.status === "needs_customer_replacement").length,
    [allOrders],
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
    if (filter !== "pending") {
      return;
    }

    if (pendingLane === "restaurant" && pendingRestaurantOrders.length === 0 && pendingCustomerOrders.length > 0) {
      setPendingLane("customer");
      return;
    }

    if (pendingLane === "customer" && pendingCustomerOrders.length === 0 && pendingRestaurantOrders.length > 0) {
      setPendingLane("restaurant");
    }
  }, [filter, pendingCustomerOrders.length, pendingLane, pendingRestaurantOrders.length]);

  useEffect(() => {
    if (filteredOrders.length === 0) {
      setSelectedOrderId("");
      setSelectedOrder(null);
      setDetailError("");
      return;
    }

    if (!filteredOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0]?.id ?? "");
    }
  }, [filteredOrders, selectedOrderId]);

  useEffect(() => {
    if (filter !== "pending" || pendingLaneOrders.length === 0) {
      return;
    }

    if (!pendingLaneOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(pendingLaneOrders[0]?.id ?? "");
    }
  }, [filter, pendingLaneOrders, selectedOrderId]);

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
      onNotify("Pedido confirmado y cliente notificado.");
      await refreshAfterMutation(orderId);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, "No se pudo confirmar el pedido."));
    } finally {
      setActionKey("");
    }
  }

  async function handleRetry(orderId: string, status: OrderStatus) {
    const type = status === "needs_customer_replacement" ? "out_of_stock" : "accepted";
    setActionKey(`retry:${orderId}`);
    try {
      await retryOrderCustomerNotification(tenantSlug, orderId, type);
      onNotify("Notificacion reenviada al cliente.");
      await refreshAfterMutation(orderId);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, "No se pudo reintentar la notificacion."));
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
      onNotify("Cliente notificado por agotado.");
      await refreshAfterMutation(orderId);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, "No se pudo notificar el agotado."));
    } finally {
      setActionKey("");
    }
  }

  async function handleAdvanceConfirmed(order: OrderDetail) {
    const nextStatus: OrderStatus = "on_the_way";
    const successMessage = order.fulfillmentType === "delivery"
      ? "Pedido marcado como delivery 30 min."
      : "Pedido marcado como listo para recoger.";

    setActionKey(`status:${order.id}:${nextStatus}`);
    try {
      await updateOrderStatus(tenantSlug, order.id, { status: nextStatus });
      onNotify(successMessage);
      await refreshAfterMutation(order.id);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, "No se pudo avanzar el estado del pedido."));
    } finally {
      setActionKey("");
    }
  }

  async function handleFinalizeOrder(order: OrderDetail) {
    setActionKey(`status:${order.id}:delivered`);
    try {
      await updateOrderStatus(tenantSlug, order.id, { status: "delivered" });
      onNotify("Pedido finalizado y movido a cerrados.");
      await refreshAfterMutation(order.id);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, "No se pudo finalizar el pedido."));
    } finally {
      setActionKey("");
    }
  }

  async function handleCancelOrder(order: OrderDetail) {
    setActionKey(`status:${order.id}:cancelled`);
    try {
      await updateOrderStatus(tenantSlug, order.id, { status: "cancelled" });
      onNotify("Pedido cancelado.");
      await refreshAfterMutation(order.id);
    } catch (error) {
      onNotify(getDashboardErrorMessage(error, "No se pudo cancelar el pedido."));
    } finally {
      setActionKey("");
    }
  }

  return (
    <section className="space-y-6">
      <div className="app-panel rounded-[24px] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Pedidos</p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">Bandeja operativa</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MetricChip label="Pendientes" value={counts.pending} />
            <MetricChip label="Confirmados" value={counts.confirmed} />
            <MetricChip label="Cerrados" value={counts.closed} />
            <MetricChip label="Alertas" value={payload?.counts.openAlerts ?? 0} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:justify-between">
        <div className="app-panel flex flex-1 flex-wrap gap-2 rounded-[24px] p-2">
          {filterTabs.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                className={`min-h-[78px] flex-1 rounded-[18px] border px-4 py-3 text-left transition ${
                  getFilterTabClasses(tab.id, active)
                }`}
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{tab.label}</span>
                  <span className={`inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${getFilterCountClasses(tab.id, active)}`}>
                    {counts[tab.id]}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 opacity-80">{tab.description}</p>
              </button>
            );
          })}
        </div>

        <button
          className="inline-flex h-[78px] items-center justify-center gap-2 rounded-2xl border border-[rgba(255,242,227,0.12)] bg-[var(--surface-dark-button)] px-4 text-sm font-semibold text-[var(--text-on-dark)] transition hover:bg-[rgba(255,248,240,0.12)] disabled:cursor-not-allowed disabled:opacity-60 lg:min-w-[168px]"
          disabled={ordersRefreshing}
          onClick={() => void loadOrders("refresh")}
          type="button"
        >
          {ordersRefreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
          Actualizar
        </button>
      </div>

      {filter === "pending" && (pendingConfirmationCount > 0 || pendingReplacementCount > 0) ? (
        <div className="rounded-[20px] border border-[rgba(197,123,87,0.22)] bg-[rgba(197,123,87,0.12)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--warning)]">
            <AlertCircle size={16} />
            Nuevo movimiento de pedidos
          </div>
          <p className="mt-1 text-sm text-[var(--warning)]">
            {pendingConfirmationCount} por confirmar - {pendingReplacementCount} esperando respuesta en WhatsApp
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
        <div className="app-panel rounded-[28px] overflow-hidden">
          <div className="border-b border-[rgba(118,93,71,0.12)] px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{getFilterLabel(filter)}</p>
                <p className="mt-2 text-sm text-[var(--text-soft)]">{getFilterDescription(filter)}</p>
              </div>
              <span className="rounded-full bg-[rgba(118,93,71,0.08)] px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)]">
                {filteredOrders.length}
              </span>
            </div>
          </div>

          {ordersLoading ? (
            <LoadingBlock copy="Cargando pedidos..." />
          ) : ordersError ? (
            <ErrorBlock message={ordersError} />
          ) : filteredOrders.length === 0 ? (
            <EmptyListState filter={filter} />
          ) : filter === "pending" ? (
            <>
              <div className="border-b border-[rgba(118,93,71,0.12)] px-4 py-4">
                <div className="grid grid-cols-2 gap-2 rounded-[20px] bg-[var(--surface-base)] p-2">
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
                      <span className="text-sm font-semibold">Confirma restaurante</span>
                      <span className="rounded-full bg-[rgba(137,164,196,0.18)] px-2 py-0.5 text-xs font-semibold text-[#4d6783]">
                        {pendingRestaurantOrders.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-soft)]">Pedidos nuevos listos para decision.</p>
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
                      <span className="text-sm font-semibold">Confirma cliente</span>
                      <span className="rounded-full bg-[rgba(197,123,87,0.14)] px-2 py-0.5 text-xs font-semibold text-[var(--warning)]">
                        {pendingCustomerOrders.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-soft)]">Cambios o seleccion pendiente en WhatsApp.</p>
                  </button>
                </div>
              </div>
              <div className="app-scrollbar max-h-[760px] overflow-y-auto px-4 py-4">
                <OrderBucketSection
                  emptyCopy={pendingLane === "restaurant"
                    ? "No hay pedidos esperando confirmacion del restaurante."
                    : "No hay pedidos esperando respuesta del cliente."}
                  onSelectOrder={setSelectedOrderId}
                  orders={pendingLaneOrders}
                  selectedOrderId={selectedOrderId}
                  title={pendingLane === "restaurant" ? "Espera restaurante" : "Espera cliente"}
                  tone={pendingLane}
                />
              </div>
            </>
          ) : (
            <div className="app-scrollbar max-h-[860px] space-y-3 overflow-y-auto px-4 py-4">
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
                          <OrderStatusBadge status={order.status} />
                          {order.customerNotificationStatus === "failed" && <NotificationBadge status="failed" />}
                        </div>
                        <p className="mt-3 truncate text-sm font-semibold text-[var(--text-strong)]">
                          {order.customerName?.trim() || order.customerPhone || "Cliente sin nombre"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[var(--text-faint)]">
                          {formatDateTime(order.createdAt)}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">{getFulfillmentLabel(order)}</p>
                        {filter === "confirmed" ? (
                          <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                            acceptedStage
                              ? "bg-[var(--success)] text-white shadow-[0_6px_18px_rgba(79,122,97,0.22)]"
                              : "bg-[rgba(79,122,97,0.12)] text-[var(--success)]"
                          }`}>
                            {getConfirmedProgressLabel(order)}
                          </p>
                        ) : null}
                        {filter === "closed" ? (
                          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                            Cuenta #{getOrderReceiptCode(order.id)}
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm text-[var(--text-soft)]">{order.customerPhone || "Sin telefono"}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <p className="text-sm font-semibold text-[var(--text-strong)]">{formatPrice(order.total)}</p>
                        <ChevronRight className={active ? "text-[var(--warning)]" : "text-[var(--text-faint)]"} size={18} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="app-panel rounded-[28px] overflow-hidden">
          {!selectedOrderId ? (
            <div className="grid min-h-[620px] place-items-center px-6 py-10 text-center">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[rgba(118,93,71,0.08)] text-[var(--text-faint)]">
                  <ClipboardList size={24} />
                </div>
                <p className="app-display mt-5 text-[2.2rem] leading-none text-[var(--text-strong)]">Sin pedido seleccionado</p>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-[var(--text-soft)]">
                  Selecciona un pedido de la lista para revisar el detalle, confirmar o reportar un agotado.
                </p>
              </div>
            </div>
          ) : detailLoading ? (
            <LoadingBlock copy="Cargando detalle del pedido..." />
          ) : detailError ? (
            <ErrorBlock message={detailError} />
          ) : selectedOrder ? (
            <OrderDetailPanel
              actionKey={actionKey}
              menuItems={menuItems}
              onAccept={() => void handleAccept(selectedOrder.id)}
              onAdvanceConfirmed={() => void handleAdvanceConfirmed(selectedOrder)}
              onCancel={() => void handleCancelOrder(selectedOrder)}
              onFinalize={() => void handleFinalizeOrder(selectedOrder)}
              onOpenRejectModal={() => setModalOrder(selectedOrder)}
              onRetry={() => void handleRetry(selectedOrder.id, selectedOrder.status)}
              order={selectedOrder}
              selectedSummary={selectedSummary}
            />
          ) : (
            <ErrorBlock message="No se pudo resolver el detalle del pedido seleccionado." />
          )}
        </div>
      </div>

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

function OrderDetailPanel({
  actionKey,
  menuItems,
  onAccept,
  onAdvanceConfirmed,
  onCancel,
  onFinalize,
  onOpenRejectModal,
  onRetry,
  order,
  selectedSummary,
}: {
  actionKey: string;
  menuItems: MenuItem[];
  onAccept: () => void;
  onAdvanceConfirmed: () => void;
  onCancel: () => void;
  onFinalize: () => void;
  onOpenRejectModal: () => void;
  onRetry: () => void;
  order: OrderDetail;
  selectedSummary?: OrderSummary;
}) {
  const notificationFailed = order.customerNotificationStatus === "failed";
  const canAccept = order.status === "pending_restaurant_confirmation";
  const canReject = order.status === "pending_restaurant_confirmation";
  const canRetry = notificationFailed && (order.status === "accepted" || order.status === "needs_customer_replacement");
  const canAdvanceConfirmed = ["accepted", "payment_pending_review", "preparing"].includes(order.status);
  const canFinalize = order.status === "on_the_way";
  const canCancel = !closedStatuses.includes(order.status);
  const replacementOptions = order.restaurantReviewMetadata?.replacementMenuItems ?? [];
  const unavailableItems = order.restaurantReviewMetadata?.unavailableItems ?? [];
  const advanceLabel = order.fulfillmentType === "delivery" ? "Marcar delivery 30 min" : "Marcar listo para recoger";

  return (
    <div className="flex min-h-[620px] flex-col">
      <div className="border-b border-[rgba(118,93,71,0.12)] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={order.status} />
              {notificationFailed && <NotificationBadge status="failed" />}
              {selectedSummary?.customerNotificationStatus === "sent" && <NotificationBadge status="sent" />}
            </div>
            <h3 className="app-display mt-4 text-[2.6rem] leading-none text-[var(--text-strong)]">
              {order.customerName?.trim() || order.customerPhone || "Pedido sin cliente visible"}
            </h3>
            <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">
              {order.customerPhone || "Sin telefono"} - {formatDateTime(order.createdAt)}
            </p>
            <p className="mt-1 text-sm leading-7 text-[var(--text-soft)]">{getFulfillmentLabel(order)}</p>
            {confirmedStatuses.includes(order.status) ? (
              <OrderProgressRail fulfillmentType={order.fulfillmentType} status={order.status} />
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {canAccept && (
              <ActionButton
                active={actionKey === `accept:${order.id}`}
                icon={Check}
                label={actionKey === `accept:${order.id}` ? "Confirmando..." : "Confirmar pedido"}
                onClick={onAccept}
                variant="primary"
              />
            )}
            {canReject && (
              <ActionButton
                icon={MessageSquareWarning}
                label="Reportar agotado"
                onClick={onOpenRejectModal}
                variant="secondary"
              />
            )}
            {canRetry && (
              <ActionButton
                active={actionKey === `retry:${order.id}`}
                icon={RefreshCcw}
                label={actionKey === `retry:${order.id}` ? "Reenviando..." : "Reenviar WhatsApp"}
                onClick={onRetry}
                variant="warning"
              />
            )}
            {canAdvanceConfirmed && (
              <ActionButton
                active={actionKey === `status:${order.id}:on_the_way`}
                icon={Check}
                label={actionKey === `status:${order.id}:on_the_way` ? "Actualizando..." : advanceLabel}
                onClick={onAdvanceConfirmed}
                variant="primary"
              />
            )}
            {canFinalize && (
              <ActionButton
                active={actionKey === `status:${order.id}:delivered`}
                icon={Check}
                label={actionKey === `status:${order.id}:delivered` ? "Finalizando..." : "Finalizar pedido"}
                onClick={onFinalize}
                variant="primary"
              />
            )}
            {canCancel && !canAccept && (
              <ActionButton
                active={actionKey === `status:${order.id}:cancelled`}
                icon={X}
                label={actionKey === `status:${order.id}:cancelled` ? "Cancelando..." : "Cancelar pedido"}
                onClick={onCancel}
                variant="warning"
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="divide-y divide-[rgba(118,93,71,0.12)]">
          <section className="px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <InfoChip icon={order.fulfillmentType === "delivery" ? Truck : Store} label={order.fulfillmentType === "delivery" ? "Delivery" : "Recoge en local"} />
              <InfoChip icon={ClipboardList} label={order.paymentMethod === "transfer" ? "Transferencia" : "Efectivo"} />
            </div>
            {order.deliveryAddress && (
              <p className="mt-5 text-sm leading-7 text-[var(--text-soft)]">
                <span className="font-semibold text-[var(--text-strong)]">Direccion:</span> {order.deliveryAddress}
              </p>
            )}
            {order.restaurantReviewNote && (
              <p className="mt-4 text-sm leading-7 text-[var(--text-soft)]">
                <span className="font-semibold text-[var(--text-strong)]">Nota interna:</span> {order.restaurantReviewNote}
              </p>
            )}
            {notificationFailed && order.customerNotificationError && (
              <p className="mt-4 rounded-[22px] border border-[rgba(197,123,87,0.18)] bg-[rgba(197,123,87,0.08)] px-4 py-3 text-sm font-medium text-[var(--warning)]">
                Error de envio al cliente: {order.customerNotificationError}
              </p>
            )}
          </section>

          <section className="px-5 py-5 sm:px-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">Items del pedido</h4>
              <p className="text-xs text-[var(--text-faint)]">{order.items.length} productos</p>
            </div>
            <div className="space-y-3">
              {order.items.map((item, index) => (
                <OrderItemCard item={item} key={getOrderItemKey(item, index)} menuItems={menuItems} />
              ))}
            </div>
          </section>

          {order.status === "needs_customer_replacement" && (
            <section className="px-5 py-5 sm:px-6">
              <div className="rounded-[24px] border border-[rgba(197,123,87,0.18)] bg-[rgba(197,123,87,0.08)] p-5">
                <div className="flex items-center gap-2 text-[var(--warning)]">
                  <AlertCircle size={17} />
                  <h4 className="text-sm font-semibold uppercase tracking-[0.12em]">Esperando decision del cliente</h4>
                </div>
                {unavailableItems.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {unavailableItems.map((item) => (
                      <p className="text-sm leading-6 text-[var(--warning)]" key={item.orderItemId}>
                        Agotado: <span className="font-semibold">{item.name}</span> - categoria {item.category || "sin categoria"}
                      </p>
                    ))}
                  </div>
                )}
                {replacementOptions.length > 0 && (
                  <div className="mt-5 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--warning)]">Opciones enviadas</p>
                    {replacementOptions.map((option, index) => (
                      <div className="flex items-center justify-between rounded-[18px] bg-white/75 px-3 py-3 text-sm text-[var(--text-strong)]" key={option.menuItemId}>
                        <span>{index + 1}. {option.name}</span>
                        <span className="font-semibold">{formatPrice(option.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="border-t border-[rgba(118,93,71,0.12)] bg-[var(--panel-strong)] px-5 py-5 xl:border-l xl:border-t-0 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Cuenta y factura</p>
          <div className="mt-4 rounded-[18px] bg-[var(--surface-base)] px-4 py-3">
            <SummaryRow label="Factura" value={`#${getOrderReceiptCode(order.id)}`} />
          </div>
          <div className="mt-4 space-y-3">
            <SummaryRow label="Subtotal" value={formatPrice(order.subtotal)} />
            <SummaryRow label="Domicilio" value={formatPrice(order.deliveryFee)} />
            <SummaryRow label="Descuento" value={formatPrice(order.discountTotal)} />
          </div>
          <div className="my-4 border-t border-[rgba(118,93,71,0.12)]" />
          <SummaryRow emphasis label="Total" value={formatPrice(order.total)} />
          <div className="my-4 border-t border-[rgba(118,93,71,0.12)]" />
          <div className="space-y-3">
            <SummaryRow label="Estado" value={getOrderStatusLabel(order.status)} />
            <SummaryRow label="Actualizado" value={formatDateTime(order.updatedAt)} />
            <SummaryRow label="Notificacion cliente" value={getNotificationLabel(order.customerNotificationStatus)} />
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

    const category = selectedOrderItem.categorySnapshot || resolveCategoryFromMenuItem(menuItems, selectedOrderItem.menuItemId);
    const normalizedCategory = normalizeText(category);

    const activeCandidates = menuItems
      .filter((item) => item.isAvailable)
      .filter((item) => item.product?.isActive !== false)
      .filter((item) => item.id !== selectedOrderItem.menuItemId)
      .sort((left, right) => left.sortOrder - right.sortOrder);

    return {
      same: activeCandidates
        .filter((item) => normalizeText(resolveCategoryFromMenuItem(menuItems, item.id) || item.product?.category) === normalizedCategory)
        .slice(0, 8),
      other: activeCandidates
        .filter((item) => normalizeText(resolveCategoryFromMenuItem(menuItems, item.id) || item.product?.category) !== normalizedCategory)
        .slice(0, 16),
    };
  }, [menuItems, selectedOrderItem]);

  const replacementSuggestions = replacementScope === "same" ? replacementPools.same : replacementPools.other;

  useEffect(() => {
    setReplacementScope("same");
    setSelectedReplacementIds(replacementPools.same.map((item) => item.id));
  }, [replacementPools.same]);

  const categoryLabel = selectedOrderItem?.categorySnapshot
    || resolveCategoryFromMenuItem(menuItems, selectedOrderItem?.menuItemId)
    || "sin categoria";

  const canSubmit = Boolean(selectedOrderItemId);

  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-[rgba(14,11,9,0.55)] p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="app-panel reveal-up flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] sm:max-w-3xl sm:rounded-[30px]">
        <div className="flex items-start justify-between border-b border-[rgba(118,93,71,0.12)] px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Agotados</p>
            <h3 className="app-display mt-2 text-[2.2rem] leading-none text-[var(--text-strong)]">Reportar agotado</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
              El cliente recibira alternativas activas. Priorizamos la misma categoria y puedes abrir otras categorias si hace falta.
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

        <div className="app-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          <section className="rounded-[24px] bg-[rgba(248,241,232,0.58)] p-4">
            <StepLabel step={1} title="Item agotado" />
            <div className="mt-4 space-y-2">
              {order.items.map((item, index) => {
                const itemId = item.id ?? "";
                const active = itemId === selectedOrderItemId;
                return (
                  <button
                    className={`flex w-full items-center justify-between rounded-[20px] border px-4 py-3 text-left transition ${
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
                        {item.categorySnapshot || resolveCategoryFromMenuItem(menuItems, item.menuItemId) || "sin categoria"}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold">{formatPrice(item.lineTotal)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[24px] bg-[rgba(248,241,232,0.58)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <StepLabel step={2} title="Alternativas para el cliente" />
                <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">Categoria usada: {categoryLabel}</p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-soft)]">
                <input
                  checked={markMenuItemUnavailable}
                  className="h-4 w-4 rounded border-[rgba(118,93,71,0.32)]"
                  onChange={(event) => setMarkMenuItemUnavailable(event.target.checked)}
                  type="checkbox"
                />
                Marcar no disponible en menu
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-[20px] bg-[var(--surface-base)] p-2">
              <ReplacementScopeTab
                active={replacementScope === "same"}
                count={replacementPools.same.length}
                label="Misma categoria"
                onClick={() => setReplacementScope("same")}
              />
              <ReplacementScopeTab
                active={replacementScope === "other"}
                count={replacementPools.other.length}
                label="Otras categorias"
                onClick={() => setReplacementScope("other")}
              />
            </div>

            {replacementSuggestions.length === 0 ? (
              <div className="mt-4 rounded-[20px] border border-[rgba(197,123,87,0.18)] bg-[rgba(197,123,87,0.08)] px-4 py-3 text-sm leading-6 text-[var(--warning)]">
                {replacementScope === "same"
                  ? "No hay productos activos en esta categoria. Abre otras categorias para recomendar otra opcion del menu."
                  : "No hay otros productos activos disponibles para recomendar."}
              </div>
            ) : (
              <div className="app-scrollbar mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                {replacementSuggestions.map((item) => {
                  const checked = selectedReplacementIds.includes(item.id);
                  return (
                    <label
                      className="flex items-start justify-between gap-3 rounded-[20px] border border-[rgba(118,93,71,0.1)] bg-white/80 px-4 py-3 text-sm text-[var(--text-strong)]"
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
                      <span className="shrink-0 font-semibold">{formatPrice(resolveMenuItemPrice(item))}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-[24px] bg-[rgba(248,241,232,0.58)] p-4">
            <StepLabel step={3} title="Nota interna" />
            <textarea
              className="mt-4 min-h-28 w-full rounded-[20px] border border-[rgba(118,93,71,0.12)] bg-white/80 px-4 py-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:bg-white focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ej. Sin Coca-Cola, se ofrecen otras bebidas frias."
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
            Cancelar
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
            {submitting ? "Enviando..." : "Enviar por WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderItemCard({ item, menuItems }: { item: OrderLineItem; menuItems: MenuItem[] }) {
  return (
    <article className="rounded-[22px] border border-[rgba(118,93,71,0.1)] bg-[rgba(255,251,246,0.86)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-strong)]">
            {item.quantity} x {item.name}
          </p>
          <p className="mt-1 text-xs text-[var(--text-faint)]">
            Categoria: {item.categorySnapshot || resolveCategoryFromMenuItem(menuItems, item.menuItemId) || "sin categoria"}
          </p>
          {item.notes && <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">Nota: {item.notes}</p>}
        </div>
        <p className="shrink-0 text-sm font-semibold text-[var(--text-strong)]">{formatPrice(item.lineTotal)}</p>
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
    <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-base)] px-3 py-2 text-xs font-semibold text-[var(--text-soft)]">
      {label}
      <span className="rounded-full bg-[rgba(118,93,71,0.14)] px-2 py-0.5 text-xs">{value}</span>
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
  const titlePalette = tone === "restaurant"
    ? "bg-[rgba(137,164,196,0.12)] text-[#4f6884]"
    : "bg-[rgba(197,123,87,0.16)] text-[var(--warning)]";

  return (
    <section className={`rounded-[22px] border px-3 py-3 ${
      tone === "restaurant"
        ? "border-[rgba(137,164,196,0.18)] bg-[rgba(220,231,244,0.54)]"
        : "border-[rgba(197,123,87,0.16)] bg-[rgba(237,228,220,0.72)]"
    }`}>
      <div className="mb-3 flex items-center justify-between gap-2">
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
                      <OrderStatusBadge status={order.status} />
                      {order.customerNotificationStatus === "failed" ? <NotificationBadge status="failed" /> : null}
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-[var(--text-strong)]">
                      {order.customerName?.trim() || order.customerPhone || "Cliente sin nombre"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-faint)]">{formatDateTime(order.createdAt)}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                      Cuenta #{getOrderReceiptCode(order.id)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-[var(--text-strong)]">{formatPrice(order.total)}</p>
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
    <div className="flex items-center justify-between gap-3">
      <span className={emphasis ? "text-sm font-semibold text-[var(--text-strong)]" : "text-sm text-[var(--text-soft)]"}>{label}</span>
      <span className={emphasis ? "text-sm font-semibold text-[var(--text-strong)]" : "text-sm font-medium text-[var(--text-strong)]"}>{value}</span>
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
      className={`inline-flex h-12 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${palette}`}
      disabled={active}
      onClick={onClick}
      type="button"
    >
      {active ? <Loader2 className="animate-spin" size={16} /> : <Icon size={16} />}
      {label}
    </button>
  );
}

function OrderProgressRail({ fulfillmentType, status }: { fulfillmentType: OrderSummary["fulfillmentType"]; status: OrderStatus }) {
  const steps = [
    { id: "accepted", label: "Aceptado" },
    { id: "preparing", label: "Preparando" },
    { id: "on_the_way", label: fulfillmentType === "delivery" ? "En camino" : "Listo" },
  ] as const;
  const currentIndex = getConfirmedStageIndex(status);

  return (
    <div className="mt-4 rounded-[22px] border border-[rgba(79,122,97,0.18)] bg-[rgba(226,238,231,0.72)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-sm font-extrabold text-[var(--success)]">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--success)] text-white">
            <Check size={16} />
          </span>
          {getConfirmedProgressLabel({ status, fulfillmentType })}
        </div>
        <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--success)]">
          Estado confirmado
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

function OrderStatusBadge({ status }: { status: OrderStatus }) {
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
      {getOrderStatusLabel(status)}
    </span>
  );
}

function NotificationBadge({ status }: { status: "failed" | "sent" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
        status === "failed"
          ? "bg-[rgba(197,123,87,0.12)] text-[var(--warning)]"
          : "bg-[rgba(79,122,97,0.12)] text-[var(--success)]"
      }`}
    >
      {status === "failed" ? "WhatsApp fallido" : "WhatsApp enviado"}
    </span>
  );
}

function InfoChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-base)] px-3 py-2 text-xs font-semibold text-[var(--text-soft)] ring-1 ring-[rgba(118,93,71,0.12)]">
      <Icon size={14} />
      {label}
    </span>
  );
}

function LoadingBlock({ copy }: { copy: string }) {
  return (
    <div className="grid min-h-[620px] place-items-center px-6 py-10">
      <div className="inline-flex items-center gap-3 rounded-full bg-[rgba(248,241,232,0.72)] px-5 py-3 text-sm font-semibold text-[var(--text-soft)]">
        <Loader2 className="animate-spin" size={17} />
        {copy}
      </div>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="grid min-h-[620px] place-items-center px-6 py-10">
      <div className="max-w-md rounded-[24px] border border-[rgba(180,94,84,0.18)] bg-[rgba(190,110,95,0.08)] px-5 py-5 text-sm leading-7 text-[#8c4e47]">
        {message}
      </div>
    </div>
  );
}

function EmptyListState({ filter }: { filter: OrdersFilter }) {
  const copy = {
    pending: "No hay pedidos pendientes en este momento.",
    confirmed: "No hay pedidos confirmados en curso.",
    closed: "Todavia no hay pedidos cerrados en este tenant.",
  }[filter];

  return (
    <div className="grid min-h-[380px] place-items-center px-6 py-10 text-center">
      <div>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[rgba(118,93,71,0.08)] text-[var(--text-faint)]">
          <ClipboardList size={24} />
        </div>
        <p className="app-display mt-5 text-[2rem] leading-none text-[var(--text-strong)]">Bandeja vacia</p>
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

  return closedStatuses.includes(order.status);
}

function getFilterLabel(filter: OrdersFilter) {
  return filterTabs.find((tab) => tab.id === filter)?.label ?? "Pedidos";
}

function getFilterDescription(filter: OrdersFilter) {
  return filterTabs.find((tab) => tab.id === filter)?.description ?? "";
}

function getFilterTabClasses(filter: OrdersFilter, active: boolean) {
  if (!active) {
    return "border-transparent text-[var(--text-soft)] hover:bg-[var(--surface-muted)]";
  }

  return {
    pending: "border-[rgba(137,164,196,0.22)] bg-[var(--surface-pending)] text-[var(--text-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]",
    confirmed: "border-[rgba(79,122,97,0.18)] bg-[var(--surface-confirmed)] text-[var(--text-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]",
    closed: "border-[rgba(118,93,71,0.16)] bg-[var(--surface-closed)] text-[var(--text-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]",
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
  }[filter];
}

function getOrderStatusLabel(status: OrderStatus) {
  return {
    new: "Nuevo",
    pending_restaurant_confirmation: "Pendiente restaurante",
    needs_customer_replacement: "Esperando cliente",
    payment_pending_review: "Pago pendiente",
    accepted: "Aceptado",
    preparing: "En preparacion",
    on_the_way: "En camino",
    delivered: "Entregado",
    cancelled: "Cancelado",
  }[status];
}

function getConfirmedStageIndex(status: OrderStatus) {
  if (status === "on_the_way") return 2;
  if (status === "preparing" || status === "payment_pending_review") return 1;
  return 0;
}

function getConfirmedProgressLabel(order: Pick<OrderSummary, "status" | "fulfillmentType">) {
  if (order.status === "on_the_way") {
    return order.fulfillmentType === "delivery" ? "Delivery 30 min" : "Pedido listo para recoger";
  }

  if (order.status === "accepted" || order.status === "preparing" || order.status === "payment_pending_review") {
    return "Estamos preparando tu pedido";
  }

  return "";
}

function getNotificationLabel(status?: OrderDetail["customerNotificationStatus"]) {
  if (status === "failed") {
    return "fallida";
  }

  if (status === "sent") {
    return "enviada";
  }

  return "pendiente";
}

function getDashboardErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DashboardApiError) {
    if (error.backendError === "order_module_unavailable") {
      return "El tenant aun no tiene el modulo de ordenes disponible en base de datos.";
    }

    return error.backendError ? `${fallback} (${error.backendError})` : fallback;
  }

  if (error instanceof Error) {
    return `${fallback} (${error.message})`;
  }

  return fallback;
}

function getFulfillmentLabel(order: Pick<OrderSummary, "fulfillmentType" | "paymentMethod" | "scheduledFor" | "serviceTiming">) {
  const fulfillment = order.fulfillmentType === "delivery" ? "Delivery" : "Recoge en local";
  const payment = order.paymentMethod === "transfer" ? "transferencia" : "efectivo";
  const serviceTiming = order.serviceTiming === "scheduled" && order.scheduledFor
    ? `programado ${formatDateTime(order.scheduledFor)}`
    : "lo antes posible";
  return `${fulfillment} - ${payment} - ${serviceTiming}`;
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

function resolveCategoryFromMenuItem(menuItems: MenuItem[], menuItemId?: string) {
  if (!menuItemId) return undefined;
  return menuItems.find((item) => item.id === menuItemId)?.product?.category;
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

function getOrderReceiptCode(orderId: string) {
  const compact = orderId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return compact.slice(-8) || orderId.slice(-8);
}
