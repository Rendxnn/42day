import { useEffect, useState } from "react";
import { Check, Edit3, Loader2, Plus, Trash2, UploadCloud, X } from "lucide-react";
import type {
  CreatePaymentQrInput,
  PaymentQr,
  UpdatePaymentQrInput,
} from "./paymentConfiguration.types";

type QrFormState = {
  label: string;
  file: File | null;
  isActive: boolean;
};

const emptyQrForm: QrFormState = {
  label: "",
  file: null,
  isActive: false,
};

export function PaymentQrSection({
  qrs,
  maxActiveQrs,
  pendingAction,
  onCreateQr,
  onUpdateQr,
  onDeleteQr,
  onActivateQr,
  onDeactivateQr,
}: {
  qrs: PaymentQr[];
  maxActiveQrs: number;
  pendingAction: string | null;
  onCreateQr: (input: CreatePaymentQrInput) => Promise<void>;
  onUpdateQr: (qrId: string, input: UpdatePaymentQrInput) => Promise<void>;
  onDeleteQr: (qrId: string) => Promise<void>;
  onActivateQr: (qrId: string) => Promise<void>;
  onDeactivateQr: (qrId: string) => Promise<void>;
}) {
  const [isFormOpen, setIsFormOpen] = useState(qrs.length === 0);
  const [editingQrId, setEditingQrId] = useState<string | null>(null);
  const [form, setForm] = useState<QrFormState>(emptyQrForm);
  const [previewUrl, setPreviewUrl] = useState("");
  const [formError, setFormError] = useState("");

  const editingQr = qrs.find((qr) => qr.id === editingQrId) ?? null;
  const activeCount = qrs.filter((qr) => qr.isActive).length;

  useEffect(() => {
    if (!form.file) {
      setPreviewUrl(editingQr?.imageUrl ?? "");
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(form.file);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [editingQr?.imageUrl, form.file]);

  function openCreateForm() {
    setEditingQrId(null);
    setForm(emptyQrForm);
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditForm(qr: PaymentQr) {
    setEditingQrId(qr.id);
    setForm({
      label: qr.label,
      file: null,
      isActive: qr.isActive,
    });
    setPreviewUrl(qr.imageUrl);
    setFormError("");
    setIsFormOpen(true);
  }

  function closeForm() {
    setEditingQrId(null);
    setForm(emptyQrForm);
    setPreviewUrl("");
    setFormError("");
    setIsFormOpen(false);
  }

  async function handleSubmit() {
    if (!form.label.trim()) {
      setFormError("La etiqueta del QR es obligatoria.");
      return;
    }
    if (!editingQrId && !form.file) {
      setFormError("Debes subir una imagen para crear el QR.");
      return;
    }

    setFormError("");

    if (editingQrId) {
      await onUpdateQr(editingQrId, {
        label: form.label,
        file: form.file ?? undefined,
      });

      if (editingQr && editingQr.isActive !== form.isActive) {
        await (form.isActive ? onActivateQr(editingQrId) : onDeactivateQr(editingQrId));
      }
    } else if (form.file) {
      await onCreateQr({
        label: form.label,
        file: form.file,
        isActive: form.isActive,
      });
    }

    closeForm();
  }

  return (
    <section className="app-panel rounded-[26px] p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold uppercase tracking-[0.08em] text-[var(--text-strong)] sm:text-[1.35rem]">QR de pagos</h3>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Un QR activo a la vez</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-soft)]">
              Sube imagenes, asigna una etiqueta y controla cual QR queda listo para usarse cuando el backend lo conecte con el chat.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)]">
              {activeCount}/{maxActiveQrs} activo
            </span>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:bg-[#312923]"
              onClick={openCreateForm}
              type="button"
            >
              <Plus size={16} />
              Agregar QR
            </button>
          </div>
        </div>

        {isFormOpen && (
          <div className="rounded-[24px] border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-strong)]">
                  {editingQr ? "Editar QR" : "Nuevo QR"}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">
                  {editingQr ? "Actualiza etiqueta, imagen o estado del QR." : "Sube la imagen y marca si debe quedar activa."}
                </p>
              </div>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(118,93,71,0.12)] text-[var(--text-soft)] transition hover:bg-white"
                onClick={closeForm}
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 grid gap-4">
              <label className="block">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Etiqueta</span>
                <input
                  className="h-11 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-white/80 px-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
                  onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                  placeholder="Ej. QR principal del restaurante"
                  value={form.label}
                />
              </label>

              <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="grid place-items-center rounded-[24px] border border-dashed border-[rgba(118,93,71,0.18)] bg-[rgba(255,251,246,0.72)] p-4">
                  {previewUrl ? (
                    <img alt={form.label || "Preview del QR"} className="h-44 w-44 rounded-[18px] object-cover" src={previewUrl} />
                  ) : (
                    <div className="grid h-44 w-44 place-items-center rounded-[18px] bg-[var(--surface-base)] text-center text-sm font-medium text-[var(--text-soft)]">
                      Sin preview
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-[24px] border border-[rgba(118,93,71,0.12)] bg-white/70 px-4 py-5 text-center text-sm text-[var(--text-soft)] transition hover:bg-white">
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))}
                      type="file"
                    />
                    <UploadCloud className="mb-3 text-[var(--text-faint)]" size={22} />
                    <p className="font-semibold text-[var(--text-strong)]">{form.file ? form.file.name : "Subir imagen del QR"}</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--text-soft)]">JPG, PNG o WebP. La integracion de storage llegara en la siguiente fase.</p>
                  </label>
                  <label className="flex h-11 items-center gap-3 rounded-2xl border border-[rgba(118,93,71,0.12)] bg-white/70 px-4 text-sm font-semibold text-[var(--text-soft)]">
                    <input
                      checked={form.isActive}
                      onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                      type="checkbox"
                    />
                    Activar al guardar
                  </label>
                </div>
              </div>
            </div>

            {formError && (
              <p className="mt-4 rounded-[18px] border border-[rgba(180,94,84,0.18)] bg-[rgba(190,110,95,0.08)] px-4 py-3 text-sm font-medium text-[#8c4e47]">
                {formError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pendingAction === "qr:create" || pendingAction === `qr:update:${editingQrId}`}
                onClick={() => void handleSubmit()}
                type="button"
              >
                {pendingAction === "qr:create" || pendingAction === `qr:update:${editingQrId}`
                  ? <Loader2 className="animate-spin" size={16} />
                  : <Check size={16} />}
                {editingQr ? "Guardar QR" : "Crear QR"}
              </button>
              <button
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-[rgba(118,93,71,0.12)] px-4 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-white"
                onClick={closeForm}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-3">
        {qrs.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[rgba(118,93,71,0.22)] px-4 py-10 text-center text-sm leading-6 text-[var(--text-soft)]">
            Aun no hay QRs de pago cargados. Sube uno para dejar listo el futuro flujo de pagos.
          </div>
        ) : (
          qrs.map((qr) => (
            <article className="rounded-[24px] border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] p-4 sm:p-5" key={qr.id}>
              <div className="grid gap-4 lg:grid-cols-[116px_minmax(0,1fr)]">
                <div className="rounded-[20px] bg-white p-2 shadow-[inset_0_0_0_1px_rgba(118,93,71,0.08)]">
                  <img alt={qr.label} className="h-24 w-full rounded-[14px] object-cover" src={qr.imageUrl} />
                </div>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--text-strong)]">{qr.label}</span>
                      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${qr.isActive ? "bg-[rgba(79,122,97,0.12)] text-[var(--success)]" : "bg-[var(--surface-base)] text-[var(--text-soft)]"}`}>
                        {qr.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-stretch gap-2 lg:min-w-[170px] lg:items-end">
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] px-3 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-white lg:min-w-[170px]"
                      onClick={() => openEditForm(qr)}
                      type="button"
                    >
                      <Edit3 size={15} />
                      Editar
                    </button>
                    <ActivationSwitch
                      active={qr.isActive}
                      busy={pendingAction === `qr:activate:${qr.id}` || pendingAction === `qr:deactivate:${qr.id}`}
                      label="Estado"
                      onToggle={() => void (qr.isActive ? onDeactivateQr(qr.id) : onActivateQr(qr.id))}
                    />
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[rgba(180,94,84,0.18)] px-3 text-sm font-semibold text-[#8c4e47] transition hover:bg-[rgba(190,110,95,0.08)] lg:min-w-[170px]"
                      onClick={() => void onDeleteQr(qr.id)}
                      type="button"
                    >
                      {pendingAction === `qr:delete:${qr.id}` ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function ActivationSwitch({
  active,
  busy,
  label,
  onToggle,
}: {
  active: boolean;
  busy: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      aria-checked={active}
      className="inline-flex h-10 items-center justify-between gap-3 rounded-2xl border border-[rgba(118,93,71,0.12)] bg-white/80 px-3 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 lg:min-w-[170px]"
      disabled={busy}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span>{label}</span>
      <span className="inline-flex items-center gap-2">
        {busy ? <Loader2 className="animate-spin" size={15} /> : null}
        <span
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${
            active ? "bg-[var(--success)]" : "bg-[rgba(118,93,71,0.22)]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_2px_8px_rgba(49,41,35,0.18)] transition ${
              active ? "left-[22px]" : "left-0.5"
            }`}
          />
        </span>
      </span>
    </button>
  );
}
