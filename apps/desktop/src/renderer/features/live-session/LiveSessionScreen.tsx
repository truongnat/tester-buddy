import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Square, Play, MousePointer, Navigation, AlertCircle, Globe, Terminal, CheckSquare, Layers, Search, ArrowUpDown, ChevronRight, Copy, Check, Video } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/cn";
import type { BrowserEvent } from "@testerbuddy/protocol";
import React from "react";

type TimelineEntry = { ts: number; event: BrowserEvent };

const EVENT_META: Record<BrowserEvent["type"], { icon: any; borderClass: string; textClass: string; label: string }> = {
  "user.click":         { icon: MousePointer, borderClass: "border-l-primary",    textClass: "text-primary",     label: "Click" },
  "user.input":         { icon: Terminal,     borderClass: "border-l-text-muted", textClass: "text-text-muted",  label: "Input" },
  "navigation":         { icon: Navigation,   borderClass: "border-l-indigo-500", textClass: "text-indigo-500",  label: "Navigate" },
  "console.error":      { icon: AlertCircle,  borderClass: "border-l-error",      textClass: "text-error",       label: "Error" },
  "network.request":    { icon: Globe,        borderClass: "border-l-gray-300",   textClass: "text-text-muted",  label: "Request" },
  "network.response":   { icon: Globe,        borderClass: "border-l-gray-300",   textClass: "text-text-muted",  label: "Response" },
  "screenshot.captured":{ icon: Camera,       borderClass: "border-l-success",    textClass: "text-success",     label: "Screenshot" },
  "tab.connected":      { icon: Layers,       borderClass: "border-l-primary",    textClass: "text-primary",     label: "Tab" },
};

type FilterType = "all" | "errors" | "actions" | "network" | "navigation";

function EventRow({
  entry,
  selected,
  checked,
  onSelect,
  onCheck,
}: {
  entry: TimelineEntry;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onCheck: (e: React.MouseEvent) => void;
}) {
  const meta = EVENT_META[entry.event.type] ?? { icon: Terminal, borderClass: "border-l-gray-300", textClass: "text-text-muted", label: "Unknown" };
  const Icon = meta.icon;
  const time = new Date(entry.ts).toLocaleTimeString("en-GB", { hour12: false });
  const isError = entry.event.type === "console.error" || (entry.event.type === "network.response" && entry.event.status >= 400);

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-start gap-2.5 px-3 py-2 cursor-pointer border-b border-border hover:bg-surface-muted transition-all duration-200 border-l-3 relative",
        meta.borderClass,
        selected ? "bg-primary/5 shadow-inner" : "bg-surface",
        isError && "bg-error/3"
      )}
    >
      <div className="pt-0.5 z-10" onClick={onCheck}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => {}}
          className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer transition-all"
        />
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={cn("p-1 rounded-md bg-bg shrink-0", isError ? "text-error" : meta.textClass)}>
              <Icon size={12} />
            </span>
            <span className="text-3xs font-mono text-text-muted">{time}</span>
          </div>
          <div className="flex items-center gap-1">
            {entry.event.type === "network.response" && (
              <span className={cn("text-3xs font-bold font-mono px-1 py-0.5 rounded bg-bg", entry.event.status >= 400 ? "text-error" : "text-success")}>
                {entry.event.status}
              </span>
            )}
            <ChevronRight size={10} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <p className="text-xs text-text font-medium truncate pr-2">
          {getEventSummary(entry.event)}
        </p>
      </div>
    </div>
  );
}

function getSafePathname(urlStr: string): string {
  try {
    return new URL(urlStr).pathname;
  } catch {
    return urlStr;
  }
}

function getSafeHostname(urlStr: string): string {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return urlStr;
  }
}

