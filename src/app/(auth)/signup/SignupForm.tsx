"use client";

import { MagicLogAuthScreen } from "@/components/auth/MagicLogAuthScreen";

export function SignupForm({ nextPath }: { nextPath: string }) {
  return <MagicLogAuthScreen mode="signup" nextPath={nextPath} />;
}
