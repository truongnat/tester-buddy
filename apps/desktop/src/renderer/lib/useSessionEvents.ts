import { useEffect, useRef, useState } from "react";
import type { BrowserEvent } from "@testerbuddy/protocol";

export type MediaRecord = { id: string; ticketId: string; kind: "screenshot" | "video"; filepath: string; createdAt: string };
export type TimelineEntry = { id?: string; ts: number; event: BrowserEvent; media?: MediaRecord };
type SessionRecord = { id: string; connectedAt: string };

export function useSessionEvents(recording: boolean, activeTicketId: string, onMediaEvent?: (media: MediaRecord) => void) {
  const [events, setEvents] = useState<TimelineEntry[]>([]);
  const activeSessionIdRef = useRef("");
  const activeTabIdRef = useRef("tab");
  const onMediaEventRef = useRef(onMediaEvent);
  onMediaEventRef.current = onMediaEvent;

  useEffect(() => {
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
        onMediaEventRef.current?.(entry.media as MediaRecord);
      }
    });

    return () => {
      offEvent?.();
    };
  }, [recording, activeTicketId]);

  return { events, setEvents, activeSessionIdRef, activeTabIdRef };
}
