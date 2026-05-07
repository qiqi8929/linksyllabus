"use client";

import { useState } from "react";

async function startCheckout(payload: { type: "sku"; skuId: string }) {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  if (!data?.url) throw new Error("Missing checkout url");
  window.location.href = data.url;
}

export function ActivateSkuButton({ skuId, disabled }: { skuId: string; disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      className="btn-primary"
      disabled={disabled || loading}
      onClick={async () => {
        setLoading(true);
        try {
          await startCheckout({ type: "sku", skuId });
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "Redirecting..." : "Activate $9.99 / Tutorial"}
    </button>
  );
}
