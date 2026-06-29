import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Film, Play, Square, FolderKanban, Ticket, Bug, CheckSquare, FolderOpen, ArrowUpDown, Copy } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Select, SelectItem } from "../../components/ui/select";
import { cn } from "../../lib/cn";
import type { BrowserEvent } from "@testerbuddy/protocol";
import { EVENT_SCREENSHOT_CAPTURED } from "@testerbuddy/protocol";
import { setBugReportHandoff } from "../../lib/bug-report-handoff";

type TimelineEntry = { id?: string; ts: number; event: BrowserEvent; media?: MediaRecord };
type ProjectRecord = { id: string; name: string; key: string };
type TicketRecord = { id: string; projectId: string; code: string; title: string; status: string };
type MediaRecord = { id: string; ticketId: string; kind: "screenshot" | "video"; filepath: string; createdAt: string };

type SessionRecord = { id: string; connectedAt: string };
type EventFilter = "all" | "tab" | "network" | "console" | "user" | "navigation" | "media" | "dom";

const FILTER_LABELS: Array<{ value: EventFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "network", label: "Network" },
  { value: "user", label: "Event" },
  { value: "tab", label: "Tabs" },
  { value: "console", label: "Console" },
  { value: "navigation", label: "Navigation" },
  { value: "media", label: "Media" },
  { value: "dom", label: "DOM" },
];

const TAB_BADGE_TONES = [
  "border-sky-200 bg-sky-50 text-sky-700",
  "border-emerald-200 bg-emerald-50 text-emerald-700",
  "border-amber-200 bg-amber-50 text-amber-700",
  "border-rose-200 bg-rose-50 text-rose-700",
  "border-violet-200 bg-violet-50 text-violet-700",
  "border-cyan-200 bg-cyan-50 text-cyan-700",
  "border-lime-200 bg-lime-50 text-lime-700",
  "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
] as const;

const MAX_SEARCH_LENGTH = 120;
const MAX_SUMMARY_LENGTH = 96;
const MAX_TAB_LABEL_LENGTH = 36;
const MAX_DETAIL_BADGE_LENGTH = 56;

function summarizeEvent(event: BrowserEvent) {
  switch (event.type) {
    case "user.click":
      return `Click ${event.text ? `"${event.text}"` : event.selector}`;
    case "user.input":
      return `Type "${event.valuePreview}" on ${event.selector}`;
    case "navigation":
      return `Navigate to ${event.to}`;
    case "console.log":
      return `[${event.level}] ${event.message}`;
    case "network.request":
      return `${event.method} ${event.url}`;
    case "network.response":
      return `${event.status} response in ${event.durationMs}ms`;
    case "tab.connected":
      return `Connected ${event.title || event.url}`;
    case "tab.updated":
      return `Updated ${event.title || event.url}`;
    case "tab.switched":
      return `Switched to ${event.title || event.url || `tab #${event.tabId}`}`;
    case "tab.closed":
      return `Closed tab #${event.tabId}`;
    case "screenshot.captured":
      return "Screenshot captured";
    case "dom.snapshot":
      return `DOM snapshot for ${event.title}`;
    case "dom.highlighted":
      return `Highlighted ${event.selector}`;
    default:
      return "Unknown event";
  }
}

function clipText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function describeTab(event: BrowserEvent) {
  if (event.tabTitle) return event.tabTitle;
  if (event.tabUrl) return event.tabUrl;
  if ("tabId" in event && event.tabId !== undefined) return `tab #${event.tabId}`;
  return "unknown tab";
}

function summarizeEventLabel(event: BrowserEvent) {
  return clipText(summarizeEvent(event), MAX_SUMMARY_LENGTH);
}

function describeTabLabel(event: BrowserEvent, maxLength = MAX_TAB_LABEL_LENGTH) {
  return clipText(describeTab(event), maxLength);
}

