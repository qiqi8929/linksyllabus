/** Public mentor sign-off — minimal chrome, no dashboard nav. */
export default function MentorSignLayout({ children }: { children: React.ReactNode }) {
  return <div className="magiclog-root min-h-screen bg-zinc-50">{children}</div>;
}
