import { MentorPublicSignClient } from "@/components/magiclog/MentorPublicSignClient";
import { loadPublicSignWorkOrder } from "@/lib/magiclog/publicMentorSign";

export const dynamic = "force-dynamic";

function taskTitle(order: { task_name: string | null; competence_name: string }): string {
  return order.task_name?.trim() || order.competence_name;
}

export default async function MentorPublicSignPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? null;
  const result = await loadPublicSignWorkOrder(params.id, token);

  if (result.kind === "invalid") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-zinc-900">Invalid link</h1>
        <p className="mt-3 text-zinc-600">{result.message}</p>
      </div>
    );
  }

  if (result.kind === "already_signed") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-zinc-900">Already signed</h1>
        <p className="mt-3 text-zinc-600">
          <strong>{taskTitle(result.order)}</strong> was already signed
          {result.order.signed_at
            ? ` on ${new Date(result.order.signed_at).toLocaleDateString("en-CA", {
                dateStyle: "medium"
              })}`
            : ""}
          .
        </p>
        <p className="mt-2 text-sm text-zinc-500">Apprentice: {result.apprentice.displayName}</p>
      </div>
    );
  }

  if (!token?.trim()) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-zinc-900">Invalid link</h1>
        <p className="mt-3 text-zinc-600">This signing link is missing a token.</p>
      </div>
    );
  }

  return (
    <MentorPublicSignClient
      order={result.order}
      apprentice={result.apprentice}
      token={token.trim()}
    />
  );
}
