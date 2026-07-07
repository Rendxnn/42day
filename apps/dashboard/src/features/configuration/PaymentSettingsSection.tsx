import { BankAccountsSection } from "./BankAccountsSection";
import { PaymentQrSection } from "./PaymentQrSection";
import type {
  CreatePaymentAccountInput,
  CreatePaymentQrInput,
  PaymentAccount,
  PaymentQr,
  UpdatePaymentAccountInput,
  UpdatePaymentQrInput,
} from "./paymentConfiguration.types";

export function PaymentSettingsSection({
  accounts,
  qrs,
  feedback,
  constraints,
  pendingAction,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
  onActivateAccount,
  onDeactivateAccount,
  onCreateQr,
  onUpdateQr,
  onDeleteQr,
  onActivateQr,
  onDeactivateQr,
}: {
  accounts: PaymentAccount[];
  qrs: PaymentQr[];
  feedback: { kind: "error" | "success"; message: string } | null;
  constraints: { maxActiveAccounts: 5; maxActiveQrs: 1 };
  pendingAction: string | null;
  onCreateAccount: (input: CreatePaymentAccountInput) => Promise<void>;
  onUpdateAccount: (accountId: string, input: UpdatePaymentAccountInput) => Promise<void>;
  onDeleteAccount: (accountId: string) => Promise<void>;
  onActivateAccount: (accountId: string) => Promise<void>;
  onDeactivateAccount: (accountId: string) => Promise<void>;
  onCreateQr: (input: CreatePaymentQrInput) => Promise<void>;
  onUpdateQr: (qrId: string, input: UpdatePaymentQrInput) => Promise<void>;
  onDeleteQr: (qrId: string) => Promise<void>;
  onActivateQr: (qrId: string) => Promise<void>;
  onDeactivateQr: (qrId: string) => Promise<void>;
}) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="app-display text-[2.25rem] leading-none text-[var(--text-on-dark)] sm:text-[2.8rem]">Configuración de pagos</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgba(246,236,223,0.68)] sm:text-[15px]">
          Organiza cuentas bancarias y QRs para preparar la siguiente fase del flujo de pagos por transferencia.
        </p>
      </div>

      {feedback && (
        <div className={`rounded-[24px] px-4 py-3 text-sm font-medium ${
          feedback.kind === "success"
            ? "border border-[rgba(119,162,126,0.2)] bg-[rgba(79,122,97,0.13)] text-[#cbe5d2]"
            : "border border-[rgba(180,94,84,0.18)] bg-[rgba(190,110,95,0.08)] text-[#8c4e47]"
        }`}>
          {feedback.message}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)]">
        <BankAccountsSection
          accounts={accounts}
          maxActiveAccounts={constraints.maxActiveAccounts}
          onActivateAccount={onActivateAccount}
          onCreateAccount={onCreateAccount}
          onDeactivateAccount={onDeactivateAccount}
          onDeleteAccount={onDeleteAccount}
          onUpdateAccount={onUpdateAccount}
          pendingAction={pendingAction}
        />
        <PaymentQrSection
          maxActiveQrs={constraints.maxActiveQrs}
          onActivateQr={onActivateQr}
          onCreateQr={onCreateQr}
          onDeactivateQr={onDeactivateQr}
          onDeleteQr={onDeleteQr}
          onUpdateQr={onUpdateQr}
          pendingAction={pendingAction}
          qrs={qrs}
        />
      </div>
    </section>
  );
}
