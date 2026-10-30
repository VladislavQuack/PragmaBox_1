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
  createdAt: string;
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
  // Занятие по абонементу: списывается с него, а оплата — это оплата абонемента
  packageId: number | null;
  remainingSessions: number | null;
  startsAt: string;
  durationMin: number;
  muscleGroup: string;
  kind: string;
  status: string;
  price: number;
  // Деньги за тренировку получены. У занятия по абонементу — оплачен ли абонемент
  paid: boolean;
  note: string | null;
}
