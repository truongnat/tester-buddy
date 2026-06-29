import type { TimelineEvent } from "@testerbuddy/shared";

export type BugReportHandoff = {
  projectId: string;
  ticketId: string;
  mediaIds: string[];
  steps: TimelineEvent[];
};

let handoff: BugReportHandoff | null = null;

export function setBugReportHandoff(next: BugReportHandoff) {
  handoff = next;
}

export function consumeBugReportHandoff() {
  const next = handoff;
  handoff = null;
  return next;
}
