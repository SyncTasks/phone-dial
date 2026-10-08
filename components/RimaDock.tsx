"use client";

import { Check, Code, Copy, HandHelping, Loader, MessageCircle, Moon, Send, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { fetchRequests, runAction, sendToRima } from "@/app/actions";
import type { Action, AiRequest } from "@/lib/ops";
import { fmtDate } from "@/lib/time";
import { fmtSpan, ToastView, useNow, useToast } from "./useBoard";

const SEEN_KEY = "tb-rima-seen";
const POLL_MS = 8000;

const KIND: Record<AiRequest["kind"], { label: string; Icon: typeof MessageCircle }> = {
  chat: { label: "話したこと", Icon: MessageCircle },
  consult: { label: "相談の下書き", Icon: HandHelping },
  dev: { label: "実装の依頼", Icon: Code },
};

function readSeen() {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function writeSeen(ms: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(ms));
  } catch {
    /* private mode: the badge just stays */
  }
}

/** Bottom bar on every page: "リマに話す" + the panel with replies and next-action buttons. */
export function RimaDock({ initial, initialNow }: { initial: AiRequest[]; initialNow: number }) {
  const router = useRouter();
  const { toast, show } = useToast();
  const now = useNow(initialNow, 15000);
  const [requests, setRequests] = useState(initial);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [seen, setSeen] = useState(Number.MAX_SAFE_INTEGER);
  const [sending, startSend] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setRequests(initial), [initial]);
  useEffect(() => setSeen(readSeen()), []);

  const waiting = requests.filter((r) => r.status === "pending" || r.status === "doing");
  const unread = requests.filter((r) => (r.status === "done" || r.status === "error") && r.updatedAt > seen).length;

  const refresh = useCallback(async () => {
    const res = await fetchRequests();
    if (res.ok) setRequests(res.value);
  }, []);

  // Poll while something is waiting for リマ, or while the panel is open.
  useEffect(() => {
    if (!open && !waiting.length) return;
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [open, waiting.length, refresh]);

  // A reply arrived since the last poll: refresh the page data too (the reply may mention new state).
  const doneCount = requests.filter((r) => r.status === "done").length;
  const prevDone = useRef(doneCount);
  useEffect(() => {
    if (doneCount > prevDone.current) router.refresh();
    prevDone.current = doneCount;
  }, [doneCount, router]);

  useEffect(() => {
    if (!open) return;
    const latest = Math.max(0, ...requests.map((r) => r.updatedAt));
    setSeen(latest);
    writeSeen(latest);
  }, [open, requests]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    startSend(async () => {
      const res = await sendToRima({ text: t });
      if (!res.ok) return show(res.error, true);
      setText("");
      setRequests((l) => [res.value, ...l]);
      setOpen(true);
    });
  };

  const press = async (r: AiRequest, a: Action) => {
    setRunning(`${r.id}:${a.id}`);
    const res = await runAction({ requestId: r.id, actionId: a.id });
    setRunning(null);
    if (!res.ok) {
      show(res.error, true);
      await refresh();
      return;
    }
    setRequests((l) => l.map((x) => (x.id === r.id ? { ...x, actions: x.actions.map((y) => (y.id === a.id ? { ...y, done: true } : y)) } : x)));
    show(res.value);
    router.refresh();
  };

  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      show("コピーしました");
    } catch {
      show("コピーできませんでした。長押しで選んでください。", true);
    }
  };

  return (
    <>
      <div className={`rima-sheet${open ? " open" : ""}`} ref={panelRef} role="dialog" aria-modal="false" aria-labelledby="h-rima" aria-hidden={!open} inert={!open}>
        <div className="rima-sheet-head">
          <h2 id="h-rima">リマとのやりとり</h2>
          <button type="button" className="icon-btn" aria-label="閉じる" onClick={() => setOpen(false)}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="rima-list">
          {!requests.length && <p className="empty">まだありません。下の欄から話しかけると、Mac のリマが返事と「次にやること」のボタンを返します。</p>}
          {requests.map((r) => {
            const k = KIND[r.kind];
            const waitingThis = r.status === "pending" || r.status === "doing";
            return (
              <article key={r.id} className={`rima-item ${r.status}`}>
                <p className="rima-meta">
                  <k.Icon size={13} aria-hidden="true" />
                  {k.label}・{fmtDate(r.createdAt, true)}
                </p>
                <p className="rima-ask">{r.text}</p>
                {waitingThis ? (
                  <div className="rima-wait" aria-live="polite">
                    <p>
                      <Loader size={15} aria-hidden="true" className="spin" />
                      リマが考え中・{now - r.createdAt < 60000 ? "送ったばかり" : fmtSpan(now - r.createdAt)}
                    </p>
                    <p className="note">
                      <Moon size={12} aria-hidden="true" />
                      Mac がスリープ中は、起きるまで待ちになります
                    </p>
                  </div>
                ) : r.status === "error" ? (
                  <div className="rima-reply err">
                    <p><TriangleAlert size={14} aria-hidden="true" />うまく処理できませんでした</p>
                    {r.reply && <p className="note">{r.reply}</p>}
                  </div>
                ) : (
                  <div className="rima-reply">
                    <p className="rima-text">{r.reply}</p>
                    <div className="rima-actions">
                      {r.actions.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className={`btn${a.done ? " done" : a.op.type === "none" ? "" : " primary"}`}
                          disabled={a.done || running !== null}
                          onClick={() => press(r, a)}
                        >
                          {a.done ? <Check size={14} aria-hidden="true" /> : running === `${r.id}:${a.id}` ? <Loader size={14} aria-hidden="true" className="spin" /> : null}
                          {a.label}
                          {a.done && <span className="visually-hidden">（実行済み）</span>}
                        </button>
                      ))}
                      {r.reply && (
                        <button type="button" className="btn ghost" onClick={() => copy(r.reply)}>
                          <Copy size={14} aria-hidden="true" />
                          {r.kind === "consult" ? "文面をコピー" : "コピー"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <div className="rima-dock">
        <form
          className="rima-form"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label className="visually-hidden" htmlFor="rima-input">リマに話す</label>
          <input
            ref={inputRef}
            id="rima-input"
            className="rima-input"
            placeholder="リマに話す"
            value={text}
            onChange={(e) => setText(e.target.value)}
            enterKeyHint="send"
            autoComplete="off"
            maxLength={1000}
            disabled={sending}
          />
          <button type="submit" className="icon-btn send" aria-label="送る" disabled={sending || !text.trim()}>
            <Send size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" aria-label={`リマとのやりとりを${open ? "閉じる" : "開く"}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <MessageCircle size={20} aria-hidden="true" />
            {waiting.length > 0 ? <span className="dot-badge wait" aria-hidden="true" /> : unread > 0 ? <span className="dot-badge" aria-hidden="true">{unread}</span> : null}
          </button>
        </form>
      </div>
      <ToastView toast={toast} />
    </>
  );
}
