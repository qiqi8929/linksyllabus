import { MagicLogLayoutShell } from "@/components/magiclog/MagicLogLayoutShell";
import "./magiclog.css";

export default function MagicLogLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <MagicLogLayoutShell>{children}</MagicLogLayoutShell>;
}
