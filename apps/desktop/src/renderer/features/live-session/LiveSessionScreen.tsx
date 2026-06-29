import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects } from "../../lib/useProjects";
import { useTickets } from "../../lib/useTickets";
import { useSessionEvents } from "../../lib/useSessionEvents";
import {
  Camera,
  Film,
  Play,
  Square,
  FolderKanban,
  Ticket,
  Bug,
  CheckSquare,
  FolderOpen,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Section } from "../../components/ui/section";
import { IconSelect } from "../../components/ui/icon-select";
import { EmptyState } from "../../components/ui/empty-state";
import { MediaCard } from "../../components/ui/media-card";
import type { MediaRecord } from "../../lib/useSessionEvents";
import { summarizeEvent } from "../../lib/summarizeEvent";
import { useSearch } from "../../lib/useSearch";
import { useVideoRecording } from "../../lib/useVideoRecording";
import { EVENT_SCREENSHOT_CAPTURED } from "@testerbuddy/protocol";

export function LiveSessionScreen() {
  const navigate = useNavigate();
  const [activeProjectId, setActiveProjectId] = useState("");
  const [activeTicketId, setActiveTicketId] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [recording, setRecording] = useState(true);
  const [recentMedia, setRecentMedia] = useState<MediaRecord[]>([]);

  const handleMediaEvent = (media: MediaRecord) => {
    setRecentMedia((prev) => [media, ...prev]);
  };

  const handleVideoSaved = (mediaId?: string) => {
    void loadRecentMedia(activeTicketId);
  };

  const { projects } = useProjects();
  const { tickets } = useTickets(activeProjectId);
  const { events, activeSessionIdRef, activeTabIdRef } = useSessionEvents(
    recording,
    activeTicketId,
    handleMediaEvent,
  );
  const { videoRecording, startRecording, stopRecording } =
    useVideoRecording(
      activeProjectId,
      activeTicketId,
      activeTabIdRef,
      handleVideoSaved,
    );

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
    void window.testerbuddy?.setActiveCaptureContext({
      projectId: activeProjectId,
      ticketId: activeTicketId,
    });
    void loadRecentMedia(activeTicketId);
  }, [activeProjectId, activeTicketId]);

  const {
    query: search,
    setQuery: setSearch,
    filtered: filteredEvents,
  } = useSearch(events, (entry) => summarizeEvent(entry.event));
  const selectedEntry =
    filteredEvents.find(
      (entry) => `${entry.ts}-${entry.event.type}` === selectedKey,
    ) ?? null;
  const selectedProject =
    projects.find((item) => item.id === activeProjectId) ?? null;
  const selectedTicket =
    tickets.find((item) => item.id === activeTicketId) ?? null;

  const toggleChecked = (key: string) => {
    setCheckedKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const createBugFromSelection = () => {
    const selectedEvents = events.filter((entry) =>
      checkedKeys.includes(`${entry.ts}-${entry.event.type}`),
    );
    const steps = selectedEvents.map((entry) => ({
      ts: entry.ts,
      sessionId: activeSessionIdRef.current || "unknown",
      event: entry.event,
    }));
    const mediaIds = selectedEvents
      .filter((entry) => entry.event.type === EVENT_SCREENSHOT_CAPTURED)
      .map((entry) => entry.media?.id)
      .filter(Boolean) as string[];

    sessionStorage.setItem(
      "testerbuddy:temp_steps_json",
      JSON.stringify(steps),
    );
    sessionStorage.setItem("testerbuddy:temp_project_id", activeProjectId);
    sessionStorage.setItem("testerbuddy:temp_ticket_id", activeTicketId);
    sessionStorage.setItem(
      "testerbuddy:temp_media_ids",
      JSON.stringify(mediaIds),
    );
    navigate("/bugs");
  };

  return (
    <div className="flex h-full min-h-0 bg-[#f7f8fb]">
      <div className="flex-1 min-h-0 flex flex-col">
        <header className="border-b border-border bg-surface px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-text">Live Session</h1>
            <p className="text-2xs text-text-muted">
              Capture screenshots and recordings directly into the active
              ticket.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <IconSelect
              icon={FolderKanban}
              value={activeProjectId}
              onChange={setActiveProjectId}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Select project"
            />
            <IconSelect
              icon={Ticket}
              value={activeTicketId}
              onChange={setActiveTicketId}
              options={tickets.map((t) => ({
                value: t.id,
                label: `${t.code} · ${t.title}`,
              }))}
              placeholder="Select ticket"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void window.testerbuddy?.captureScreenshot({
                  projectId: activeProjectId,
                  ticketId: activeTicketId,
                })
              }
            >
              <Camera size={13} />
              Capture
            </Button>
            <Button
              type="button"
              variant={videoRecording ? "destructive" : "outline"}
              size="sm"
              onClick={() =>
                void (videoRecording ? stopRecording() : startRecording())
              }
            >
              {videoRecording ? <Square size={13} /> : <Film size={13} />}
              {videoRecording ? "Stop Video" : "Record Video"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={recording ? "default" : "outline"}
              onClick={() => setRecording((current) => !current)}
            >
              {recording ? <Square size={13} /> : <Play size={13} />}
              {recording ? "Pause Timeline" : "Resume Timeline"}
            </Button>
          </div>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-[380px_1fr]">
          <aside className="border-r border-border bg-surface p-4 flex flex-col min-h-0 gap-4">
            <Input
              placeholder="Search events"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredEvents.map((entry) => {
                const key = `${entry.ts}-${entry.event.type}`;
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
                          <p className="truncate text-sm font-medium text-text">
                            {summarizeEvent(entry.event)}
                          </p>
                          <span className="text-2xs text-text-muted shrink-0">
                            {new Date(entry.ts).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="mt-1 text-2xs text-text-muted">
                          {entry.media
                            ? `${entry.media.kind} saved to ticket`
                            : entry.event.type}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="p-6 overflow-y-auto">
            {selectedEntry ? (
              <Section
                title="Event Detail"
                description={new Date(selectedEntry.ts).toLocaleString()}
                badge={
                  selectedEntry.media ? (
                    <Badge variant="primary">Linked media</Badge>
                  ) : undefined
                }
              >
                <p className="text-sm text-text">
                  {summarizeEvent(selectedEntry.event)}
                </p>
                <pre className="mt-4 overflow-auto rounded-xl border border-border bg-bg p-4 text-xs text-text">
                  {JSON.stringify(selectedEntry.event, null, 2)}
                </pre>
              </Section>
            ) : (
              <EmptyState
                icon={FolderOpen}
                message="Select an event to inspect."
              />
            )}

            <Section
              className="mt-6"
              title="Recent Ticket Media"
              description="Media saved into the active ticket appears here immediately."
              badge={<Badge>{recentMedia.length}</Badge>}
            >
              {recentMedia.length === 0 ? (
                <EmptyState
                  message="No media saved for this ticket yet."
                  compact
                />
              ) : (
                <div className="space-y-2">
                  {recentMedia.slice(0, 8).map((item) => (
                    <MediaCard
                      key={item.id}
                      filepath={item.filepath}
                      kind={item.kind}
                    />
                  ))}
                </div>
              )}
            </Section>
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
