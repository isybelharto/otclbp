import { ManagementShell } from "@/components/management-shell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ManagementLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const userId = claims?.sub;
  if (typeof userId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("full_name, role, is_active").eq("id", userId).maybeSingle();
  if (!profile || profile.role !== "management" || !profile.is_active) redirect("/access-denied");

  const email = typeof claims?.email === "string" ? claims.email : "";
  return <ManagementShell fullName={profile.full_name || email} email={email}>{children}</ManagementShell>;
}
