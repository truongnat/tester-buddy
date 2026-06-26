import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Film, Play, Square, FolderKanban, Ticket, Bug, CheckSquare, FolderOpen } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import type { BrowserEvent } from "@testerbuddy/protocol";
import { EVENT_SCREENSHOT_CAPTURED } from "@testerbuddy/protocol";

type TimelineEntry = { id?: string; ts: number; event: BrowserEvent; media?: MediaRecord };
type ProjectRecord = { id: string; name: string; key: string };
type TicketRecord = { id: string; projectId: string; code: string; title: string; status: string };
type MediaRecord = { id: string; ticketId: string; kind: "screenshot" | "video"; filepath: string; createdAt: string };

type SessionRecord = { id: string; connectedAt: string };

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

export function LiveSessionScreen() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [activeTicketId, setActiveTicketId] = useState("");
  const [events, setEvents] = useState<TimelineEntry[]>([]);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [recording, setRecording] = useState(true);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoStatus, setVideoStatus] = useState<{ filepath: string; mediaId?: string } | null>(null);
  const [recentMedia, setRecentMedia] = useState<MediaRecord[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeSessionIdRef = useRef("");
  const activeTabIdRef = useRef("tab");

  const loadProjects = async () => {
    const nextProjects = ((await window.testerbuddy?.getProjects()) ?? []) as ProjectRecord[];
    setProjects(nextProjects);
    const context = await window.testerbuddy?.getActiveCaptureContext();
    const projectId = context?.projectId && nextProjects.some((item) => item.id === context.projectId) ? context.projectId : nextProjects[0]?.id ?? "";
    setActiveProjectId(projectId);
  };

  const loadTickets = async (projectId: string, preferredTicketId?: string) => {
    const nextTickets = ((await window.testerbuddy?.getTickets(projectId)) ?? []) as TicketRecord[];
    setTickets(nextTickets);
    const context = await window.testerbuddy?.getActiveCaptureContext();
    const ticketId = preferredTicketId && nextTickets.some((item) => item.id === preferredTicketId)
      ? preferredTicketId
      : context?.ticketId && nextTickets.some((item) => item.id === context.ticketId)
        ? context.ticketId
        : nextTickets[0]?.id ?? "";
    setActiveTicketId(ticketId);
  };

  const loadRecentMedia = async (ticketId: string) => {
    if (!ticketId) {
      setRecentMedia([]);
      return;
    }
    const nextMedia = ((await window.testerbuddy?.getMedia({ ticketId })) ?? []) as MediaRecord[];
    setRecentMedia(nextMedia);
  };

  useEffect(() => {
    void loadProjects();
    window.testerbuddy?.getSessions().then((raw) => {
      const sessions = (raw ?? []) as SessionRecord[];
      if (sessions.length === 0) return;
      sessions.sort((a, b) => new Date(b.connectedAt).getTime() - new Date(a.connectedAt).getTime());
      activeSessionIdRef.current = sessions[0].id;
      window.testerbuddy?.getEvents(sessions[0].id).then((history) => {
        setEvents((history ?? []) as TimelineEntry[]);
      });
    });

    const offEvent = window.testerbuddy?.onEvent((payload) => {
      const entry = payload as TimelineEntry;
      if ("tabId" in entry.event && entry.event.tabId !== undefined) {
        activeTabIdRef.current = String(entry.event.tabId);
      }
      if (recording) {
        setEvents((prev) => [...prev, entry]);
      }
      if (entry.media && entry.media.ticketId === activeTicketId) {
        setRecentMedia((prev) => [entry.media as MediaRecord, ...prev]);
      }
    });

    return () => {
      offEvent?.();
    };
  }, [recording, activeTicketId]);

  useEffect(() => {
    if (activeProjectId) void loadTickets(activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId || !activeTicketId) return;
    void window.testerbuddy?.setActiveCaptureContext({ projectId: activeProjectId, ticketId: activeTicketId });
    void loadRecentMedia(activeTicketId);
  }, [activeProjectId, activeTicketId]);

  const filteredEvents = useMemo(() => events.filter((entry) => summarizeEvent(entry.event).toLowerCase().includes(search.toLowerCase())), [events, search]);
  const selectedEntry = filteredEvents.find((entry) => `${entry.ts}-${entry.event.type}` === selectedKey) ?? null;
  const selectedProject = projects.find((item) => item.id === activeProjectId) ?? null;
  const selectedTicket = tickets.find((item) => item.id === activeTicketId) ?? null;

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
        await loadRecentMedia(activeTicketId);
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
    const selectedEvents = events.filter((entry) => checkedKeys.includes(`${entry.ts}-${entry.event.type}`));
    const steps = selectedEvents.map((entry) => ({ ts: entry.ts, sessionId: activeSessionIdRef.current || "unknown", event: entry.event }));
    const mediaIds = selectedEvents
      .filter((entry) => entry.event.type === EVENT_SCREENSHOT_CAPTURED)
      .map((entry) => entry.media?.id)
      .filter(Boolean) as string[];

    sessionStorage.setItem("testerbuddy:temp_steps_json", JSON.stringify(steps));
    sessionStorage.setItem("testerbuddy:temp_project_id", activeProjectId);
    sessionStorage.setItem("testerbuddy:temp_ticket_id", activeTicketId);
    sessionStorage.setItem("testerbuddy:temp_media_ids", JSON.stringify(mediaIds));
    navigate("/bugs");
  };

  return (
    <div className="flex h-full min-h-0 bg-[#f7f8fb]">
      <div className="flex-1 min-h-0 flex flex-col">
        <header className="border-b border-border bg-surface px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-text">Live Session</h1>
            <p className="text-2xs text-text-muted">Capture screenshots and recordings directly into the active ticket.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2">
              <FolderKanban size={14} className="text-text-muted" />
              <select value={activeProjectId} onChange={(e) => setActiveProjectId(e.target.value)} className="bg-transparent text-sm text-text outline-none">
                <option value="">Select project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2">
              <Ticket size={14} className="text-text-muted" />
              <select value={activeTicketId} onChange={(e) => setActiveTicketId(e.target.value)} className="bg-transparent text-sm text-text outline-none">
                <option value="">Select ticket</option>
                {tickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.code} · {ticket.title}</option>)}
              </select>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void window.testerbuddy?.captureScreenshot({ projectId: activeProjectId, ticketId: activeTicketId })}>
              <Camera size={13} />
              Capture
            </Button>
            <Button type="button" variant={videoRecording ? "destructive" : "outline"} size="sm" onClick={() => void (videoRecording ? stopRecordingVideo() : startRecordingVideo())}>
              {videoRecording ? <Square size={13} /> : <Film size={13} />}
              {videoRecording ? "Stop Video" : "Record Video"}
            </Button>
            <Button type="button" size="sm" variant={recording ? "default" : "outline"} onClick={() => setRecording((current) => !current)}>
              {recording ? <Square size={13} /> : <Play size={13} />}
              {recording ? "Pause Timeline" : "Resume Timeline"}
            </Button>
          </div>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-[380px_1fr]">
          <aside className="border-r border-border bg-surface p-4 flex flex-col min-h-0 gap-4">
            <div className="rounded-2xl border border-border bg-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-text">Active Context</p>
                  <p className="text-2xs text-text-muted">Evidence is saved under this project and ticket.</p>
                </div>
                <Badge variant={selectedTicket ? "primary" : "warning"}>{selectedTicket ? "Ready" : "Required"}</Badge>
              </div>
              <p className="mt-3 text-sm text-text">{selectedProject?.name || "No project selected"}</p>
              <p className="text-xs text-text-muted">{selectedTicket ? `${selectedTicket.code} · ${selectedTicket.title}` : "Choose a ticket before capture."}</p>
              {videoStatus && <p className="mt-2 text-2xs text-success truncate">Latest video: {videoStatus.filepath}</p>}
            </div>

            <Input placeholder="Search events" value={search} onChange={(e) => setSearch(e.target.value)} />

            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredEvents.map((entry) => {
                const key = `${entry.ts}-${entry.event.type}`;
                const checked = checkedKeys.includes(key);
                return (
                  <button key={key} type="button" onClick={() => setSelectedKey(key)} className={`w-full rounded-xl border p-3 text-left transition ${selectedKey === key ? "border-primary bg-primary/5" : "border-border bg-bg hover:bg-surface-muted"}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={checked} onChange={() => toggleChecked(key)} onClick={(e) => e.stopPropagation()} className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-text">{summarizeEvent(entry.event)}</p>
                          <span className="text-2xs text-text-muted shrink-0">{new Date(entry.ts).toLocaleTimeString()}</span>
                        </div>
                        <p className="mt-1 text-2xs text-text-muted">{entry.media ? `${entry.media.kind} saved to ticket` : entry.event.type}</p>
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
                      <h2 className="text-base font-semibold text-text">Event Detail</h2>
                      <p className="text-2xs text-text-muted">{new Date(selectedEntry.ts).toLocaleString()}</p>
                    </div>
                    {selectedEntry.media && <Badge variant="primary">Linked media</Badge>}
                  </div>
                  <p className="mt-4 text-sm text-text">{summarizeEvent(selectedEntry.event)}</p>
                  <pre className="mt-4 overflow-auto rounded-xl border border-border bg-bg p-4 text-xs text-text">{JSON.stringify(selectedEntry.event, null, 2)}</pre>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-surface text-text-muted gap-3">
                <FolderOpen size={24} className="opacity-50" />
                <span className="text-sm">Select an event to inspect.</span>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-text">Recent Ticket Media</h2>
                  <p className="text-2xs text-text-muted">Media saved into the active ticket appears here immediately.</p>
                </div>
                <Badge variant="default">{recentMedia.length}</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {recentMedia.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-4 text-xs text-text-muted text-center">No media saved for this ticket yet.</div>
                ) : recentMedia.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded-xl border border-border bg-bg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-text">{item.filepath.split(/[\\/]/).pop()}</p>
                      <Badge variant={item.kind === "video" ? "warning" : "default"}>{item.kind}</Badge>
                    </div>
                    <p className="mt-1 truncate text-2xs text-text-muted">{item.filepath}</p>
                  </div>
                ))}
              </div>
            </div>
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
