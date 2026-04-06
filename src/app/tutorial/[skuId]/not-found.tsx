import Link from "next/link";

export default function TutorialNotFound() {
  return (
    <main className="container-page py-16 text-center">
      <h1 className="text-xl font-semibold text-zinc-900">Tutorial not found</h1>
      <p className="mt-2 text-sm text-zinc-600">
        This tutorial may be unpublished or the link is invalid.
      </p>
      <Link className="btn-primary mt-6 inline-block" href="/">
        Home
      </Link>
    </main>
  );
}
