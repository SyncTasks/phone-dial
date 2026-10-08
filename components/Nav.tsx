"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "今日" },
  { href: "/tasks", label: "一覧" },
  { href: "/review", label: "週次整理" },
  { href: "/notes", label: "手書き" },
];

export function Nav({ reviewBadge }: { reviewBadge: number }) {
  const path = usePathname();
  return (
    <nav className="seg" aria-label="表示切り替え">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
          {l.label}
          {l.href === "/review" && reviewBadge > 0 && <span className="badge">{reviewBadge}</span>}
        </Link>
      ))}
    </nav>
  );
}
