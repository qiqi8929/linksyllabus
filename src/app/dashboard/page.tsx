import { DashboardPageContent } from "@/components/DashboardPageContent";

/** Main dashboard data loads via GET /api/dashboard/bootstrap (client) to avoid RSC render failures. */
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <DashboardPageContent />;
}
