import { AdminLoginForm } from "@/components/admin-login-form";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading…</p>}>
      <AdminLoginForm />
    </Suspense>
  );
}
