export interface Barber {
  id: string;
  name: string;
  display_order: number;
}

import type { ServiceType } from "./booking";

export type AppointmentKind = "booking" | "block";

export interface Appointment {
  id: string;
  barber_id: string;
  start_time: string;
  end_time: string;
  service_type: ServiceType | null;
  kind: AppointmentKind;
  client_name: string | null;
  client_phone: string | null;
  created_at: string;
}
