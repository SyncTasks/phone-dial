"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addTask } from "@/app/actions";
import { PRIORITIES } from "@/lib/tasks";

export function AddTask({ notify }: { notify: (text: string, err?: boolean) => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [prio, setPrio] = useState("-");
  const [due, setDue] = useState("");
  const [pending, start] = useTransition();

  return (
    <form
      className="addtask"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        start(async () => {
          const res = await addTask({ title, prio, due });
          if (!res.ok) return notify(res.error, true);
          notify(`スプシに No.${res.value} として追加しました`);
          setTitle("");
          setDue("");
          setPrio("-");
          router.refresh();
        });
      }}
    >
      <label className="visually-hidden" htmlFor="new-title">新しいタスク</label>
      <input id="new-title" className="field title" placeholder="新しいタスクを追加（スプシに入ります）" value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} />
      <label className="visually-hidden" htmlFor="new-prio">優先度</label>
      <select id="new-prio" className="field" value={prio} onChange={(e) => setPrio(e.target.value)} disabled={pending}>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>{p === "-" ? "優先度 -" : `優先度 ${p}`}</option>
        ))}
      </select>
      <label className="visually-hidden" htmlFor="new-due">期日</label>
      <input id="new-due" className="field" type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={pending} />
      <button className="btn primary" type="submit" disabled={pending || !title.trim()}>
        {pending ? "追加中…" : "追加"}
      </button>
    </form>
  );
}
