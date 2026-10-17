// Контракты API. Даты передаются ISO-строками.

export interface PackageDTO {
  id: number;
  clientId: number;
  title: string;
  totalSessions: number;
  remainingSessions: number;
  price: number;
  paid: boolean;
  expiresAt: string | null;
}

export interface ClientDTO {
  id: number;
  name: string;
  phone: string | null;
  note: string | null;
  packages: PackageDTO[];
}

export interface MeasurementDTO {
  id: number;
  clientId: number;
  takenOn: string;
  weight: number | null;
  bodyFat: number | null;
  chest: number | null;
  waist: number | null;
  hips: number | null;
  biceps: number | null;
  thigh: number | null;
  note: string | null;
}

export interface SessionDTO {
  id: number;
  clientId: number;
  clientName: string;
  packageId: number | null;
  remainingSessions: number | null;
  startsAt: string;
  durationMin: number;
  muscleGroup: string;
  kind: string;
  status: string;
  price: number;
  paid: boolean;
  note: string | null;
}
