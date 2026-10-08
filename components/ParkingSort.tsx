"use client";

import { ListPlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { discardParking, parkingToTask } from "@/app/actions";
import type { Parking } from "@/lib/store";
import { fmtDate } from "@/lib/time";

/** Weekly review step: sort the memos jotted down during the week. */
export function ParkingSort({ initial, notify }: { initial: Parking[]; notify: (t: string, err?: boolean) => void }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  if (!items.length) return null;

  const run = (p: Parking, kind: "task" | "drop") =>
    start(async () => {
      setBusy(p.id);
      const res = kind === "task" ? await parkingToTask(p.id) : await discardParking(p.id);
      setBusy(null);
      if (!res.ok) return notify(res.error, true);
      setItems((l) => l.filter((x) => x.id !== p.id));
      notify(kind === "task" ? `スプシに No.${res.value} として追加しました` : "捨てました");
      router.refresh();
    });

  return (
    <section className="panel" aria-labelledby="h-park">
      <div className="panel-head">
        <h2 id="h-park">思いついたことの仕分け</h2>
        <span className="sub">{items.length}件・タスクにするか捨てるか決めます</span>
      </div>
      <ul className="park-list">
        {items.map((p) => (
          <li key={p.id} className={busy === p.id ? "pending" : undefined}>
            <div className="park-text">
              <p>{p.text}</p>
              <span className="note mono">{fmtDate(p.createdAt, true)}</span>
            </div>
            <div className="row-actions">
              <button type="button" className="btn sm" disabled={busy !== null} onClick={() => run(p, "task")}>
                <ListPlus size={14} aria-hidden="true" />タスクにする
              </button>
              <button type="button" className="btn sm ghost" disabled={busy !== null} onClick={() => run(p, "drop")}>
                <Trash2 size={14} aria-hidden="true" />捨てる
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
