import "./auth-pages.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="ml-auth-layout">{children}</main>;
}
