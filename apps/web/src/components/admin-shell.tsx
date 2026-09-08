"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const LINKS = [
  ["/admin/dashboard", "Dashboard"],
  ["/admin/conversations", "Conversations"],
  ["/admin/customers", "Customers"],
  ["/admin/faqs", "FAQs"],
  ["/admin/rules", "Rules"],
  ["/admin/settings", "Settings"],
  ["/admin/logs", "Logs"],
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="border-b px-4 py-3 flex flex-wrap items-center gap-3">
        <Link href="/admin/dashboard" className="font-semibold tracking-tight">
          WhatsApp auto-reply
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm">
          {LINKS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={`rounded-md px-2 py-1 ${pathname === href ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/desk">Simulator desk</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await fetch("/api/admin/login", { method: "DELETE" });
              router.push("/admin/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
    </div>
  );
}
