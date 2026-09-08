import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

export default async function SecureAdminLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(adminCookieName())?.value;
  if (!isValidAdminToken(token)) {
    redirect("/admin/login");
  }
  return <AdminShell>{children}</AdminShell>;
}
