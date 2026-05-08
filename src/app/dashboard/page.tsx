import { DashboardPageContent } from "@/components/DashboardPageContent";
import { logDashboardCatch } from "@/lib/dashboardRenderErrorLog";

/** Main dashboard data loads via GET /api/dashboard/bootstrap (client) to avoid RSC render failures. */
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  try {
    return <DashboardPageContent />;
  } catch (e) {
    logDashboardCatch("page top-level catch (see digest in Vercel logs)", e);
    throw e;
  }
}