function toFileUrl(filepath: string) {
  const normalized = filepath.replace(/\\/g, "/");
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return encodeURI(`file://${withLeadingSlash}`);
}

function tabBadgeClass(event: BrowserEvent) {
  const seed = `${event.tabId ?? ""}|${event.tabTitle ?? ""}|${event.tabUrl ?? ""}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return TAB_BADGE_TONES[hash % TAB_BADGE_TONES.length];
}

function getEntryKey(entry: TimelineEntry) {
  return entry.id ?? `${entry.ts}-${entry.event.type}-${entry.event.tabId ?? "na"}`;
}

function matchesFilter(event: BrowserEvent, filter: EventFilter) {
  if (filter === "all") return true;
  if (filter === "tab") return event.type.startsWith("tab.");
  if (filter === "network") return event.type.startsWith("network.");
  if (filter === "console") return event.type === "console.log";
  if (filter === "user") return event.type === "user.click" || event.type === "user.input";
  if (filter === "navigation") return event.type === "navigation";
  if (filter === "media") return event.type === "screenshot.captured";
  if (filter === "dom") return event.type.startsWith("dom.");
  return true;
}
export function LiveSessionScreen() {
  const navigate = useNavigate();
  const [activeProjectId, setActiveProjectId] = useState("");
  const [activeTicketId, setActiveTicketId] = useState("");
const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [events, setEvents] = useState<TimelineEntry[]>([]);
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [sortDesc, setSortDesc] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [recording, setRecording] = useState(true);
  const [recentMedia, setRecentMedia] = useState<MediaRecord[]>([]);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoStatus, setVideoStatus] = useState<{ filepath: string; mediaId?: string } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [selectedScreenshotSrc, setSelectedScreenshotSrc] = useState<string | null>(null);
  const [selectedScreenshotError, setSelectedScreenshotError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeSessionIdRef = useRef("");
  const activeTabIdRef = useRef("tab");
  const screenshotFallbackRef = useRef<(() => void) | null>(null);
  const screenshotFallbackTriedRef = useRef(false);

  const loadProjects = async () => {
    const nextProjects = ((await window.testerbuddy?.getProjects()) ?? []) as ProjectRecord[];
    setProjects(nextProjects);
    const context = await window.testerbuddy?.getActiveCaptureContext();
    const projectId = context?.projectId && nextProjects.some((item) => item.id === context.projectId) ? context.projectId : nextProjects[0]?.id ?? "";
    setActiveProjectId(projectId);
  };

  const handleVideoSaved = (mediaId?: string) => {
    void loadRecentMedia(activeTicketId);
  };

const loadRecentMedia = async (ticketId: string) => {
    if (!ticketId) {
      setRecentMedia([]);
      return;
    }
    const nextMedia = ((await window.testerbuddy?.getMedia({ ticketId })) ??
      []) as MediaRecord[];
    setRecentMedia(nextMedia);
  };
  useEffect(() => {
    if (projects.length === 0) return;
    window.testerbuddy?.getActiveCaptureContext().then((context) => {
      const projectId =
        context?.projectId && projects.some((p) => p.id === context.projectId)
          ? context.projectId
          : (projects[0]?.id ?? "");
      setActiveProjectId(projectId);
    });
  }, [projects]);

  useEffect(() => {
    const offEvent = window.testerbuddy?.onEvent((payload) => {
      const entry = payload as TimelineEntry;
      if ("tabId" in entry.event && entry.event.tabId !== undefined) {
        activeTabIdRef.current = String(entry.event.tabId);
      }
      if (recording) {
        setEvents((prev) => [entry, ...prev]);
      }
    });

    return () => {
      offEvent?.();
    };
  }, [recording, activeTicketId]);

  useEffect(() => {
    if (tickets.length === 0) {
      setActiveTicketId("");
      return;
    }
    window.testerbuddy?.getActiveCaptureContext().then((context) => {
      const next =
        context?.ticketId && tickets.some((t) => t.id === context.ticketId)
          ? context.ticketId
          : (tickets[0]?.id ?? "");
      setActiveTicketId(next);
    });
  }, [tickets]);

  useEffect(() => {
    if (!activeProjectId || !activeTicketId) return;
void window.testerbuddy?.setActiveCaptureContext({ projectId: activeProjectId, ticketId: activeTicketId });
    void loadRecentMedia(activeTicketId);
  }, [activeProjectId, activeTicketId]);

  const filteredEvents = useMemo(() => {
    const normalizedSearch = search.toLowerCase();
    const next = events.filter((entry) => {
      if (!matchesFilter(entry.event, eventFilter)) return false;
      const haystack = [
        summarizeEvent(entry.event),
        entry.event.type,
        describeTab(entry.event),
      ].join(" ").toLowerCase();
      return haystack.includes(normalizedSearch);
    });
    next.sort((a, b) => sortDesc ? b.ts - a.ts : a.ts - b.ts);
    return next;
  }, [events, search, eventFilter, sortDesc]);
  const selectedEntry = filteredEvents.find((entry) => getEntryKey(entry) === selectedKey) ?? null;
  const selectedScreenshotPath = selectedEntry?.media?.kind === "screenshot"
    ? selectedEntry.media.filepath
    : selectedEntry?.event.type === EVENT_SCREENSHOT_CAPTURED
      ? selectedEntry.event.filepath ?? null
      : null;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    if (!selectedScreenshotPath) {
      setSelectedScreenshotSrc(null);
      setSelectedScreenshotError(null);
      screenshotFallbackRef.current = null;
      screenshotFallbackTriedRef.current = false;
      return;
    }
    setSelectedScreenshotSrc(toFileUrl(selectedScreenshotPath));
    setSelectedScreenshotError(null);
    screenshotFallbackTriedRef.current = false;
    const readImageFallback = async () => {
      if (window.testerbuddy?.readImageFile) {
        const payload = await window.testerbuddy.readImageFile(selectedScreenshotPath);
        if (!payload) return null;
        const bytes = new Uint8Array(payload.bytes.byteLength);
        bytes.set(payload.bytes);
        const blob = new Blob([bytes], { type: payload.mimeType });
        return URL.createObjectURL(blob);
      }
      if (window.testerbuddy?.readImageAsDataUrl) {
        return window.testerbuddy.readImageAsDataUrl(selectedScreenshotPath);
      }
      return null;
    };
    screenshotFallbackRef.current = () => {
      if (cancelled || screenshotFallbackTriedRef.current) return;
      screenshotFallbackTriedRef.current = true;
      void readImageFallback()
        .then((src) => {
          if (cancelled) return;
          if (!src) {
            setSelectedScreenshotError(`Could not load screenshot preview: ${selectedScreenshotPath}`);
            return;
          }
          if (src.startsWith("blob:")) {
            objectUrl = src;
          }
          setSelectedScreenshotSrc(src);
        })
        .catch(() => {
          if (!cancelled) {
            setSelectedScreenshotError(`Could not load screenshot preview: ${selectedScreenshotPath}`);
          }
        });
    };
    return () => {
      cancelled = true;
      screenshotFallbackRef.current = null;
      screenshotFallbackTriedRef.current = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedScreenshotPath]);
const toggleChecked = (key: string) => {
    setCheckedKeys((prev) => prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]);
  };

  const startRecordingVideo = async () => {
    if (!activeProjectId || !activeTicketId) {
      alert("Select an active project and ticket first.");
      return;
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    mediaStreamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const buffer = await blob.arrayBuffer();
      const saved = await window.testerbuddy?.saveVideo(new Uint8Array(buffer), {
        tabId: activeTabIdRef.current,
        projectId: activeProjectId,
        ticketId: activeTicketId,
      });
      if (saved) {
        setVideoStatus({ filepath: saved.filepath, mediaId: (saved.media as MediaRecord | null)?.id });
      }
      setVideoRecording(false);
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
    };
    recorder.start();
    setVideoRecording(true);
  };

  const stopRecordingVideo = () => {
    mediaRecorderRef.current?.stop();
  };

  const createBugFromSelection = () => {
    const selectedEvents = events.filter((entry) => checkedKeys.includes(getEntryKey(entry)));
    const steps = selectedEvents.map((entry) => ({ ts: entry.ts, sessionId: activeSessionIdRef.current || "unknown", event: entry.event }));
    const mediaIds = selectedEvents
      .filter((entry) => entry.event.type === EVENT_SCREENSHOT_CAPTURED)
      .map((entry) => entry.media?.id)
      .filter(Boolean) as string[];

setBugReportHandoff({
      projectId: activeProjectId,
      ticketId: activeTicketId,
      mediaIds,
      steps,
    });
    navigate("/bugs");
  };

  const copySelectedEvent = async () => {
    if (!selectedEntry) return;
    await navigator.clipboard.writeText(JSON.stringify(selectedEntry.event, null, 2));
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 1200);
  };

  return (
    <div className="flex h-full min-h-0 bg-bg">
      <div className="flex-1 min-h-0 flex flex-col">
        <header className="border-b border-border bg-surface px-6 py-4">
          <div>
<h1 className="font-display text-lg font-semibold text-text">Live Session</h1>
            <p className="text-2xs text-text-muted">Capture screenshots and recordings directly into the active ticket.</p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={activeProjectId}
                onChange={setActiveProjectId}
                placeholder="Select project"
                className="w-[200px]"
                prefix={<FolderKanban size={14} className="text-text-muted" />}
              >
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <span className="block truncate" title={project.name}>{project.name}</span>
                  </SelectItem>
                ))}
              </Select>
              <Select
                value={activeTicketId}
                onChange={setActiveTicketId}
                placeholder="Select ticket"
                className="w-[240px]"
                prefix={<Ticket size={14} className="text-text-muted" />}
              >
                {tickets.map((ticket) => (
                  <SelectItem key={ticket.id} value={ticket.id}>
                    <span className="block truncate" title={`${ticket.code} · ${ticket.title}`}>{ticket.code} · {ticket.title}</span>
                  </SelectItem>
                ))}
              </Select>
            </div>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" className="h-10 px-4 text-sm" onClick={() => void window.testerbuddy?.captureScreenshot({ projectId: activeProjectId, ticketId: activeTicketId })}>
                <Camera size={13} />
                Capture
              </Button>
              <Button type="button" variant={videoRecording ? "destructive" : "outline"} size="sm" className="h-10 px-4 text-sm" onClick={() => void (videoRecording ? stopRecordingVideo() : startRecordingVideo())}>
                {videoRecording ? <Square size={13} /> : <Film size={13} />}
                {videoRecording ? "Stop Video" : "Record Video"}
              </Button>
              <Button type="button" size="sm" variant={recording ? "default" : "outline"} className="h-10 px-4 text-sm" onClick={() => setRecording((current) => !current)}>
                {recording ? <Square size={13} /> : <Play size={13} />}
                {recording ? "Pause Timeline" : "Resume Timeline"}
              </Button>
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-[380px_1fr]">
<aside className="border-r border-border bg-surface bg-dots p-4 flex flex-col min-h-0 gap-4">
            <div className="flex flex-wrap gap-2">
              {FILTER_LABELS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setEventFilter(item.value)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    eventFilter === item.value
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-bg text-text-muted hover:bg-surface-muted"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Input placeholder="Search events" value={search} maxLength={MAX_SEARCH_LENGTH} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button
                type="button"
                onClick={() => setSortDesc((current) => !current)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-bg text-text-muted transition hover:bg-surface-muted"
                aria-label="Toggle sort order"
                title={sortDesc ? "Newest first" : "Oldest first"}
              >
                <ArrowUpDown size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredEvents.map((entry) => {
                const key = getEntryKey(entry);
                const checked = checkedKeys.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={`w-full rounded-xl border p-3 text-left transition ${selectedKey === key ? "border-primary bg-primary/5" : "border-border bg-bg hover:bg-surface-muted"}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleChecked(key)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
<p className="truncate text-sm font-medium text-text" title={summarizeEvent(entry.event)}>{summarizeEventLabel(entry.event)}</p>
                          <span className="text-2xs text-text-muted shrink-0">{new Date(entry.ts).toLocaleTimeString()}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              tabBadgeClass(entry.event),
                            )}
                            title={describeTab(entry.event)}
                          >
                            <span className="truncate">{describeTabLabel(entry.event)}</span>
                          </span>
                          <p className="text-2xs text-text-muted">
                            {entry.media ? `${entry.media.kind} saved to ticket` : entry.event.type}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="p-6 overflow-y-auto">
            {selectedEntry ? (
<div className="space-y-4">
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-base font-semibold text-text">Event Detail</h2>
                      <p className="text-2xs text-text-muted">{new Date(selectedEntry.ts).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedEntry.media && <Badge variant="primary">Linked media</Badge>}
                      <button
                        type="button"
                        onClick={() => void copySelectedEvent()}
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-muted transition hover:bg-surface-muted"
                      >
                        <Copy size={12} />
                        {copyState === "copied" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-text break-words">{summarizeEvent(selectedEntry.event)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="default">{selectedEntry.event.type}</Badge>
                    <Badge variant="default" title={describeTab(selectedEntry.event)}>{describeTabLabel(selectedEntry.event, MAX_DETAIL_BADGE_LENGTH)}</Badge>
                  </div>
                  {selectedScreenshotPath && (
                    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-bg">
                      {selectedScreenshotSrc ? (
                        <img
                          src={selectedScreenshotSrc}
                          alt="Captured screenshot"
                          className="max-h-[420px] w-full object-contain bg-white"
                          onError={() => {
                            if (screenshotFallbackTriedRef.current) {
                              setSelectedScreenshotSrc(null);
                              setSelectedScreenshotError(selectedScreenshotPath ? `Could not load screenshot preview: ${selectedScreenshotPath}` : "Could not load screenshot preview.");
                              return;
                            }
                            screenshotFallbackRef.current?.();
                          }}
                        />
                      ) : selectedScreenshotError ? (
                        <div className="flex h-[240px] items-center justify-center px-4 text-center text-sm text-destructive">
                          {selectedScreenshotError}
                        </div>
                      ) : (
                        <div className="flex h-[240px] items-center justify-center text-sm text-text-muted">
                          Loading screenshot preview...
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
                        <p className="truncate text-2xs text-text-muted">{selectedScreenshotPath}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void window.testerbuddy?.revealFile(selectedScreenshotPath)}
                        >
                          Reveal
                        </Button>
                      </div>
                    </div>
                  )}
                  <pre className="mt-4 overflow-auto rounded-xl border border-border bg-bg p-4 font-mono text-xs leading-5 text-text">{JSON.stringify(selectedEntry.event, null, 2)}</pre>
                </div>
              </div>
            ) : (
<div className="flex h-full items-center justify-center p-8 text-center text-sm text-text-muted">
                <div className="flex flex-col items-center gap-3">
                  <FolderOpen size={32} className="text-text-muted/50" />
                  <p>Select an event to inspect.</p>
                </div>
              </div>
            )}

          </section>
        </div>
      </div>

      {checkedKeys.length > 0 && (
        <div className="fixed bottom-6 right-6 z-20 rounded-2xl border border-border bg-surface px-4 py-3 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <CheckSquare size={14} className="text-primary" />
              {checkedKeys.length} selected
            </div>
            <Button type="button" size="sm" onClick={createBugFromSelection}>
              <Bug size={13} />
              Create Bug Report
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
