const DEADLINE_STATUSES_SHOWN_TO_PARTICIPANTS = new Set([
  "scheduled",
  "waiting-for-event",
]);

export function shouldShowComplianceDeadline(status: string): boolean {
  return (
    DEADLINE_STATUSES_SHOWN_TO_PARTICIPANTS.has(status) ||
    status.startsWith("invalid-")
  );
}

export function complianceDeadlineNeedsReview(status: string): boolean {
  return status.startsWith("invalid-");
}

export function complianceDeadlineFallbackText(status: string): string {
  switch (status) {
    case "waiting-for-event":
      return "Waiting for both parties to confirm the event.";
    case "invalid-event":
      return "Needs review: OpenEscrow could not confirm a complete event date and timezone.";
    case "invalid-holiday-calendar":
      return "Needs review: OpenEscrow found an invalid date in the holiday calendar.";
    default:
      return "Needs review: this saved requirement cannot be calculated safely.";
  }
}
