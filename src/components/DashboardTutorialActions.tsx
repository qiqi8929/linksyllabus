"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActivateSkuButton } from "@/app/dashboard/CheckoutButtons";
import { deleteSkuAction, unpublishSkuAction } from "@/app/dashboard/serverActions";

type Props = {
  skuId: string;
  isActive: boolean;
};

export function DashboardTutorialActions({ skuId, isActive }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (
      !confirm(
        "Delete this tutorial and all steps? QR codes and links will stop working. This cannot be undone."
      )
    ) {
      return;
    }
    setPending(true);
    try {
      await deleteSkuAction(skuId);
      window.location.assign("/dashboard");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed.");
      setPending(false);
    }
  }

  async function onUnpublish() {
    if (
      !confirm(
        "Unpublish? The tutorial will be hidden from public links, print QR codes, and the tutorial page until you activate it again (finish payment if needed)."
      )
    ) {
      return;
    }
    setPending(true);
    try {
      await unpublishSkuAction(skuId);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not unpublish.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link
        className="btn-ghost shrink-0 text-sm"
        href={`/dashboard/edit/${encodeURIComponent(skuId)}`}
      >
        Edit
      </Link>
      {isActive ? (
        <>
          <Link
            className="btn-primary shrink-0 text-sm"
            href={`/dashboard/success?skuId=${encodeURIComponent(skuId)}`}
          >
            View QR codes
          </Link>
          <button
            type="button"
            className="btn-ghost shrink-0 text-sm text-amber-800"
            disabled={pending}
            onClick={() => void onUnpublish()}
          >
            Unpublish
          </button>
        </>
      ) : (
        <ActivateSkuButton skuId={skuId} disabled={pending} />
      )}
      <button
        type="button"
        className="btn-danger shrink-0 text-sm"
        disabled={pending}
        onClick={() => void onDelete()}
      >
        Delete
      </button>
    </div>
  );
}
