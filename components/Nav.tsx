"use client";

import { CalendarCheck, List, PenLine, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "今日", Icon: Sun },
  { href: "/tasks", label: "一覧", Icon: List },
  { href: "/review", label: "週次整理", Icon: CalendarCheck },
  { href: "/notes", label: "手書き", Icon: PenLine },
];

export function Nav({ reviewBadge }: { reviewBadge: number }) {
  const path = usePathname();
  return (
    <nav className="seg" aria-label="表示切り替え">
      {LINKS.map(({ href, label, Icon }) => (
        <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
          <Icon size={15} aria-hidden="true" />
          {label}
          {href === "/review" && reviewBadge > 0 && <span className="badge">{reviewBadge}</span>}
        </Link>
      ))}
    </nav>
  );
}