function getEventSummary(e: BrowserEvent): string {
  switch (e.type) {
    case "user.click":
      const cleanSelector = e.selector.split(">").pop()?.trim() || e.selector;
      return `Click ${e.text ? `"${e.text}"` : cleanSelector}`;
    case "user.input":
      const inputSelector = e.selector.split(">").pop()?.trim() || e.selector;
      return `Type "${e.valuePreview}" on ${inputSelector}`;
    case "navigation":
      return `Navigated to ${getSafePathname(e.to)}`;
    case "console.error":
      return e.message;
    case "network.request":
      return `${e.method} ${getSafePathname(e.url)}`;
    case "network.response":
      return `${e.status} — ${e.durationMs}ms`;
    case "tab.connected":
      return `Connected: ${getSafeHostname(e.url)}`;
    case "screenshot.captured":
      return `Screenshot Captured`;
    default:
      return `Event: ${e.type}`;
  }
}

export function LiveSessionScreen() {
  const navigate = useNavigate();
  const [recording, setRecording] = useState(false);
  const [events, setEvents] = useState<TimelineEntry[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEntry | null>(null);
  const [checkedTs, setCheckedTs] = useState<Set<number>>(new Set());
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [videoRecording, setVideoRecording] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [modalProjectId, setModalProjectId] = useState("project-1");
  const [modalTicketId, setModalTicketId] = useState("ticket-101");
  const [isConverting, setIsConverting] = useState(false);
  const [conversionResultPath, setConversionResultPath] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordMetaRef = useRef({ projectId: "", ticketId: "" });


  const startVideoRecording = async (projId: string, tickId: string) => {
    try {
      recordedChunksRef.current = [];
      recordMetaRef.current = { projectId: projId, ticketId: tickId };
      setConversionResultPath(null);

      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      mediaStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : "video/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const buffer = await blob.arrayBuffer();
        const meta = recordMetaRef.current;

        setIsConverting(true);
        try {
          const result = await window.testerbuddy?.saveVideo(
            new Uint8Array(buffer),
            { tabId: "", projectId: meta.projectId, ticketId: meta.ticketId }
          );
          if (result) {
            setConversionResultPath(result);
          }
        } catch (err) {
          console.error("Failed to save video:", err);
        } finally {
          setIsConverting(false);
          setVideoRecording(false);
        }

        mediaRecorderRef.current = null;
        mediaStreamRef.current = null;
      };

      recorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        setVideoRecording(false);
        mediaRecorderRef.current = null;
        mediaStreamRef.current = null;
      };

      recorder.start();
      setVideoRecording(true);
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "AbortError") {
        // User cancelled the picker — do nothing
        return;
      }
      console.error("Failed to start video recording:", err);
      alert("Failed to start video recording: " + (err?.message || err));
    }
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const recordingRef = useRef(recording);
  recordingRef.current = recording;

  // Load historical events of the active session on mount
  useEffect(() => {
    window.testerbuddy?.getSessions().then((sessions) => {
      if (sessions && sessions.length > 0) {
        // Sort sessions by connection time (most recent first)
        sessions.sort((a: any, b: any) => new Date(b.connectedAt).getTime() - new Date(a.connectedAt).getTime());
        const activeSession = sessions[0];
        window.testerbuddy?.getEvents(activeSession.id).then((historicalEvents) => {
          if (historicalEvents) {
            setEvents(historicalEvents);
          }
        });
      }
    });

    const unsubscribe = window.testerbuddy?.onEvent((payload: unknown) => {
      if (!recordingRef.current) return;
      const { event, ts } = payload as { event: BrowserEvent; ts: number };
      setEvents((prev) => [...prev, { ts, event }]);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleCheck = (ts: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedTs((prev) => {
      const next = new Set(prev);
      if (next.has(ts)) {
        next.delete(ts);
      } else {
        next.add(ts);
      }
      return next;
    });
  };

  const clearSelection = () => setCheckedTs(new Set());

  // Filter events
  const filteredEvents = events.filter((e) => {
    if (activeFilter !== "all") {
      if (activeFilter === "errors") {
        const isErr = e.event.type === "console.error" || (e.event.type === "network.response" && e.event.status >= 400);
        if (!isErr) return false;
      } else if (activeFilter === "actions") {
        if (e.event.type !== "user.click" && e.event.type !== "user.input") return false;
      } else if (activeFilter === "network") {
        if (e.event.type !== "network.request" && e.event.type !== "network.response") return false;
      } else if (activeFilter === "navigation") {
        if (e.event.type !== "navigation" && e.event.type !== "tab.connected") return false;
      }
    }

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const summary = getEventSummary(e.event).toLowerCase();
      const typeLabel = EVENT_META[e.event.type].label.toLowerCase();
      return summary.includes(q) || typeLabel.includes(q);
    }

    return true;
  });

  // Sort events
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    return sortNewestFirst ? b.ts - a.ts : a.ts - b.ts;
  });

  // Get active tab title/url for header display
  const activeTabEvent = [...events]
    .reverse()
    .find((e) => e.event.type === "tab.connected");
  const activeTabTitle = activeTabEvent ? (activeTabEvent.event as any).title : null;

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      {/* Premium Header */}
      <header className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border/80 bg-surface shadow-sm z-10">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-base text-text tracking-tight">Live Session</h1>
          {activeTabTitle && (
            <span className="text-xs text-text-muted font-medium border-l border-border/60 pl-3">
              Target: <span className="text-text font-semibold">{activeTabTitle}</span>
            </span>
          )}
          {recording ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-error/10 text-error animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-error" />
              Recording
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-muted text-text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted" />
              Idle
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={videoRecording ? "destructive" : "soft"}
            size="sm"
            onClick={videoRecording ? stopVideoRecording : () => setShowRecordModal(true)}
            className="h-8 px-3 rounded-lg transition-colors font-semibold"
          >
            {videoRecording ? (
              <>
                <Square size={11} className="animate-pulse" />
                Stop Video
              </>
            ) : (
              <>
                <Video size={13} />
                Record Video
              </>
            )}
          </Button>
          <Button
            variant="soft"
            size="sm"
            onClick={() => window.testerbuddy?.captureScreenshot()}
            className="h-8 px-3 rounded-lg transition-colors font-semibold"
          >
            <Camera size={13} />
            Capture
          </Button>
          <Button
            variant={recording ? "destructive" : "default"}
            size="sm"
            onClick={() => setRecording((r) => !r)}
            className="h-8 px-3 rounded-lg shadow-sm font-semibold"
          >
            {recording ? <><Square size={11} /> Stop</> : <><Play size={11} /> Record</>}
          </Button>
        </div>
      </header>

      {/* Body Layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left Side: Timeline column */}
        <div className="w-[360px] shrink-0 flex flex-col border-r border-border/60 bg-surface shadow-sm">
          
          {/* Elegant Search & Filter Panel */}
          <div className="p-4 border-b border-border/60 space-y-3 bg-surface">
            {/* Search Pill */}
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1 flex items-center h-8">
                <Search size={13} className="absolute left-3 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-9 pr-3 bg-bg/50 border border-border/80 rounded-lg text-xs text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary focus:bg-surface transition-all"
                />
              </div>
              <Button
                variant="soft"
                size="icon"
                onClick={() => setSortNewestFirst((s) => !s)}
                title={sortNewestFirst ? "Sort: Newest First" : "Sort: Oldest First"}
                className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center"
              >
                <ArrowUpDown size={13} className={cn("transition-transform duration-200", sortNewestFirst && "rotate-180")} />
              </Button>
            </div>

            {/* Premium Category Filter Pills */}
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
              {(["all", "errors", "actions", "network", "navigation"] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-2xs font-medium border transition-all duration-200 capitalize whitespace-nowrap",
                    activeFilter === f
                      ? "bg-primary/5 border-primary/30 text-primary font-semibold shadow-2xs"
                      : "bg-surface border-border/80 text-text-muted hover:bg-surface-muted hover:text-text"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline List Scroll Container */}
          <div className="flex-1 overflow-y-auto bg-surface/50 divide-y divide-border/40 relative no-scrollbar">
            {sortedEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-4/5 gap-3 text-text-muted p-6 text-center">
                <Play size={32} className="opacity-20 animate-pulse text-primary" />
                <p className="text-xs font-semibold text-text">No events matches filters</p>
                <p className="text-2xs text-text-muted max-w-[200px]">
                  {recording ? "Perform actions in your paired tab to begin capturing events." : "Click Record to start capturing live events."}
                </p>
              </div>
            ) : (
              sortedEvents.map((e) => (
                <EventRow
                  key={e.ts}
                  entry={e}
                  selected={selectedEvent === e}
                  checked={checkedTs.has(e.ts)}
                  onSelect={() => setSelectedEvent(e)}
                  onCheck={(evt) => handleCheck(e.ts, evt)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Side: Detailed Event Details Workspace */}
        <div className="flex-1 p-5 overflow-y-auto bg-bg min-w-0 no-scrollbar">
          {selectedEvent !== null ? (
            <EventDetail entry={selectedEvent} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
              <div className="p-4 rounded-full bg-surface border border-border/60 shadow-2xs">
                <ChevronRight size={24} className="text-text-muted/60" />
              </div>
              <p className="text-xs font-medium">Select any event from the timeline to analyze detailed payload</p>
            </div>
          )}
        </div>
      </div>

      {/* Luxury Glassmorphic Floating Action Bar */}
      {checkedTs.size > 0 && (
        <div className="fixed bottom-6 left-96 right-6 mx-auto max-w-xl z-20">
          <div className="bg-surface/90 border border-border shadow-lg rounded-2xl p-3 flex items-center justify-between backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-300">
            <div className="flex items-center gap-2 pl-2">
              <CheckSquare size={14} className="text-primary" />
              <span className="text-xs font-semibold text-text">
                {checkedTs.size} step{checkedTs.size > 1 ? "s" : ""} selected
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="soft" size="sm" onClick={clearSelection}>
                Clear
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  const selectedList = events
                    .filter((e) => checkedTs.has(e.ts))
                    .sort((a, b) => a.ts - b.ts);
                  const steps = selectedList.map((e) => getEventSummary(e.event));
                  const screenshots = selectedList
                    .filter((e) => e.event.type === "screenshot.captured" && (e.event as any).dataUrl)
                    .map((e) => (e.event as any).dataUrl);

                  sessionStorage.setItem("testerbuddy:temp_steps", JSON.stringify(steps));
                  sessionStorage.setItem("testerbuddy:temp_screenshots", JSON.stringify(screenshots));
                  navigate("/bugs");
                }}
                className="shadow-sm font-semibold rounded-lg"
              >
                Create Bug Report
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Project & Ticket Metadata Dialog Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xl w-full max-w-sm space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-sm font-semibold text-text tracking-tight">Record Tab Video</h3>
              <p className="text-3xs text-text-muted mt-0.5">Specify metadata coordinates for folder mapping.</p>
            </div>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-3xs font-bold text-text-muted uppercase tracking-wider block">Project ID</label>
                <input
                  type="text"
                  value={modalProjectId}
                  onChange={(e) => setModalProjectId(e.target.value)}
                  className="w-full h-8 px-2.5 bg-bg/50 border border-border/80 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface font-semibold"
                  placeholder="e.g. project-1"
                />
              </div>

              <div className="space-y-1">
                <label className="text-3xs font-bold text-text-muted uppercase tracking-wider block">Ticket ID</label>
                <input
                  type="text"
                  value={modalTicketId}
                  onChange={(e) => setModalTicketId(e.target.value)}
                  className="w-full h-8 px-2.5 bg-bg/50 border border-border/80 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface font-semibold"
                  placeholder="e.g. ticket-101"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button 
                variant="soft" 
                size="sm" 
                onClick={() => setShowRecordModal(false)}
                className="h-8 font-semibold rounded-lg"
              >
                Cancel
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => {
                  setShowRecordModal(false);
                  startVideoRecording(modalProjectId, modalTicketId);
                }}
                className="h-8 font-semibold rounded-lg shadow-sm"
              >
                Start Recording
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Mini notification in bottom-right corner for video conversion & save status */}
      {(isConverting || conversionResultPath) && (
        <div className="fixed bottom-6 right-6 z-50 w-80 bg-surface/95 border border-border/80 shadow-xl rounded-xl p-3.5 backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 duration-300">
          {isConverting ? (
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 shrink-0 rounded-full border-2 border-t-primary border-r-border/20 border-b-border/20 border-l-border/20 animate-spin" />
              <div className="flex-1 min-w-0">
                <p className="text-2xs font-semibold text-text">Converting video...</p>
                <p className="text-3xs text-text-muted mt-0.5">Processing tab recording to MP4</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <div className="p-1 rounded-md bg-success/10 text-success shrink-0 mt-0.5">
                  <Video size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xs font-bold text-text">Recording Saved</p>
                  <p className="text-3xs text-text-muted truncate mt-0.5" title={conversionResultPath ?? ""}>
                    {conversionResultPath}
                  </p>
                </div>
                <button 
                  onClick={() => setConversionResultPath(null)}
                  className="text-text-muted hover:text-text text-3xs font-semibold shrink-0"
                >
                  Dismiss
                </button>
              </div>
              <div className="flex gap-2 justify-end">
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => {
                    if (conversionResultPath) {
                      window.testerbuddy?.revealFile(conversionResultPath);
                    }
                  }}
                  className="h-7 text-3xs font-semibold rounded-lg shadow-sm px-3"
                >
                  Open Folder
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EventDetail({ entry }: { entry: TimelineEntry }) {
  const meta = EVENT_META[entry.event.type] ?? { icon: Terminal, borderClass: "border-l-gray-300", textClass: "text-text-muted", label: "Unknown" };
  const dataUrl = (entry.event as any).dataUrl;
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"friendly" | "raw">("friendly");

  const cleanEvent = { ...entry.event };
  if ((cleanEvent as any).dataUrl) {
    delete (cleanEvent as any).dataUrl;
  }

  const copyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(cleanEvent, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderProperty = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-3 gap-2 py-2.5 border-b border-border/40 items-start text-xs">
      <span className="font-semibold text-text-muted capitalize tracking-tight">{label}</span>
      <div className="col-span-2 text-text break-all">{value}</div>
    </div>
  );

  const renderFriendlyDetails = () => {
    const e = entry.event;
    switch (e.type) {
      case "user.click":
        return (
          <div className="divide-y divide-border/30">
            {renderProperty("Element Text", e.text ? <span className="font-semibold">"{e.text}"</span> : <span className="italic text-text-muted">None</span>)}
            {renderProperty("Coordinates", <span className="font-mono text-2xs bg-bg px-1.5 py-0.5 rounded border border-border/60">X: {(e as any).x}, Y: {(e as any).y}</span>)}
            {renderProperty("Selector", <code className="text-2xs font-mono text-primary bg-primary/5 px-1.5 py-0.5 rounded break-all">{e.selector}</code>)}
          </div>
        );
      case "user.input":
        return (
          <div className="divide-y divide-border/30">
            {renderProperty("Input Value", <span className="font-mono text-2xs bg-primary/5 text-primary border border-primary/20 px-2 py-0.5 rounded font-semibold break-all">{e.valuePreview}</span>)}
            {renderProperty("Selector", <code className="text-2xs font-mono text-text bg-bg px-1.5 py-0.5 rounded break-all">{e.selector}</code>)}
          </div>
        );
      case "navigation":
        return (
          <div className="divide-y divide-border/30">
            {renderProperty("Source URL", <span className="font-mono text-2xs text-text-muted">{e.from}</span>)}
            {renderProperty("Destination URL", <span className="font-mono text-2xs text-primary font-semibold">{e.to}</span>)}
          </div>
        );
      case "console.error":
        return (
          <div className="divide-y divide-border/30">
            {renderProperty("Error Message", <span className="text-error font-semibold leading-relaxed">{e.message}</span>)}
            {e.stack && renderProperty("Stack Trace", (
              <pre className="text-3xs font-mono text-text-muted p-2 bg-bg border border-border/60 rounded max-h-48 overflow-y-auto whitespace-pre-wrap break-all leading-normal">
                {e.stack}
              </pre>
            ))}
          </div>
        );
      case "network.request":
        return (
          <div className="divide-y divide-border/30">
            {renderProperty("Method", <Badge variant="primary" className="text-3xs uppercase font-bold">{e.method}</Badge>)}
            {renderProperty("Endpoint URL", <span className="font-mono text-2xs text-text break-all">{e.url}</span>)}
          </div>
        );
      case "network.response":
        const isErr = e.status >= 400;
        return (
          <div className="divide-y divide-border/30">
            {renderProperty("HTTP Status", <Badge variant={isErr ? "error" : "success"} className="text-3xs font-bold">{e.status}</Badge>)}
            {renderProperty("Duration", <span className="font-mono text-2xs font-semibold">{e.durationMs}ms</span>)}
            {renderProperty("Method", <span className="font-semibold text-3xs uppercase text-text-muted font-mono">{e.method}</span>)}
            {renderProperty("URL Endpoint", <span className="font-mono text-2xs text-text-muted break-all">{e.url}</span>)}
          </div>
        );
      case "tab.connected":
        return (
          <div className="divide-y divide-border/30">
            {renderProperty("Tab Title", <span className="font-semibold text-text">{e.title}</span>)}
            {renderProperty("URL", <span className="font-mono text-2xs text-primary break-all">{e.url}</span>)}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-surface border border-border/60 rounded-2xl p-5 shadow-sm font-sans flex flex-col h-full min-h-0">
      {/* Top Inspector Header */}
      <div className="flex items-center justify-between border-b border-border/50 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant={entry.event.type === "console.error" ? "error" : "primary"} className="px-2.5 py-0.5 rounded-md font-semibold text-2xs uppercase tracking-wider">
            {meta.label}
          </Badge>
          <span className="text-xs text-text-muted font-mono font-medium">
            {new Date(entry.ts).toLocaleTimeString()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Toggle */}
          {entry.event.type !== "screenshot.captured" && (
            <div className="flex items-center gap-1 bg-bg border border-border/60 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab("friendly")}
                className={`px-2 py-0.5 rounded-md text-3xs font-bold transition-all ${
                  activeTab === "friendly"
                    ? "bg-surface text-primary shadow-2xs font-extrabold"
                    : "text-text-muted hover:text-text"
                }`}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab("raw")}
                className={`px-2 py-0.5 rounded-md text-3xs font-bold transition-all ${
                  activeTab === "raw"
                    ? "bg-surface text-primary shadow-2xs font-extrabold"
                    : "text-text-muted hover:text-text"
                }`}
              >
                Raw JSON
              </button>
            </div>
          )}

          {/* Copy Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={copyPayload}
            className="h-7 w-7 rounded-lg border border-border/60 hover:bg-bg/60 shrink-0"
            title="Copy JSON payload"
          >
            {copied ? (
              <Check size={13} className="text-success" />
            ) : (
              <Copy size={13} className="text-text-muted" />
            )}
          </Button>
        </div>
      </div>

      {/* Detail Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar pt-4 min-h-0">
        {entry.event.type === "screenshot.captured" && dataUrl ? (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-text">Screenshot Capture (Click to enlarge)</h3>
            <div 
              className="overflow-hidden rounded-xl border border-border/80 bg-surface shadow-2xs group relative w-full cursor-zoom-in"
              onClick={() => setShowFullscreen(true)}
            >
              <img 
                src={dataUrl} 
                alt="Captured browser screen" 
                className="w-full h-auto object-contain transform hover:scale-[1.01] transition-transform duration-300" 
              />
            </div>

            {showFullscreen && (
              <div 
                className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center cursor-zoom-out p-4 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={() => setShowFullscreen(false)}
              >
                <img 
                  src={dataUrl} 
                  alt="Full screen preview" 
                  className="max-w-[95vw] max-h-[95vh] rounded-lg shadow-2xl object-contain border border-white/10 animate-in zoom-in-95 duration-200" 
                />
              </div>
            )}
          </div>
        ) : activeTab === "friendly" ? (
          <div className="animate-in fade-in duration-200">
            {renderFriendlyDetails()}
          </div>
        ) : (
          <div className="space-y-3 animate-in fade-in duration-200 h-full flex flex-col min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-xs font-semibold text-text">Raw JSON Details</h3>
            </div>
            <div className="flex-1 min-h-0 relative rounded-xl border border-border/60 bg-surface-muted/50 p-4 text-text shadow-inner font-mono text-2xs overflow-y-auto select-text no-scrollbar">
              <pre className="whitespace-pre-wrap break-all break-words word-break-all max-w-full">
                {JSON.stringify(cleanEvent, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
