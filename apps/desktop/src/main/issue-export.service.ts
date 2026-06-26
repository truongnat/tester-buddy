import type { BugReportRecord } from "./db/database";

export type JiraExportConfig = {
  baseUrl: string;
  email: string;
  token: string;
  projectKey: string;
  issueType?: string;
};

export type GitHubExportConfig = {
  repo: string;
  token: string;
};

export type IssueExportContext = {
  projectLabel?: string;
  ticketLabel?: string;
  externalTicketUrl?: string;
};

export type IssueExportResult =
  | { success: true; issueUrl: string; provider: "jira" | "github" }
  | { success: false; reason: string; provider: "jira" | "github" };

type ReportEvent = BugReportRecord["steps"][number]["event"];

function summarizeEvent(event: ReportEvent): string {
  switch (event.type) {
    case "user.click":
      return `Click ${event.text ? `"${event.text}"` : event.selector}`;
    case "user.input":
      return `Type "${event.valuePreview}" on ${event.selector}`;
    case "navigation":
      return `Navigate to ${event.to}`;
    case "console.log":
      return event.level === "error" ? event.message : `[${event.level}] ${event.message}`;
    case "network.request":
      return `${event.method} ${event.url}`;
    case "network.response":
      return `${event.status} response`;
    case "screenshot.captured":
      return "Screenshot captured";
    case "tab.connected":
      return `Tab connected: ${event.title ?? event.url}`;
    case "tab.updated":
      return `Tab updated: ${event.title ?? event.url}`;
    case "tab.switched":
      return `Tab switched: ${event.title ?? String(event.tabId)}`;
    case "tab.closed":
      return `Tab closed #${event.tabId}`;
    default:
      return "unknown";
  }
}

function buildIssueBody(report: BugReportRecord, context?: IssueExportContext) {
  const evidence = report.evidence ?? [];
  const lines: string[] = [];
  lines.push(report.description?.trim() ? report.description.trim() : "Bug report exported from TesterBuddy.");
  lines.push("");
  lines.push(`Severity: ${report.severity.toUpperCase()}`);
  lines.push(`Created: ${new Date(report.createdAt).toLocaleString()}`);
  if (context?.projectLabel) lines.push(`Project: ${context.projectLabel}`);
  else if (report.projectId) lines.push(`Project ID: ${report.projectId}`);
  if (context?.ticketLabel) lines.push(`Ticket: ${context.ticketLabel}`);
  else if (report.ticketId) lines.push(`Ticket ID: ${report.ticketId}`);
  if (context?.externalTicketUrl) lines.push(`External Ticket: ${context.externalTicketUrl}`);
  lines.push("");

  if (report.stepsToReproduce.trim()) {
    lines.push("Steps to Reproduce:");
    lines.push(report.stepsToReproduce.trim());
    lines.push("");
  }

  if (report.steps.length > 0) {
    lines.push("Linked Timeline Events:");
    report.steps.forEach((step: { event: ReportEvent }, index: number) => {
      lines.push(`${index + 1}. ${summarizeEvent(step.event)}`);
    });
    lines.push("");
  }

  if (report.expectedResult?.trim()) {
    lines.push("Expected Result:");
    lines.push(report.expectedResult.trim());
    lines.push("");
  }

  if (report.actualResult?.trim()) {
    lines.push("Actual Result:");
    lines.push(report.actualResult.trim());
    lines.push("");
  }

  const screenshotLines = evidence.filter((item) => item.kind === "screenshot").map((item) => item.filepath);
  const videoLines = evidence.filter((item) => item.kind === "video").map((item) => item.filepath);

  if (screenshotLines.length > 0 || report.screenshots.length > 0) {
    lines.push("Screenshots:");
    (screenshotLines.length > 0 ? screenshotLines : report.screenshots).forEach((src, index) => {
      lines.push(`- Screenshot ${index + 1}: ${src}`);
    });
    lines.push("");
  }

  if (videoLines.length > 0 || report.video) {
    lines.push("Video Evidence:");
    (videoLines.length > 0 ? videoLines : [report.video].filter(Boolean) as string[]).forEach((src) => lines.push(src));
    lines.push("");
  }

  return lines.join("\n").trim();
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function requireValue(value: string | undefined, field: string) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`Missing ${field}`);
  return trimmed;
}

export async function exportToJira(report: BugReportRecord, config: JiraExportConfig, context?: IssueExportContext): Promise<IssueExportResult> {
  try {
    const baseUrl = normalizeBaseUrl(requireValue(config.baseUrl, "Jira base URL"));
    const email = requireValue(config.email, "Jira email");
    const token = requireValue(config.token, "Jira token");
    const projectKey = requireValue(config.projectKey, "Jira project key");
    const issueType = config.issueType?.trim() || "Bug";

    const response = await fetch(`${baseUrl}/rest/api/2/issue`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          summary: report.title || "Untitled Bug",
          description: buildIssueBody(report, context),
          issuetype: { name: issueType },
        },
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      return { success: false, provider: "jira", reason: `Jira export failed (${response.status}): ${responseText.slice(0, 500)}` };
    }

    const parsed = responseText ? JSON.parse(responseText) as { key?: string } : {};
    const key = parsed.key;
    return {
      success: true,
      provider: "jira",
      issueUrl: key ? `${baseUrl}/browse/${key}` : baseUrl,
    };
  } catch (err) {
    return {
      success: false,
      provider: "jira",
      reason: err instanceof Error ? err.message : "Failed to export to Jira",
    };
  }
}

export async function exportToGitHub(report: BugReportRecord, config: GitHubExportConfig, context?: IssueExportContext): Promise<IssueExportResult> {
  try {
    const repo = requireValue(config.repo, "GitHub repository");
    const token = requireValue(config.token, "GitHub token");
    const [owner, name] = repo.split("/").map((part) => part.trim());
    if (!owner || !name) throw new Error('GitHub repository must be in the form "owner/repo"');

    const response = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: report.title || "Untitled Bug",
        body: buildIssueBody(report, context),
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      return { success: false, provider: "github", reason: `GitHub export failed (${response.status}): ${responseText.slice(0, 500)}` };
    }

    const parsed = responseText ? JSON.parse(responseText) as { html_url?: string } : {};
    return {
      success: true,
      provider: "github",
      issueUrl: parsed.html_url ?? `https://github.com/${owner}/${name}/issues`,
    };
  } catch (err) {
    return {
      success: false,
      provider: "github",
      reason: err instanceof Error ? err.message : "Failed to export to GitHub",
    };
  }
}
