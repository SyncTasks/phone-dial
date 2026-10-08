"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { refreshSheet } from "@/app/actions";

export function SyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="icon-btn"
      type="button"
      disabled={pending}
      aria-label="スプシを読み込み直す"
      title="スプシを読み込み直す"
      onClick={() =>
        start(async () => {
          await refreshSheet();
          router.refresh();
        })
      }
    >
      <RefreshCw size={17} aria-hidden="true" className={pending ? "spin" : undefined} />
    </button>
  );
}
