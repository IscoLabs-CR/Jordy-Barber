export interface Barber {
  id: string;
  name: string;
  display_order: number;
}

export type AppointmentKind = "booking" | "block";

export interface Appointment {
  id: string;
  barber_id: string;
  start_time: string;
  end_time: string;
  service_type: "sencillo" | "barba" | "full" | null;
  kind: AppointmentKind;
  client_name: string | null;
  client_phone: string | null;
  created_at: string;
}
