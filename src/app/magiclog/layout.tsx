import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MagicLogLayoutShell } from "@/components/magiclog/MagicLogLayoutShell";
import "./magiclog.css";

export default async function MagicLogLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/magiclog/dashboard");
  }

  return <MagicLogLayoutShell>{children}</MagicLogLayoutShell>;
}
