"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { deleteNote, saveNote, setNoteMemo } from "@/app/actions";
import type { Note } from "@/lib/store";
import { fmtDate } from "@/lib/time";
import { ToastView, useToast } from "./useBoard";

// Logical drawing space; the canvas backing store is SCALE times larger for crisp lines.
const LW = 1000;
const LH = 1300;
const SCALE = 1.6;
const DRAFT_KEY = "tb-draft-v1";
const INKS = [
  { name: "黒", token: "--ink-black" },
  { name: "赤", token: "--ink-red" },
  { name: "青", token: "--ink-blue" },
];
const SIZES = [
  { name: "細", w: 2.2 },
  { name: "中", w: 4 },
  { name: "太", w: 8 },
];

type Point = [number, number, number];
type Stroke = { tool: "pen" | "eraser"; color: string; w: number; pts: Point[] };

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, from: number) {
  const p = s.pts;
  ctx.save();
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = s.tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = ctx.fillStyle = s.tool === "eraser" ? "#000" : s.color;
  if (p.length === 1) {
    ctx.beginPath();
    ctx.arc(p[0][0], p[0][1], s.w / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const mid = (a: Point, b: Point) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (let i = Math.max(1, from); i < p.length; i++) {
    const a = i >= 2 ? mid(p[i - 2], p[i - 1]) : p[0];
    const m = mid(p[i - 1], p[i]);
    ctx.lineWidth = s.tool === "eraser" ? s.w * 4 : s.w * (0.45 + p[i][2] * 1.1);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(p[i - 1][0], p[i - 1][1], m[0], m[1]);
    ctx.stroke();
  }
  ctx.restore();
}

function loadDraft(): Stroke[] {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveDraft(strokes: Stroke[]) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(strokes));
  } catch {
    /* storage full or blocked: the draft just isn't kept */
  }
}

