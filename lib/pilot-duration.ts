import { queryFirst } from "../db";
import { calculatePilotStatus } from "./pilot-duration-core";

export { calculatePilotStatus, PILOT_DURATION_DAYS, pilotEndFromStart } from "./pilot-duration-core";
export type { PilotStatus } from "./pilot-duration-core";

export async function pilotStatusForMerchant(merchantId: string, now = new Date()) {
  const window = await queryFirst<{ startedAt: string | null; endsAt: string | null }>(
    "SELECT pilot_started_at AS startedAt, pilot_ends_at AS endsAt FROM merchants WHERE id = ?",
    merchantId,
  );
  if (!window?.startedAt || !window.endsAt) return null;
  return calculatePilotStatus(window.startedAt, window.endsAt, now);
}
