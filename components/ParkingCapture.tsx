"use client";

import { Lightbulb } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addParking } from "@/app/actions";

/** One line: type what popped into your head, Enter, back to the task. Goes to the app's memo list, not the sheet. */
export function ParkingCapture({ count, notify }: { count: number; notify: (t: string, err?: boolean) => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [n, setN] = useState(count);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const [lastCount, setLastCount] = useState(count);
  if (count !== lastCount) {
    setLastCount(count);
    setN(count);
  }

  return (
    <form
      className="park"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        setText("");
        start(async () => {
          const res = await addParking(t);
          if (!res.ok) {
            setText(t);
            return notify(res.error, true);
          }
          setN((x) => x + 1);
          notify("メモしました。今のタスクに戻ろう");
          router.refresh();
        });
        input.current?.focus();
      }}
    >
      <Lightbulb size={18} aria-hidden="true" className="park-icon" />
      <label className="visually-hidden" htmlFor="park">思いついたことをメモ</label>
      <input
        ref={input}
        id="park"
        className="park-field"
        placeholder="思いついたことをメモ"
        value={text}
        onChange={(e) => setText(e.target.value)}
        enterKeyHint="done"
        autoComplete="off"
        maxLength={500}
      />
      <span className="park-n note" aria-live="polite">{pending ? "保存中" : n ? `${n}件` : ""}</span>
    </form>
  );
}
