/** Dispatched after Stripe unlock so dashboard client refetches bootstrap (paid_guide_slots). */
export const DASHBOARD_BOOTSTRAP_REFETCH_EVENT = "linksyllabus-dashboard-bootstrap-refetch";

/**
 * Set when user starts guide-unlock Checkout; used if Stripe return URL omits session_id (old deploy / edge).
 */
export const PENDING_GUIDE_UNLOCK_CHECKOUT_SESSION_KEY =
  "linksyllabus_pending_guide_unlock_cs";
