import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "./Dashboard";

export const dynamic = "force-dynamic";

export default async function BarberoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/barbero/login");

  const { data: barber } = await supabase
    .from("barbers")
    .select("id, name")
    .eq("id", user.id)
    .single();

  return (
    <Dashboard barberId={user.id} barberName={barber?.name ?? "Barbero"} />
  );
}
