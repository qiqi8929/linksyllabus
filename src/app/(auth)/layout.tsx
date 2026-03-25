import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="container-page py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <div className="mx-auto max-w-md">{children}</div>
    </main>
  );
}

