export const PILOT_DURATION_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PilotStatus = {
  startedAt: string;
  endsAt: string;
  daysRemaining: number;
  state: "standard" | "extended" | "continued";
};

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function pilotEndFromStart(startedAt: string) {
  const start = validDate(startedAt);
  if (!start) throw new Error("La date d’activation du pilote est invalide.");
  return new Date(start.getTime() + PILOT_DURATION_DAYS * DAY_MS).toISOString();
}

export function calculatePilotStatus(startedAt: string, endsAt: string, now = new Date()): PilotStatus {
  const start = validDate(startedAt);
  const end = validDate(endsAt);
  if (!start || !end || Number.isNaN(now.getTime())) throw new Error("Les dates du pilote sont invalides.");

  const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
  const initialEnd = start.getTime() + PILOT_DURATION_DAYS * DAY_MS;
  const state = end.getTime() <= now.getTime()
    ? "continued"
    : end.getTime() > initialEnd + 1000
      ? "extended"
      : "standard";

  return { startedAt: start.toISOString(), endsAt: end.toISOString(), daysRemaining, state };
}
