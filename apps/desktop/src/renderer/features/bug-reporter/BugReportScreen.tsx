import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Plus, Download, Trash2, Save, Check, Paperclip, Video, Image as ImageIcon } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input, Textarea } from "../../components/ui/input";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import type { TimelineEvent } from "@testerbuddy/shared";

type Severity = "low" | "medium" | "high" | "critical";
type ProjectRecord = { id: string; name: string; key: string };
type TicketRecord = { id: string; projectId: string; code: string; title: string; externalUrl?: string; status: string };
type MediaRecord = { id: string; ticketId: string; kind: "screenshot" | "video"; filepath: string; bugId?: string; createdAt: string };

type BugReportDraft = {
  id: string;
  projectId: string;
  ticketId: string;
  title: string;
  severity: Severity;
  description: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  steps: TimelineEvent[];
  screenshots: string[];
  video?: string;
  mediaIds: string[];
  evidence?: MediaRecord[];
  createdAt?: string;
  updatedAt?: string;
};

const SEVERITY_CONFIG: Record<Severity, { label: string; variant: "default" | "warning" | "error" | "primary" }> = {
  low: { label: "Low", variant: "default" },
  medium: { label: "Medium", variant: "primary" },
  high: { label: "High", variant: "warning" },
  critical: { label: "Critical", variant: "error" },
};

const EMPTY_DRAFT = (): BugReportDraft => ({
  id: crypto.randomUUID(),
  projectId: "",
  ticketId: "",
  title: "",
  severity: "medium",
  description: "",
  stepsToReproduce: "",
  expectedResult: "",
  actualResult: "",
  steps: [],
  screenshots: [],
  video: undefined,
  mediaIds: [],
  evidence: [],
});

function summarizeEvent(event: TimelineEvent["event"]) {
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
    default:
      return event.type;
  }
}

function stepsToText(steps: TimelineEvent[]) {
  return steps.map((step, idx) => `${idx + 1}. ${summarizeEvent(step.event)}`).join("\n");
}

function normalizeDraft(report: BugReportDraft, evidence: MediaRecord[]) {
  const screenshots = evidence.filter((item) => item.kind === "screenshot").map((item) => item.filepath);
  const video = evidence.find((item) => item.kind === "video")?.filepath;
  return {
    ...report,
    stepsToReproduce: report.stepsToReproduce.trim() || stepsToText(report.steps),
    screenshots,
    video,
    evidence,
  };
}

function parseSessionSteps(raw: string | null): TimelineEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TimelineEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type IssueExportFormat = "jira" | "github";
type JiraExportConfig = { baseUrl: string; email: string; token: string; projectKey: string; issueType: string };
type GitHubExportConfig = { repo: string; token: string };
const JIRA_EXPORT_KEY = "testerbuddy:jira-export-config";
const GITHUB_EXPORT_KEY = "testerbuddy:github-export-config";

function readStoredConfig<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function promptForJiraConfig(): JiraExportConfig | null {
  const defaults = readStoredConfig<JiraExportConfig>(JIRA_EXPORT_KEY) ?? {
    baseUrl: "https://your-domain.atlassian.net",
    email: "",
    token: "",
    projectKey: "",
    issueType: "Bug",
  };
  const raw = window.prompt("Jira export config as JSON", JSON.stringify(defaults, null, 2));
  if (!raw) return null;
  try {
    const config = JSON.parse(raw) as JiraExportConfig;
    localStorage.setItem(JIRA_EXPORT_KEY, JSON.stringify(config));
    return config;
  } catch {
    alert("Invalid Jira config JSON.");
    return null;
  }
}

function promptForGitHubConfig(): GitHubExportConfig | null {
  const defaults = readStoredConfig<GitHubExportConfig>(GITHUB_EXPORT_KEY) ?? { repo: "owner/repo", token: "" };
  const raw = window.prompt("GitHub export config as JSON", JSON.stringify(defaults, null, 2));
  if (!raw) return null;
  try {
    const config = JSON.parse(raw) as GitHubExportConfig;
    localStorage.setItem(GITHUB_EXPORT_KEY, JSON.stringify(config));
    return config;
  } catch {
    alert("Invalid GitHub config JSON.");
    return null;
  }
}

