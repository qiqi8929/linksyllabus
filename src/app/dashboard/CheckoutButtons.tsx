"use client";

import { useState } from "react";

async function startCheckout(payload: any) {
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

export function SubscribeButton({ disabled }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      className="btn-primary"
      disabled={disabled || loading}
      onClick={async () => {
        setLoading(true);
        try {
          await startCheckout({ type: "subscription" });
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "跳转中..." : "开通订阅 $19.9/月"}
    </button>
  );
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
      {loading ? "跳转中..." : "激活 $9.9 / Tutorial"}
    </button>
  );
}

