import { useEffect, useRef, useState } from "react";
import { Bot, ChefHat, Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { askPublicCartaConcierge } from "../../api";

type ConciergeMessage = {
  id: string;
  role: "visitor" | "assistant";
  text: string;
};

const QUICK_QUESTIONS = [
  "¿Qué me recomiendas hoy?",
  "¿Cuál plato alcanza para compartir?",
  "¿Qué alérgenos tiene este plato?",
];

export function PublicCartaConcierge({ restaurantName, tenantSlug }: { restaurantName?: string; tenantSlug: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ConciergeMessage[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: `¡Hola! Soy el anfitrión de ${restaurantName ?? "la carta"}. Te ayudo a escoger, conocer ingredientes y encontrar algo delicioso; el pedido lo terminamos por WhatsApp.`,
    },
  ]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages((current) => current.length === 1 && current[0]?.id === "welcome"
      ? [{
          id: "welcome",
          role: "assistant",
          text: `¡Hola! Soy el anfitrión de ${restaurantName ?? "la carta"}. Te ayudo a escoger, conocer ingredientes y encontrar algo delicioso; el pedido lo terminamos por WhatsApp.`,
        }]
      : current);
  }, [restaurantName]);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open, sending]);

  async function send(question: string) {
    const text = question.trim().replace(/\s+/g, " ");
    if (text.length < 2 || sending) return;

    const visitorMessage: ConciergeMessage = { id: crypto.randomUUID(), role: "visitor", text };
    const priorHistory = messages.slice(-6).map((message) => ({
      role: message.role === "visitor" ? "visitor" as const : "assistant" as const,
      text: message.text,
    }));
    setMessages((current) => [...current, visitorMessage]);
    setDraft("");
    setError("");
    setSending(true);

    try {
      const response = await askPublicCartaConcierge(tenantSlug, {
        question: text,
        history: [...priorHistory, { role: "visitor", text }],
      });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: response.answer }]);
    } catch {
      setError("No pude responder ahora mismo. Puedes intentar de nuevo o escribir al restaurante por WhatsApp.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px] sm:hidden" onClick={() => setOpen(false)} />
      )}
      <section aria-label="Asistente de la carta" className={`fixed z-50 transition duration-300 ${open ? "bottom-3 right-3 left-3 sm:bottom-6 sm:left-auto sm:right-6 sm:w-[400px]" : "bottom-5 right-5 sm:bottom-7 sm:right-7"}`}>
        {open ? (
          <div className="overflow-hidden rounded-[28px] border border-[rgba(255,242,227,0.22)] bg-[rgba(22,16,12,0.96)] shadow-[0_30px_100px_rgba(0,0,0,0.52)] backdrop-blur-2xl">
            <header className="relative overflow-hidden border-b border-white/10 bg-[linear-gradient(135deg,#ec7c2f_0%,#ce4d1e_62%,#762214_100%)] px-5 py-4 text-white">
              <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/15 shadow-[0_10px_26px_rgba(86,21,7,0.26)]"><ChefHat size={21} /></span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/72"><Sparkles size={11} /> Recomendaciones al momento</p>
                    <h2 className="truncate text-base font-extrabold">Pregunta por la carta</h2>
                  </div>
                </div>
                <button aria-label="Cerrar asistente" className="grid h-9 w-9 place-items-center rounded-xl bg-black/15 transition hover:bg-black/25" onClick={() => setOpen(false)} type="button"><X size={18} /></button>
              </div>
            </header>

            <div className="app-scrollbar max-h-[min(57vh,480px)] min-h-[290px] overflow-y-auto bg-[radial-gradient(circle_at_85%_0%,rgba(232,130,65,0.11),transparent_30%),#17110e] px-4 py-4">
              <div className="space-y-3">
                {messages.map((message) => (
                  <div className={`flex gap-2.5 ${message.role === "visitor" ? "justify-end" : "justify-start"}`} key={message.id}>
                    {message.role === "assistant" && <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-[rgba(234,117,47,0.18)] text-[#ffb16f]"><Bot size={15} /></span>}
                    <p className={`max-w-[84%] rounded-[18px] px-3.5 py-2.5 text-sm leading-5 ${message.role === "visitor" ? "rounded-br-md bg-[#ed7f35] font-medium text-white shadow-[0_8px_20px_rgba(126,47,12,0.22)]" : "rounded-bl-md border border-white/10 bg-[rgba(255,248,240,0.08)] text-[rgba(255,246,237,0.88)]"}`}>{message.text}</p>
                  </div>
                ))}
                {sending && (
                  <div className="flex items-center gap-2.5"><span className="grid h-7 w-7 place-items-center rounded-xl bg-[rgba(234,117,47,0.18)] text-[#ffb16f]"><Bot size={15} /></span><p className="rounded-[18px] rounded-bl-md border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white/60"><Loader2 className="inline animate-spin" size={14} /> Pensando en algo rico…</p></div>
                )}
                <div ref={messagesEndRef} />
              </div>
              {messages.length === 1 && !sending && (
                <div className="mt-4 flex flex-wrap gap-2 pl-9">
                  {QUICK_QUESTIONS.map((question) => (
                    <button className="rounded-full border border-[rgba(255,212,169,0.18)] bg-[rgba(237,127,53,0.1)] px-3 py-2 text-left text-xs font-semibold text-[rgba(255,232,211,0.92)] transition hover:bg-[rgba(237,127,53,0.18)]" key={question} onClick={() => void send(question)} type="button">{question}</button>
                  ))}
                </div>
              )}
            </div>

            <form className="border-t border-white/10 bg-[#130e0c] p-3" onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
              {error && <p className="mb-2 px-1 text-xs leading-5 text-[#ffae9c]">{error}</p>}
              <div className="flex items-end gap-2 rounded-[18px] border border-white/10 bg-white/[0.06] p-1.5 focus-within:border-[rgba(255,169,101,0.5)]">
                <textarea aria-label="Tu pregunta sobre la carta" className="max-h-24 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 text-white outline-none placeholder:text-white/38" disabled={sending} maxLength={420} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(draft); } }} placeholder="Ej. ¿Ese plato es para compartir?" rows={1} value={draft} />
                <button aria-label="Enviar pregunta" className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#ef7d32] text-white transition hover:brightness-110 disabled:opacity-45" disabled={sending || draft.trim().length < 2} type="submit"><Send size={16} /></button>
              </div>
              <p className="px-1 pt-2 text-[10px] leading-4 text-white/35">Te orientamos aquí; el pedido se confirma por WhatsApp.</p>
            </form>
          </div>
        ) : (
          <button aria-label="Abrir asistente de la carta" className="group relative grid h-16 w-16 place-items-center rounded-[24px] border border-white/35 bg-[linear-gradient(145deg,#ff9b42,#e85b1c_58%,#bc3714)] text-white shadow-[0_18px_44px_rgba(137,49,10,0.52)] transition hover:-translate-y-1 hover:shadow-[0_24px_54px_rgba(137,49,10,0.64)]" onClick={() => setOpen(true)} type="button">
            <span className="absolute -inset-1 rounded-[27px] border border-[#ffbd7c]/40 opacity-0 transition group-hover:opacity-100" />
            <MessageCircle size={27} strokeWidth={2.3} />
            <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border-2 border-[#1a120e] bg-[#fff1df] text-[#d8591f]"><Sparkles size={10} /></span>
          </button>
        )}
      </section>
    </>
  );
}
