import { AdminDashboard } from "@/components/admin-dashboard";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AdminDashboard view="conversations" />;
}
