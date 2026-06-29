import { useRef, useState } from "react";

type SaveVideoResult = { filepath: string; media: unknown };
type MediaRecord = { id: string; ticketId: string; kind: "screenshot" | "video"; filepath: string; createdAt: string };

export function useVideoRecording(activeProjectId: string, activeTicketId: string, activeTabIdRef: { current: string }, onSaved?: (mediaId?: string) => void) {
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoStatus, setVideoStatus] = useState<{ filepath: string; mediaId?: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
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
      }) as SaveVideoResult | undefined;
      if (saved) {
        setVideoStatus({ filepath: saved.filepath, mediaId: (saved.media as MediaRecord | null)?.id });
        onSaved?.((saved.media as MediaRecord | null)?.id);
      }
      setVideoRecording(false);
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
    };
    recorder.start();
    setVideoRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  return { videoRecording, videoStatus, startRecording, stopRecording };
}
