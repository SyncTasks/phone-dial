"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { refreshSheet } from "@/app/actions";

export function SyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="btn sm"
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await refreshSheet();
          router.refresh();
        })
      }
    >
      {pending ? "読み込み中…" : "再読み込み"}
    </button>
  );
}
