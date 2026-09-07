import { Dashboard } from "@/components/dashboard";
import { loadDesk } from "@/lib/load-desk";

export const dynamic = "force-dynamic";

export default async function Home() {
  const desk = await loadDesk();
  return <Dashboard initial={desk} />;
}