export function NotesView({ initialNotes, now }: { initialNotes: Note[]; now: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const cur = useRef<(Stroke & { id: number }) | null>(null);
  const penSeen = useRef(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [ink, setInk] = useState(INKS[0].token);
  const [size, setSize] = useState(SIZES[1].w);
  const [count, setCount] = useState(0);
  const [clearArmed, setClearArmed] = useState(false);
  const [memo, setMemo] = useState("");
  const [notes, setNotes] = useState(initialNotes);
  const [saving, startSave] = useTransition();
  const { toast, show } = useToast();

  useEffect(() => setNotes(initialNotes), [initialNotes]);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of strokes.current) drawStroke(ctx, s, 1);
    setCount(strokes.current.length);
  }, []);

  useEffect(() => {
    strokes.current = loadDraft();
    redraw();
  }, [redraw]);

  const point = (e: PointerEvent | React.PointerEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * LW, ((e.clientY - r.top) / r.height) * LH, e.pointerType === "pen" ? e.pressure || 0.5 : 0.5];
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch" && penSeen.current) return; // palm rejection once a stylus is in use
    if (e.pointerType === "pen") penSeen.current = true;
    if (e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const color = getComputedStyle(document.documentElement).getPropertyValue(ink).trim() || "#1b2230";
    const s = { tool, color, w: size, pts: [point(e)], id: e.pointerId };
    cur.current = s;
    strokes.current.push(s);
    drawStroke(e.currentTarget.getContext("2d")!, s, 1);
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = cur.current;
    if (!s || e.pointerId !== s.id) return;
    const n = s.pts.length;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events) s.pts.push(point(ev));
    drawStroke(e.currentTarget.getContext("2d")!, s, n);
    e.preventDefault();
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = cur.current;
    if (!s || e.pointerId !== s.id) return;
    cur.current = null;
    const last = strokes.current[strokes.current.length - 1];
    strokes.current[strokes.current.length - 1] = { tool: last.tool, color: last.color, w: last.w, pts: last.pts };
    setCount(strokes.current.length);
    saveDraft(strokes.current);
  };

  const undo = () => {
    strokes.current.pop();
    redraw();
    saveDraft(strokes.current);
  };
  const clear = () => {
    if (!clearArmed) {
      setClearArmed(true);
      setTimeout(() => setClearArmed(false), 3000);
      return;
    }
    setClearArmed(false);
    strokes.current = [];
    redraw();
    saveDraft([]);
  };

  const exportPng = () =>
    new Promise<Blob>((resolve, reject) => {
      const out = document.createElement("canvas");
      out.width = LW;
      out.height = LH;
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, LW, LH);
      ctx.drawImage(canvasRef.current!, 0, 0, LW, LH);
      out.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), "image/png");
    });

  const save = () =>
    startSave(async () => {
      if (!strokes.current.length) return show("まだ何も書かれていません。", true);
      const form = new FormData();
      form.set("image", await exportPng(), "note.png");
      form.set("memo", memo);
      const res = await saveNote(form);
      if (!res.ok) return show(res.error, true);
      setNotes((n) => [res.value, ...n]);
      strokes.current = [];
      redraw();
      saveDraft([]);
      setMemo("");
      show("保存しました");
    });

  return (
    <>
      <div className="drawbox">
        <div className="toolbar">
          <div className="grp" role="group" aria-label="道具">
            <button className="tool" type="button" aria-pressed={tool === "pen"} onClick={() => setTool("pen")}>ペン</button>
            <button className="tool" type="button" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")}>消しゴム</button>
          </div>
          <div className="grp" role="group" aria-label="色">
            {INKS.map((c) => (
              <button key={c.token} className="tool" type="button" aria-label={c.name} aria-pressed={tool === "pen" && ink === c.token} onClick={() => { setInk(c.token); setTool("pen"); }}>
                <i className="swatch" style={{ background: `var(${c.token})` }} />
              </button>
            ))}
          </div>
          <div className="grp" role="group" aria-label="太さ">
            {SIZES.map((s) => (
              <button key={s.name} className="tool" type="button" aria-pressed={size === s.w} onClick={() => setSize(s.w)}>{s.name}</button>
            ))}
          </div>
          <button className="btn sm" type="button" onClick={undo} disabled={!count}>元に戻す</button>
          <button className="btn sm danger" type="button" onClick={clear} disabled={!count}>{clearArmed ? "もう一度押すと消去" : "全消し"}</button>
        </div>
        <div className="paper">
          <canvas
            ref={canvasRef}
            width={LW * SCALE}
            height={LH * SCALE}
            aria-label="手書きキャンバス"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        </div>
        <label className="visually-hidden" htmlFor="note-memo">メモ</label>
        <input id="note-memo" className="field" placeholder="ひとことメモ（任意・あとで探しやすくなります）" value={memo} onChange={(e) => setMemo(e.target.value)} />
        <div className="row-actions">
          <button className="btn primary" type="button" onClick={save} disabled={saving || !count}>{saving ? "保存中…" : "保存"}</button>
          <span className="note">書きかけは自動でこの端末に残ります。Apple Pencil を使うと手のひらは無視します。</span>
        </div>
      </div>

      <section className="panel" aria-labelledby="h-notes">
        <div className="panel-head">
          <h2 id="h-notes">保存した手書き</h2>
          <span className="sub">{notes.length ? `${notes.length}枚` : ""}</span>
        </div>
        {notes.length ? (
          <div className="notes">
            {notes.map((n) => (
              <NoteCard key={n.id} note={n} now={now} notify={show} onDeleted={() => setNotes((l) => l.filter((x) => x.id !== n.id))} />
            ))}
          </div>
        ) : (
          <p className="empty">まだありません。上のキャンバスに書いて「保存」してください。</p>
        )}
      </section>
      <ToastView toast={toast} />
    </>
  );
}

function NoteCard({ note, notify, onDeleted }: { note: Note; now: number; notify: (t: string, err?: boolean) => void; onDeleted: () => void }) {
  const [memo, setMemo] = useState(note.memo);
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="notecard">
      <a href={note.imageUrl} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={note.imageUrl} alt={`手書きメモ ${fmtDate(note.createdAt, true)}`} loading="lazy" />
      </a>
      <div className="nb">
        <span className="note mono">{fmtDate(note.createdAt, true)}</span>
        <label className="visually-hidden" htmlFor={`memo-${note.id}`}>メモ</label>
        <textarea
          id={`memo-${note.id}`}
          className="field"
          placeholder="メモ"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={() =>
            memo !== note.memo &&
            start(async () => {
              const res = await setNoteMemo({ id: note.id, memo });
              notify(res.ok ? "メモを保存しました" : res.error, !res.ok);
            })
          }
        />
        <div className="row-actions">
          <button
            className="btn sm danger"
            type="button"
            disabled={pending}
            onClick={() => {
              if (!armed) {
                setArmed(true);
                setTimeout(() => setArmed(false), 3000);
                return;
              }
              start(async () => {
                const res = await deleteNote(note.id);
                if (res.ok) onDeleted();
                else notify(res.error, true);
              });
            }}
          >
            {armed ? "もう一度押すと削除" : "削除"}
          </button>
        </div>
      </div>
    </div>
  );
}
