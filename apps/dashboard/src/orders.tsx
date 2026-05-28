import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem, OrderDetail, OrderLineItem, OrderStatus, OrderSummary, OrdersDashboardPayload } from "@42day/types";
import {
  acceptOrder,
  DashboardApiError,
  getOrder,
  listOrders,
  rejectOrderOutOfStock,
  retryOrderCustomerNotification,
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

type OrdersViewProps = {
  tenantSlug: string;
  menuItems: MenuItem[];
  onNotify: (message: string) => void;
};

type OrdersFilter = "pending" | "replacement" | "accepted" | "history";

type OrdersFilterConfig = {
  id: OrdersFilter;
  label: string;
  description: string;
};

const filterTabs: OrdersFilterConfig[] = [
  { id: "pending", label: "Pendientes", description: "Esperan confirmacion del restaurante." },
  { id: "replacement", label: "Esperando cliente", description: "Agotados enviados al cliente por WhatsApp." },
  { id: "accepted", label: "Aceptados", description: "Pedidos en curso despues de la confirmacion." },
  { id: "history", label: "Historial", description: "Pedidos cerrados o cancelados." },
];

const acceptedStatuses: OrderStatus[] = ["accepted", "payment_pending_review", "preparing", "on_the_way"];
const historyStatuses: OrderStatus[] = ["delivered", "cancelled"];

export function OrdersView({ menuItems, onNotify, tenantSlug }: OrdersViewProps) {
  const [filter, setFilter] = useState<OrdersFilter>("pending");
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
  const counts = useMemo(
    () => ({
      pending: allOrders.filter((order) => order.status === "pending_restaurant_confirmation").length,
      replacement: allOrders.filter((order) => order.status === "needs_customer_replacement").length,
      accepted: allOrders.filter((order) => acceptedStatuses.includes(order.status)).length,
      history: allOrders.filter((order) => historyStatuses.includes(order.status)).length,
    }),
    [allOrders],
  );

  const filteredOrders = useMemo(() => {
    return allOrders.filter((order) => matchesFilter(order, filter));
  }, [allOrders, filter]);

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

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">Pedidos</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Confirma pedidos, gestiona agotados y sigue las respuestas del cliente desde una sola bandeja.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <MetricCard icon={ClipboardList} label="Pendientes" value={counts.pending} />
          <MetricCard icon={MessageSquareWarning} label="Esperando cliente" value={counts.replacement} />
          <MetricCard icon={Check} label="Activos" value={counts.accepted} />
          <MetricCard icon={RefreshCcw} label="Abiertos totales" value={payload?.counts.openAlerts ?? 0} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterTabs.map((tab) => {
          const count = counts[tab.id];
          const active = filter === tab.id;
          return (
            <button
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition ${
                active
                  ? "bg-zinc-950 text-white"
                  : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
              }`}
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              type="button"
            >
              <span>{tab.label}</span>
              <span
                className={`inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                  active ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-700"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={ordersRefreshing}
          onClick={() => void loadOrders("refresh")}
          type="button"
        >
          {ordersRefreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
          Actualizar
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-4 py-3">
            <p className="text-sm font-semibold text-zinc-950">{getFilterLabel(filter)}</p>
            <p className="mt-1 text-xs text-zinc-500">{getFilterDescription(filter)}</p>
          </div>
          {ordersLoading ? (
            <LoadingBlock copy="Cargando pedidos..." />
          ) : ordersError ? (
            <ErrorBlock message={ordersError} />
          ) : filteredOrders.length === 0 ? (
            <EmptyListState filter={filter} />
          ) : (
            <div className="divide-y divide-zinc-100">
              {filteredOrders.map((order) => (
                <button
                  className={`flex w-full items-start justify-between gap-3 px-4 py-4 text-left transition hover:bg-zinc-50 ${
                    order.id === selectedOrderId ? "bg-zinc-50" : "bg-white"
                  }`}
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  type="button"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <OrderStatusBadge status={order.status} />
                      {order.customerNotificationStatus === "failed" && <NotificationBadge status="failed" />}
                    </div>
                    <p className="mt-3 truncate text-sm font-semibold text-zinc-950">
                      {order.customerName?.trim() || order.customerPhone || "Cliente sin nombre"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatDateTime(order.createdAt)} · {getFulfillmentLabel(order)}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-zinc-800">{formatPrice(order.total)}</p>
                  </div>
                  <ChevronRight className="shrink-0 text-zinc-300" size={18} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          {!selectedOrderId ? (
            <div className="grid min-h-[420px] place-items-center px-6 py-10 text-center">
              <div>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-zinc-100 text-zinc-500">
                  <ClipboardList size={22} />
                </div>
                <p className="mt-4 text-base font-semibold">Sin pedido seleccionado</p>
                <p className="mt-1 max-w-sm text-sm text-zinc-500">
                  Selecciona un pedido de la lista para ver detalle, confirmar o reportar agotados.
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

function matchesFilter(order: OrderSummary, filter: OrdersFilter) {
  if (filter === "pending") {
    return order.status === "pending_restaurant_confirmation";
  }

  if (filter === "replacement") {
    return order.status === "needs_customer_replacement";
  }

  if (filter === "accepted") {
    return acceptedStatuses.includes(order.status);
  }

  return historyStatuses.includes(order.status);
}

function getFilterLabel(filter: OrdersFilter) {
  return filterTabs.find((tab) => tab.id === filter)?.label ?? "Pedidos";
}

function getFilterDescription(filter: OrdersFilter) {
  return filterTabs.find((tab) => tab.id === filter)?.description ?? "";
}

function OrderDetailPanel({
  actionKey,
  menuItems,
  onAccept,
  onOpenRejectModal,
  onRetry,
  order,
  selectedSummary,
}: {
  actionKey: string;
  menuItems: MenuItem[];
  onAccept: () => void;
  onOpenRejectModal: () => void;
  onRetry: () => void;
  order: OrderDetail;
  selectedSummary?: OrderSummary;
}) {
  const notificationFailed = order.customerNotificationStatus === "failed";
  const canAccept = order.status === "pending_restaurant_confirmation";
  const canReject = order.status === "pending_restaurant_confirmation";
  const canRetry = notificationFailed && (order.status === "accepted" || order.status === "needs_customer_replacement");
  const replacementOptions = order.restaurantReviewMetadata?.replacementMenuItems ?? [];
  const unavailableItems = order.restaurantReviewMetadata?.unavailableItems ?? [];

  return (
    <div className="flex min-h-[420px] flex-col">
      <div className="flex flex-col gap-4 border-b border-zinc-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            {notificationFailed && <NotificationBadge status="failed" />}
            {selectedSummary?.customerNotificationStatus === "sent" && <NotificationBadge status="sent" />}
          </div>
          <h3 className="mt-3 text-lg font-semibold text-zinc-950">
            {order.customerName?.trim() || order.customerPhone || "Pedido sin cliente visible"}
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            {order.customerPhone || "Sin telefono"} · {formatDateTime(order.createdAt)}
          </p>
          <p className="mt-1 text-sm text-zinc-500">{getFulfillmentLabel(order)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAccept && (
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={actionKey === `accept:${order.id}`}
              onClick={onAccept}
              type="button"
            >
              {actionKey === `accept:${order.id}` ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
              Aceptar pedido
            </button>
          )}
          {canReject && (
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              onClick={onOpenRejectModal}
              type="button"
            >
              <MessageSquareWarning size={16} />
              Marcar agotado
            </button>
          )}
          {canRetry && (
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={actionKey === `retry:${order.id}`}
              onClick={onRetry}
              type="button"
            >
              {actionKey === `retry:${order.id}` ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
              Reintentar WhatsApp
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <InfoChip icon={order.fulfillmentType === "delivery" ? Truck : Store} label={order.fulfillmentType === "delivery" ? "Delivery" : "Recoge en local"} />
              <InfoChip icon={ClipboardList} label={order.paymentMethod === "transfer" ? "Transferencia" : "Efectivo"} />
            </div>
            {order.deliveryAddress && (
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                <span className="font-medium text-zinc-800">Direccion:</span> {order.deliveryAddress}
              </p>
            )}
            {order.restaurantReviewNote && (
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                <span className="font-medium text-zinc-800">Nota interna:</span> {order.restaurantReviewNote}
              </p>
            )}
            {notificationFailed && order.customerNotificationError && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                Error de envio al cliente: {order.customerNotificationError}
              </p>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-zinc-950">Items del pedido</h4>
              <p className="text-xs text-zinc-500">{order.items.length} productos</p>
            </div>
            <div className="space-y-3">
              {order.items.map((item) => (
                <article className="rounded-lg border border-zinc-200 bg-white p-4" key={item.id ?? `${item.name}-${item.quantity}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-950">
                        {item.quantity} x {item.name}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Categoria: {item.categorySnapshot || resolveCategoryFromMenuItem(menuItems, item.menuItemId) || "sin categoria"}
                      </p>
                      {item.notes && <p className="mt-2 text-sm text-zinc-600">Nota: {item.notes}</p>}
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-zinc-800">{formatPrice(item.lineTotal)}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {order.status === "needs_customer_replacement" && (
            <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex items-center gap-2 text-amber-900">
                <AlertCircle size={17} />
                <h4 className="text-sm font-semibold">Reemplazo pendiente del cliente</h4>
              </div>
              {unavailableItems.length > 0 && (
                <div className="mt-3 space-y-2">
                  {unavailableItems.map((item) => (
                    <p className="text-sm text-amber-900" key={item.orderItemId}>
                      Agotado: <span className="font-semibold">{item.name}</span> · categoria {item.category || "sin categoria"}
                    </p>
                  ))}
                </div>
              )}
              {replacementOptions.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-700">Opciones enviadas</p>
                  {replacementOptions.map((option, index) => (
                    <div className="flex items-center justify-between rounded-lg bg-white/80 px-3 py-2 text-sm" key={option.menuItemId}>
                      <span>
                        {index + 1}. {option.name}
                      </span>
                      <span className="font-semibold">{formatPrice(option.price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">Resumen</p>
          <SummaryRow label="Subtotal" value={formatPrice(order.subtotal)} />
          <SummaryRow label="Domicilio" value={formatPrice(order.deliveryFee)} />
          <SummaryRow label="Descuento" value={formatPrice(order.discountTotal)} />
          <div className="my-3 border-t border-zinc-200" />
          <SummaryRow emphasis label="Total" value={formatPrice(order.total)} />
          <div className="my-3 border-t border-zinc-200" />
          <SummaryRow label="Actualizado" value={formatDateTime(order.updatedAt)} />
          <SummaryRow label="Notificacion cliente" value={getNotificationLabel(order.customerNotificationStatus)} />
        </aside>
      </div>
    </div>
  );
}

type RejectModalSubmitValue = {
  orderItemId: string;
  markMenuItemUnavailable: boolean;
  replacementMenuItemIds: string[];
  note: string;
};

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
  const [selectedOrderItemId, setSelectedOrderItemId] = useState(order.items[0]?.id ?? "");
  const [markMenuItemUnavailable, setMarkMenuItemUnavailable] = useState(true);
  const [selectedReplacementIds, setSelectedReplacementIds] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const selectedOrderItem = useMemo(
    () => order.items.find((item) => item.id === selectedOrderItemId) ?? null,
    [order.items, selectedOrderItemId],
  );

  const replacementSuggestions = useMemo(() => {
    if (!selectedOrderItem) {
      return [];
    }

    const category = selectedOrderItem.categorySnapshot || resolveCategoryFromMenuItem(menuItems, selectedOrderItem.menuItemId);
    const normalizedCategory = normalizeText(category);

    return menuItems
      .filter((item) => item.isAvailable)
      .filter((item) => item.product?.isActive !== false)
      .filter((item) => item.id !== selectedOrderItem.menuItemId)
      .filter((item) => normalizeText(resolveCategoryFromMenuItem(menuItems, item.id) || item.product?.category) === normalizedCategory)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }, [menuItems, selectedOrderItem]);

  useEffect(() => {
    setSelectedReplacementIds(replacementSuggestions.map((item) => item.id));
  }, [replacementSuggestions]);

  const categoryLabel = selectedOrderItem?.categorySnapshot
    || resolveCategoryFromMenuItem(menuItems, selectedOrderItem?.menuItemId)
    || "sin categoria";

  const canSubmit = Boolean(selectedOrderItemId) && selectedReplacementIds.length > 0;

  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-zinc-950/30 p-0 backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-zinc-200 sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">Reportar agotado</h3>
            <p className="mt-1 text-sm text-zinc-500">
              El cliente recibira por WhatsApp solo alternativas activas de la misma categoria.
            </p>
          </div>
          <button
            className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto p-5">
          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">1. Selecciona el item agotado</p>
            <div className="space-y-2">
              {order.items.map((item) => {
                const active = item.id === selectedOrderItemId;
                return (
                  <button
                    className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                      active ? "border-zinc-900 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                    }`}
                    key={item.id ?? `${item.name}-${item.quantity}`}
                    onClick={() => setSelectedOrderItemId(item.id ?? "")}
                    type="button"
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        {item.quantity} x {item.name}
                      </p>
                      <p className={`mt-1 text-xs ${active ? "text-white/75" : "text-zinc-500"}`}>
                        {item.categorySnapshot || resolveCategoryFromMenuItem(menuItems, item.menuItemId) || "sin categoria"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">{formatPrice(item.lineTotal)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">2. Opciones de reemplazo</p>
                <p className="mt-1 text-sm text-zinc-600">Categoria usada: {categoryLabel}</p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">
                <input
                  checked={markMenuItemUnavailable}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  onChange={(event) => setMarkMenuItemUnavailable(event.target.checked)}
                  type="checkbox"
                />
                Marcar no disponible en menu
              </label>
            </div>

            {replacementSuggestions.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No hay productos activos y disponibles en esta categoria para ofrecer por WhatsApp.
              </div>
            ) : (
              <div className="space-y-2">
                {replacementSuggestions.map((item) => {
                  const checked = selectedReplacementIds.includes(item.id);
                  return (
                    <label
                      className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800"
                      key={item.id}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          checked={checked}
                          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                          onChange={(event) => {
                            setSelectedReplacementIds((current) =>
                              event.target.checked
                                ? [...current, item.id]
                                : current.filter((entry) => entry !== item.id),
                            );
                          }}
                          type="checkbox"
                        />
                        <div>
                          <p className="font-semibold">{getMenuItemDisplayName(item)}</p>
                          <p className="mt-1 text-xs text-zinc-500">{item.product?.category || categoryLabel}</p>
                        </div>
                      </div>
                      <span className="font-semibold">{formatPrice(resolveMenuItemPrice(item))}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">Nota opcional</span>
              <textarea
                className="min-h-24 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm outline-none transition focus:border-zinc-300 focus:bg-white focus:ring-4 focus:ring-zinc-100"
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ej. Sin Coca-Cola, se ofrecen otras bebidas frias."
                value={note}
              />
            </label>
          </section>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-200 px-4 text-sm font-semibold transition hover:bg-zinc-50"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
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
            {submitting ? "Enviando..." : "Notificar al cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-600">{label}</p>
        <Icon className="text-zinc-400" size={16} />
      </div>
      <p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function SummaryRow({ emphasis = false, label, value }: { emphasis?: boolean; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-sm ${emphasis ? "font-semibold text-zinc-950" : "text-zinc-600"}`}>{label}</span>
      <span className={`text-sm ${emphasis ? "font-semibold text-zinc-950" : "font-medium text-zinc-800"}`}>{value}</span>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const palette = {
    new: "bg-zinc-100 text-zinc-700",
    pending_restaurant_confirmation: "bg-amber-100 text-amber-800",
    needs_customer_replacement: "bg-orange-100 text-orange-800",
    payment_pending_review: "bg-sky-100 text-sky-800",
    accepted: "bg-emerald-100 text-emerald-800",
    preparing: "bg-violet-100 text-violet-800",
    on_the_way: "bg-indigo-100 text-indigo-800",
    delivered: "bg-zinc-200 text-zinc-800",
    cancelled: "bg-rose-100 text-rose-800",
  }[status];

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${palette}`}>
      {getOrderStatusLabel(status)}
    </span>
  );
}

function NotificationBadge({ status }: { status: "failed" | "sent" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        status === "failed" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
      }`}
    >
      {status === "failed" ? "WhatsApp fallido" : "WhatsApp enviado"}
    </span>
  );
}

function InfoChip({ icon: Icon, label }: { icon: typeof Truck; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
      <Icon size={14} />
      {label}
    </span>
  );
}

function LoadingBlock({ copy }: { copy: string }) {
  return (
    <div className="grid min-h-[420px] place-items-center px-6 py-10">
      <div className="inline-flex items-center gap-3 rounded-full bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-600 ring-1 ring-zinc-200">
        <Loader2 className="animate-spin" size={17} />
        {copy}
      </div>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="grid min-h-[420px] place-items-center px-6 py-10">
      <div className="max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
        {message}
      </div>
    </div>
  );
}

function EmptyListState({ filter }: { filter: OrdersFilter }) {
  const copy = {
    pending: "No hay pedidos esperando confirmacion del restaurante.",
    replacement: "No hay pedidos esperando respuesta del cliente.",
    accepted: "No hay pedidos activos confirmados.",
    history: "Todavia no hay pedidos cerrados en este tenant.",
  }[filter];

  return (
    <div className="grid min-h-[320px] place-items-center px-6 py-10 text-center">
      <div>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-zinc-100 text-zinc-500">
          <ClipboardList size={22} />
        </div>
        <p className="mt-4 text-base font-semibold text-zinc-950">Bandeja vacia</p>
        <p className="mt-1 max-w-xs text-sm text-zinc-500">{copy}</p>
      </div>
    </div>
  );
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
  return `${fulfillment} · ${payment} · ${serviceTiming}`;
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

function normalizeText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