export function BugReportScreen() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [availableMedia, setAvailableMedia] = useState<MediaRecord[]>([]);
  const [reports, setReports] = useState<BugReportDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BugReportDraft>(EMPTY_DRAFT());
  const [isSaved, setIsSaved] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const setField = <K extends keyof BugReportDraft>(key: K, value: BugReportDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setIsSaved(false);
  };

  const loadProjects = async () => {
    const nextProjects = ((await window.testerbuddy?.getProjects()) ?? []) as ProjectRecord[];
    setProjects(nextProjects);
  };

  const loadTickets = async (projectId: string) => {
    const nextTickets = ((await window.testerbuddy?.getTickets(projectId)) ?? []) as TicketRecord[];
    setTickets(nextTickets);
  };

  const loadMedia = async (ticketId: string) => {
    const nextMedia = ((await window.testerbuddy?.getMedia({ ticketId })) ?? []) as MediaRecord[];
    setAvailableMedia(nextMedia);
  };

  const loadReports = async (filters?: { projectId?: string; ticketId?: string }) => {
    const all = ((await window.testerbuddy?.getBugReports(filters)) ?? []) as BugReportDraft[];
    setReports(all);
  };

  useEffect(() => {
    void loadProjects();
    void loadReports();

    const structuredSteps = parseSessionSteps(sessionStorage.getItem("testerbuddy:temp_steps_json"));
    const projectId = sessionStorage.getItem("testerbuddy:temp_project_id") ?? "";
    const ticketId = sessionStorage.getItem("testerbuddy:temp_ticket_id") ?? "";
    const mediaIds = (() => {
      const raw = sessionStorage.getItem("testerbuddy:temp_media_ids");
      if (!raw) return [] as string[];
      try { return JSON.parse(raw) as string[]; } catch { return []; }
    })();

    if (structuredSteps.length > 0 || projectId || ticketId || mediaIds.length > 0) {
      const next = EMPTY_DRAFT();
      next.projectId = projectId;
      next.ticketId = ticketId;
      next.mediaIds = mediaIds;
      next.steps = structuredSteps;
      next.stepsToReproduce = stepsToText(structuredSteps);
      setDraft(next);
      setSelectedId(next.id);
      sessionStorage.removeItem("testerbuddy:temp_steps_json");
      sessionStorage.removeItem("testerbuddy:temp_project_id");
      sessionStorage.removeItem("testerbuddy:temp_ticket_id");
      sessionStorage.removeItem("testerbuddy:temp_media_ids");
    }
  }, []);

  useEffect(() => {
    if (draft.projectId) {
      void loadTickets(draft.projectId);
      void loadReports({ projectId: draft.projectId, ticketId: draft.ticketId || undefined });
    } else {
      setTickets([]);
      void loadReports();
    }
  }, [draft.projectId]);

  useEffect(() => {
    if (draft.ticketId) {
      void loadMedia(draft.ticketId);
      void loadReports({ projectId: draft.projectId || undefined, ticketId: draft.ticketId });
    } else {
      setAvailableMedia([]);
    }
  }, [draft.ticketId]);

  const selectedProject = projects.find((item) => item.id === draft.projectId) ?? null;
  const selectedTicket = tickets.find((item) => item.id === draft.ticketId) ?? null;
  const selectedEvidence = useMemo(() => availableMedia.filter((item) => draft.mediaIds.includes(item.id)), [availableMedia, draft.mediaIds]);

  const handleSelectReport = async (report: BugReportDraft) => {
    if (!confirm(`Open edit form for bug report ${report.title || report.id}?`)) return;
    setSelectedId(report.id);
    setDraft({ ...report, evidence: report.evidence ?? [] });
    setIsSaved(true);
    if (report.projectId) await loadTickets(report.projectId);
    if (report.ticketId) await loadMedia(report.ticketId);
  };

  const handleCreateNew = async () => {
    const context = await window.testerbuddy?.getActiveCaptureContext();
    const next = EMPTY_DRAFT();
    next.projectId = context?.projectId ?? draft.projectId;
    next.ticketId = context?.ticketId ?? draft.ticketId;
    setSelectedId(next.id);
    setDraft(next);
    setIsSaved(false);
  };

  const handleSave = async () => {
    if (!draft.title.trim()) {
      alert("Please enter a bug title before saving.");
      return;
    }
    if (!draft.projectId || !draft.ticketId) {
      alert("Bug reports must belong to both a project and a ticket.");
      return;
    }
    if (selectedId && isSaved && !confirm(`Update bug report ${draft.title}?`)) {
      return;
    }
    const payload = normalizeDraft(draft, selectedEvidence);
    const saved = await window.testerbuddy?.saveBugReport(payload);
    if (saved) {
      setDraft(saved as BugReportDraft);
      setSelectedId((saved as BugReportDraft).id);
      setIsSaved(true);
      await loadReports({ projectId: draft.projectId, ticketId: draft.ticketId });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await window.testerbuddy?.deleteBugReport(deleteTarget.id);
    if (selectedId === deleteTarget.id) {
      await handleCreateNew();
    }
    await loadReports({ projectId: draft.projectId || undefined, ticketId: draft.ticketId || undefined });
    setDeleteTarget(null);
  };

  const handleExport = async (format: "markdown" | "html") => {
    const res = await window.testerbuddy?.exportBug(normalizeDraft(draft, selectedEvidence) as unknown as BugReportDraft, format);
    if (res?.success && res.filePath) {
      alert(`Bug report exported to:\n${res.filePath}`);
    } else if (res?.reason) {
      alert(res.reason);
    }
  };

  const handleIssueExport = async (format: IssueExportFormat) => {
    const config = format === "jira" ? promptForJiraConfig() : promptForGitHubConfig();
    if (!config) return;
    const res = await window.testerbuddy?.exportBug(normalizeDraft(draft, selectedEvidence) as unknown as BugReportDraft, format, config);
    if (res?.success && res.issueUrl) {
      alert(`Bug report exported successfully to:\n${res.issueUrl}`);
    } else {
      alert(res?.reason || "Issue export failed.");
    }
  };

  return (
    <>
      <div className="flex h-full min-h-0 bg-[#f7f8fb]">
        <aside className="w-72 shrink-0 border-r border-border bg-surface flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <p className="text-sm font-semibold text-text">Saved Reports</p>
              <p className="text-2xs text-text-muted">{reports.length} report(s) in scope</p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => void handleCreateNew()}>
              <Plus size={15} />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {reports.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-xs text-text-muted text-center">No saved bug reports.</div>
            ) : reports.map((report) => {
              const active = report.id === selectedId;
              return (
                <button key={report.id} type="button" onClick={() => void handleSelectReport(report)} className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-primary bg-primary/5" : "border-border bg-bg hover:bg-surface-muted"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${active ? "text-primary" : "text-text"}`}>{report.title || "Untitled Bug"}</p>
                      <p className="mt-1 text-2xs text-text-muted">{report.ticketId || "Unscoped"}</p>
                    </div>
                    <span onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: report.id, title: report.title || report.id }); }} className="rounded p-1 text-text-muted hover:text-error">
                      <Trash2 size={12} />
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={SEVERITY_CONFIG[report.severity].variant}>{SEVERITY_CONFIG[report.severity].label}</Badge>
                    <span className="text-2xs text-text-muted">{report.createdAt ? new Date(report.createdAt).toLocaleDateString() : "Draft"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-8 py-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <h1 className="text-base font-semibold text-text">Bug Report Builder</h1>
                <p className="text-2xs text-text-muted">Bugs inherit project-ticket context and attach media from the ticket evidence pool.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void handleSave()}>
                  {isSaved ? <><Check size={13} className="text-success" />Saved</> : <><Save size={13} />Save Draft</>}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void handleExport("markdown")}><Download size={13} />Export MD</Button>
                <Button type="button" size="sm" onClick={() => void handleExport("html")}><Download size={13} />Export HTML</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void handleIssueExport("jira")}><Download size={13} />Export Jira</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void handleIssueExport("github")}><Download size={13} />Export GitHub</Button>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.25fr_.95fr]">
              <div className="space-y-5">
                <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Project">
                      <select value={draft.projectId} onChange={(e) => {
                        setField("projectId", e.target.value);
                        setField("ticketId", "");
                        setField("mediaIds", []);
                      }} className="h-10 w-full rounded border border-border bg-surface px-3 text-sm text-text">
                        <option value="">Select project</option>
                        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Ticket">
                      <select value={draft.ticketId} onChange={(e) => {
                        setField("ticketId", e.target.value);
                        setField("mediaIds", []);
                      }} className="h-10 w-full rounded border border-border bg-surface px-3 text-sm text-text">
                        <option value="">Select ticket</option>
                        {tickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.code} · {ticket.title}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedProject && <Badge variant="primary">Project: {selectedProject.name}</Badge>}
                    {selectedTicket && <Badge variant="warning">Ticket: {selectedTicket.code}</Badge>}
                    {selectedTicket?.externalUrl && <a href={selectedTicket.externalUrl} className="text-xs text-primary underline-offset-2 hover:underline">Open external ticket</a>}
                  </div>
                  <Field label="Bug Title">
                    <Input value={draft.title} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. Checkout freezes after applying coupon" />
                  </Field>
                  <Field label="Severity">
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(SEVERITY_CONFIG) as Severity[]).map((severity) => (
                        <button key={severity} type="button" onClick={() => setField("severity", severity)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${draft.severity === severity ? "border-primary bg-primary/10 text-primary" : "border-border bg-bg text-text-muted"}`}>
                          {SEVERITY_CONFIG[severity].label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </section>

                <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
                  <Field label="Description / Context">
                    <Textarea rows={4} value={draft.description} onChange={(e) => setField("description", e.target.value)} placeholder="Explain the business context and impact." />
                  </Field>
                  <Field label="Steps to Reproduce">
                    <Textarea rows={6} value={draft.stepsToReproduce} onChange={(e) => setField("stepsToReproduce", e.target.value)} placeholder="1. Open page..." className="font-mono" />
                  </Field>
                  <Field label="Linked Timeline Steps">
                    {draft.steps.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-4 text-xs text-text-muted text-center">No structured timeline steps linked yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {draft.steps.map((step, index) => (
                          <div key={`${step.ts}-${index}`} className="rounded-xl border border-border bg-bg p-3">
                            <p className="text-sm font-medium text-text">{summarizeEvent(step.event)}</p>
                            <p className="mt-1 text-2xs text-text-muted">{new Date(step.ts).toLocaleString()} · {step.sessionId}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </Field>
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                    <Field label="Expected Result">
                      <Textarea rows={4} value={draft.expectedResult} onChange={(e) => setField("expectedResult", e.target.value)} placeholder="What should happen?" />
                    </Field>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                    <Field label="Actual Result">
                      <Textarea rows={4} value={draft.actualResult} onChange={(e) => setField("actualResult", e.target.value)} placeholder="What actually happens?" />
                    </Field>
                  </div>
                </section>
              </div>

              <div className="space-y-5">
                <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-text">Attached Media</h2>
                      <p className="text-2xs text-text-muted">Unified evidence region for screenshots and video from the active ticket.</p>
                    </div>
                    <Badge variant="default">{selectedEvidence.length} selected</Badge>
                  </div>
                  <div className="mt-4 space-y-2">
                    {draft.ticketId === "" ? (
                      <div className="rounded-xl border border-dashed border-border p-4 text-xs text-text-muted text-center">Choose a ticket to browse evidence.</div>
                    ) : availableMedia.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-4 text-xs text-text-muted text-center">No ticket media available yet.</div>
                    ) : availableMedia.map((item) => {
                      const selected = draft.mediaIds.includes(item.id);
                      return (
                        <label key={item.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selected ? "border-primary bg-primary/5" : "border-border bg-bg"}`}>
                          <input type="checkbox" checked={selected} onChange={() => {
                            const next = selected ? draft.mediaIds.filter((id) => id !== item.id) : [...draft.mediaIds, item.id];
                            setField("mediaIds", next);
                          }} className="mt-1" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {item.kind === "video" ? <Video size={14} className="text-warning shrink-0" /> : <ImageIcon size={14} className="text-primary shrink-0" />}
                              <p className="truncate text-sm font-medium text-text">{item.filepath.split(/[\\/]/).pop()}</p>
                              <Badge variant={item.kind === "video" ? "warning" : "default"}>{item.kind}</Badge>
                            </div>
                            <p className="mt-1 truncate text-2xs text-text-muted">{item.filepath}</p>
                            <p className="mt-1 text-2xs text-text-muted">{item.bugId ? "Already attached to a bug" : "Ticket-level evidence"}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Paperclip size={14} className="text-primary" />
                    <h2 className="text-sm font-semibold text-text">Evidence Summary</h2>
                  </div>
                  <div className="mt-4 space-y-2">
                    {selectedEvidence.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-4 text-xs text-text-muted text-center">No media selected for this bug.</div>
                    ) : selectedEvidence.map((item) => (
                      <div key={item.id} className="rounded-xl border border-border bg-bg p-3">
                        <div className="flex items-center gap-2">
                          {item.kind === "video" ? <Video size={14} className="text-warning" /> : <ImageIcon size={14} className="text-primary" />}
                          <p className="truncate text-sm font-medium text-text">{item.filepath.split(/[\\/]/).pop()}</p>
                        </div>
                        <p className="mt-1 truncate text-2xs text-text-muted">{item.filepath}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </main>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Bug Report"
        description={deleteTarget ? `This will permanently delete bug report "${deleteTarget.title}".` : ""}
        confirmLabel="Delete Bug Report"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="block text-3xs font-bold uppercase tracking-wider text-text-muted">{label}</label>
      {children}
    </div>
  );
}
