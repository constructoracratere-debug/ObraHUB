import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/app/_components/app-shell";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Load the user's profile so the shell can render their name/profession.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, profession_type")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AppShell
      profile={{
        full_name: profile?.full_name ?? user.email ?? "",
        profession_type: profile?.profession_type ?? null,
      }}
    />
  );
}
