import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, Edit3, Loader2, Plus, Trash2, X } from "lucide-react";
import type {
  CreatePaymentAccountInput,
  PaymentAccount,
  UpdatePaymentAccountInput,
} from "./paymentConfiguration.types";

type AccountFormState = {
  bankName: string;
  accountNumber: string;
  holderName: string;
  isActive: boolean;
};

const emptyAccountForm: AccountFormState = {
  bankName: "",
  accountNumber: "",
  holderName: "",
  isActive: false,
};

export function BankAccountsSection({
  accounts,
  maxActiveAccounts,
  pendingAction,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
  onActivateAccount,
  onDeactivateAccount,
}: {
  accounts: PaymentAccount[];
  maxActiveAccounts: number;
  pendingAction: string | null;
  onCreateAccount: (input: CreatePaymentAccountInput) => Promise<void>;
  onUpdateAccount: (accountId: string, input: UpdatePaymentAccountInput) => Promise<void>;
  onDeleteAccount: (accountId: string) => Promise<void>;
  onActivateAccount: (accountId: string) => Promise<void>;
  onDeactivateAccount: (accountId: string) => Promise<void>;
}) {
  const [isFormOpen, setIsFormOpen] = useState(accounts.length === 0);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountFormState>(emptyAccountForm);
  const [formError, setFormError] = useState("");

  const activeCount = useMemo(() => accounts.filter((account) => account.isActive).length, [accounts]);
  const editingAccount = accounts.find((account) => account.id === editingAccountId) ?? null;

  function openCreateForm() {
    setEditingAccountId(null);
    setForm(emptyAccountForm);
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditForm(account: PaymentAccount) {
    setEditingAccountId(account.id);
    setForm({
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      holderName: account.holderName,
      isActive: account.isActive,
    });
    setFormError("");
    setIsFormOpen(true);
  }

  function closeForm() {
    setEditingAccountId(null);
    setForm(emptyAccountForm);
    setFormError("");
    setIsFormOpen(false);
  }

  async function handleSubmit() {
    if (!form.bankName.trim()) {
      setFormError("El banco es obligatorio.");
      return;
    }
    if (!form.accountNumber.trim()) {
      setFormError("El numero de cuenta es obligatorio.");
      return;
    }
    if (!form.holderName.trim()) {
      setFormError("El nombre del titular es obligatorio.");
      return;
    }

    setFormError("");

    if (editingAccountId) {
      await onUpdateAccount(editingAccountId, {
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        holderName: form.holderName,
        isActive: form.isActive,
      });
    } else {
      await onCreateAccount({
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        holderName: form.holderName,
        isActive: form.isActive,
      });
    }

    closeForm();
  }

  return (
    <section className="app-panel rounded-[26px] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold uppercase tracking-[0.08em] text-[var(--text-strong)] sm:text-[1.35rem]">Cuentas bancarias</h3>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">Hasta {maxActiveAccounts} activas al mismo tiempo</p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-soft)]">
            Define banco, numero de cuenta y nombre del titular. Las activas seran las candidatas para el futuro flujo de pago por transferencia.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--surface-base)] px-3 py-1.5 text-xs font-semibold text-[var(--text-soft)]">
            {activeCount}/{maxActiveAccounts} activas
          </span>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:bg-[#312923]"
            onClick={openCreateForm}
            type="button"
          >
            <Plus size={16} />
            Agregar cuenta
          </button>
        </div>
      </div>

      {isFormOpen && (
        <div className="mt-5 rounded-[24px] border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-strong)]">
                {editingAccount ? "Editar cuenta" : "Nueva cuenta"}
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-soft)]">
                {editingAccount ? "Actualiza banco, titular o estado." : "Completa los datos base de la cuenta."}
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

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <FormField label="Banco">
              <input
                className="h-11 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-white/80 px-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
                onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))}
                placeholder="Ej. Bancolombia"
                value={form.bankName}
              />
            </FormField>
            <FormField label="Titular">
              <input
                className="h-11 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-white/80 px-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
                onChange={(event) => setForm((current) => ({ ...current, holderName: event.target.value }))}
                placeholder="Nombre del titular"
                value={form.holderName}
              />
            </FormField>
            <FormField label="Numero de cuenta">
              <input
                className="h-11 w-full rounded-2xl border border-[rgba(118,93,71,0.12)] bg-white/80 px-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[rgba(118,93,71,0.24)] focus:ring-4 focus:ring-[rgba(197,123,87,0.08)]"
                onChange={(event) => setForm((current) => ({ ...current, accountNumber: event.target.value }))}
                placeholder="Cuenta o convenio"
                value={form.accountNumber}
              />
            </FormField>
            <label className="flex h-full min-h-11 items-center gap-3 rounded-2xl border border-[rgba(118,93,71,0.12)] bg-white/70 px-4 text-sm font-semibold text-[var(--text-soft)]">
              <input
                checked={form.isActive}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                type="checkbox"
              />
              Activar al guardar
            </label>
          </div>

          {formError && (
            <p className="mt-4 rounded-[18px] border border-[rgba(180,94,84,0.18)] bg-[rgba(190,110,95,0.08)] px-4 py-3 text-sm font-medium text-[#8c4e47]">
              {formError}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--text-strong)] px-4 text-sm font-semibold text-white transition hover:bg-[#312923] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pendingAction === "account:create" || pendingAction === `account:update:${editingAccountId}`}
              onClick={() => void handleSubmit()}
              type="button"
            >
              {pendingAction === "account:create" || pendingAction === `account:update:${editingAccountId}`
                ? <Loader2 className="animate-spin" size={16} />
                : <Check size={16} />}
              {editingAccount ? "Guardar cuenta" : "Crear cuenta"}
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

      <div className="mt-5 grid gap-3">
        {accounts.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[rgba(118,93,71,0.22)] px-4 py-10 text-center text-sm leading-6 text-[var(--text-soft)]">
            Aun no hay cuentas configuradas. Agrega la primera para dejar lista la seccion de pagos.
          </div>
        ) : (
          accounts.map((account) => {
            const isBusy = pendingAction !== null && pendingAction.includes(account.id);
            return (
              <article className="rounded-[24px] border border-[rgba(118,93,71,0.12)] bg-[var(--surface-base)] p-4 sm:p-5" key={account.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--text-strong)]">{account.bankName}</span>
                      <StatusBadge active={account.isActive} />
                    </div>
                    <p className="mt-2 text-lg font-semibold text-[var(--text-strong)]">{account.accountNumber}</p>
                    <p className="mt-1 text-sm text-[var(--text-soft)]">Titular: {account.holderName}</p>
                  </div>
                  <div className="flex flex-col items-stretch gap-2 lg:min-w-[170px] lg:items-end">
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[rgba(118,93,71,0.12)] px-3 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-white lg:min-w-[170px]"
                      onClick={() => openEditForm(account)}
                      type="button"
                    >
                      <Edit3 size={15} />
                      Editar
                    </button>
                    <ActivationSwitch
                      active={account.isActive}
                      busy={isBusy}
                      label="Estado"
                      onToggle={() => void (account.isActive ? onDeactivateAccount(account.id) : onActivateAccount(account.id))}
                    />
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[rgba(180,94,84,0.18)] px-3 text-sm font-semibold text-[#8c4e47] transition hover:bg-[rgba(190,110,95,0.08)] lg:min-w-[170px]"
                      onClick={() => void onDeleteAccount(account.id)}
                      type="button"
                    >
                      {pendingAction === `account:delete:${account.id}` ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
                      Eliminar
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function FormField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${active ? "bg-[rgba(79,122,97,0.12)] text-[var(--success)]" : "bg-[var(--surface-base)] text-[var(--text-soft)]"}`}>
      {active ? "Activa" : "Inactiva"}
    </span>
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
