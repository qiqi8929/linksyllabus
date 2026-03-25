import Stripe from "stripe";
import { env } from "@/lib/env";

let stripeInstance: Stripe | null = null;

export function getStripe() {
  if (stripeInstance) return stripeInstance;

  const secretKey = env.stripe.secretKey();
  if (!secretKey) {
    throw new Error("Stripe is not configured (missing STRIPE_SECRET_KEY).");
  }

  stripeInstance = new Stripe(secretKey, { apiVersion: "2024-06-20" });
  return stripeInstance;
}

