import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 font-semibold">
      <span className="h-2.5 w-2.5 rounded-full bg-brand" />
      <span>LinkSyllabus</span>
    </Link>
  );
}

