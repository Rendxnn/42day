import { useEffect, useState, type FormEvent } from "react";
import { Check, Loader2, ShieldAlert, X } from "lucide-react";
import { getSession, onAuthStateChange, signIn, supabase } from "../../auth";

type OAuthDetails = { authorization_id: string; client: { name: string }; redirect_uri: string; scope: string };

export function OAuthConsentPage() {
  const authorizationId = new URLSearchParams(window.location.search).get("authorization_id") ?? "";
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [details, setDetails] = useState<OAuthDetails>();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const environment = window.location.hostname === "staging.parahoy.thaledon.com" ? "STAGING" : window.location.hostname === "parahoy.thaledon.com" ? "PRODUCCIÓN" : "LOCAL";

  useEffect(() => {
    if (!authorizationId || authorizationId.length > 200 || !/^[A-Za-z0-9_-]+$/.test(authorizationId) || !supabase) { setError("La solicitud de autorización no es válida."); setLoading(false); return; }
    let active = true;
    const unsubscribe = onAuthStateChange((session) => { if (active) setSignedIn(Boolean(session)); });
    void getSession().then(async (session) => {
      if (!active) return;
      setSignedIn(Boolean(session));
      if (session) await loadDetails(active);
      else setLoading(false);
    }).catch(() => { if (active) { setError("No se pudo comprobar la sesión. Recarga la página e inténtalo de nuevo."); setLoading(false); } });
    return () => { active = false; unsubscribe(); };
  }, [authorizationId]);

  async function loadDetails(active = true) {
    if (!supabase) return;
    setLoading(true); setError("");
    try {
      const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (detailsError || !data) throw detailsError ?? new Error("oauth_details_missing");
      if (!("authorization_id" in data)) { window.location.assign(data.redirect_url); return; }
      if (!active) return;
      setDetails(data as OAuthDetails);
    } catch { if (active) setError("No se pudieron cargar los detalles de autorización. Revisa tu sesión o vuelve a conectar el plugin."); }
    finally { if (active) setLoading(false); }
  }

  async function login(event: FormEvent) {
    event.preventDefault(); setWorking(true); setError("");
    try { await signIn(email.trim(), password); setSignedIn(true); await loadDetails(); }
    catch { setError("No se pudo iniciar sesión. Revisa el correo y la contraseña."); }
    finally { setWorking(false); }
  }

  async function decide(decision: "approve" | "deny") {
    if (!details || !supabase || working) return;
    setWorking(true); setError("");
    try {
      const response = decision === "approve"
        ? await supabase.auth.oauth.approveAuthorization(authorizationId)
        : await supabase.auth.oauth.denyAuthorization(authorizationId);
      if (response.error || !response.data?.redirect_url) throw response.error ?? new Error("oauth_redirect_missing");
      window.location.assign(response.data.redirect_url);
    } catch { setError(decision === "approve" ? "No se pudo aprobar el acceso. No se otorgó autorización." : "No se pudo cancelar de forma segura. Puedes cerrar esta página e intentarlo de nuevo."); setWorking(false); }
  }

  const scopes = details?.scope?.split(/\s+/).filter(Boolean) ?? [];
  return <main className="grid min-h-screen place-items-center bg-[#f4eee8] px-4 py-10 text-[#261d18]">
    <section aria-labelledby="oauth-consent-title" className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl sm:p-9">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f0e4d9]"><ShieldAlert aria-hidden="true" size={22} /></div><div><p className="text-xs font-bold uppercase tracking-widest text-[#805f4a]">Conexión segura · {environment}</p><h1 className="mt-1 text-2xl font-black" id="oauth-consent-title">Conectar agente ParaHoy</h1></div></div>
      {loading ? <p aria-live="polite" className="mt-8 flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={18} />Cargando autorización…</p> : !supabase || !authorizationId ? <div className="mt-7"><p className="text-sm">{error || "La solicitud no es válida o la autenticación no está configurada."}</p></div> : !signedIn ? <form className="mt-7 space-y-4" onSubmit={(event) => void login(event)}><p className="text-sm leading-6">Inicia sesión con tu cuenta ParaHoy para revisar la solicitud. La solicitud permanece únicamente en esta página durante el login.</p><label className="block text-sm font-bold">Correo<input autoComplete="username" className="mt-1 h-11 w-full rounded-xl border px-3" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label><label className="block text-sm font-bold">Contraseña<input autoComplete="current-password" className="mt-1 h-11 w-full rounded-xl border px-3" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label><button className="h-12 w-full rounded-xl bg-[#211a17] font-bold text-white disabled:opacity-60" disabled={working} type="submit">{working ? "Validando…" : "Iniciar sesión"}</button></form> : details ? <><p className="mt-6 text-sm leading-6">Confirma que reconoces el cliente y los permisos antes de autorizar. No se ejecutarán cambios de perfil ni QR hasta que confirmes una operación dentro de la conversación.</p><dl className="mt-5 space-y-3 rounded-2xl bg-[#faf7f4] p-4 text-sm"><div><dt className="text-xs font-semibold text-[#765d47]">Cliente</dt><dd className="mt-1 font-bold">{details.client?.name || "Cliente OAuth"}</dd></div><div><dt className="text-xs font-semibold text-[#765d47]">URI de retorno validada por Supabase</dt><dd className="mt-1 break-all font-mono text-xs">{details.redirect_uri}</dd></div><div><dt className="text-xs font-semibold text-[#765d47]">Permisos solicitados</dt><dd>{scopes.length ? <ul className="mt-1 list-disc pl-5">{scopes.map((scope) => <li key={scope}>{scope}</li>)}</ul> : <p className="mt-1">El servidor no solicita scopes adicionales.</p>}</dd></div></dl><div className="mt-6 flex flex-col gap-3 sm:flex-row"><button className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#211a17] px-4 font-bold text-white disabled:opacity-50" disabled={working} onClick={() => void decide("approve")} type="button"><Check size={18} />Autorizar acceso</button><button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 font-bold disabled:opacity-50" disabled={working} onClick={() => void decide("deny")} type="button"><X size={18} />Denegar</button></div></> : <div className="mt-7"><p className="text-sm">{error || "La solicitud no se pudo mostrar."}</p><button className="mt-4 h-11 rounded-xl border px-4 text-sm font-bold" onClick={() => void loadDetails()} type="button">Volver a intentar</button></div>}
      {error && (signedIn || loading) && <p aria-live="assertive" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}
      <p className="mt-6 border-t pt-4 text-xs leading-5 text-[#725f52]">Al autorizar, entregas a este cliente acceso OAuth según los scopes mostrados. Puedes revocar la conexión desde la configuración de seguridad de tu cuenta. Nunca compartas tu contraseña con el agente.</p>
    </section>
  </main>;
}
