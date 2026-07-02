import { createClient } from "@/lib/supabase/server";
import type { Barber } from "@/lib/types";
import Wizard from "./Wizard";

export const dynamic = "force-dynamic";

export default async function ReservarPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("barbers")
    .select("id, name, display_order")
    .eq("active", true)
    .order("display_order");

  const barbers = (data ?? []) as Barber[];
  return <Wizard barbers={barbers} />;
}
