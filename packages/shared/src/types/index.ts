export interface Project {
  id: string;
  name: string;
  createdAt: Date;
}

export interface BugReport {
  id: string;
  projectId: string;
  title: string;
  steps: TimelineEvent[];
  screenshots: string[];
  createdAt: Date;
}

export interface TimelineEvent {
  ts: number;
  sessionId: string;
  event: import("@testerbuddy/protocol").BrowserEvent;
}
