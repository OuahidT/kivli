// APNs can return many different 400 errors. Only a confirmed invalid device
// token should remove a Wallet registration; configuration errors must stay
// visible and retryable instead of silently disconnecting the customer's pass.
export function classifyApplePushRejection(status: number, details: string) {
  let reason: string | null = null;
  try {
    const payload = JSON.parse(details) as { reason?: unknown };
    if (typeof payload.reason === "string") reason = payload.reason.slice(0, 80);
  } catch {
    // A non-JSON APNs error remains retryable and is logged by its HTTP status.
  }
  const invalidToken = status === 410
    || (status === 400 && (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic"));
  return { invalidToken, retryable: !invalidToken, reason };
}
