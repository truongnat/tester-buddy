// IPC channel definitions — typed bridge between renderer and main
export const IPC = {
  GET_PAIRING_TOKEN: "bridge:get-pairing-token",
  GET_SESSIONS: "bridge:get-sessions",
  GET_CONNECTION_COUNT: "bridge:get-connection-count",
  CAPTURE_SCREENSHOT: "capture:screenshot",
  EXPORT_BUG: "bug:export",
  GET_EVENTS: "session:get-events",
  SAVE_BUG_REPORT: "bug:save",
  GET_BUG_REPORTS: "bug:get-all",
  DELETE_BUG_REPORT: "bug:delete",
  SAVE_VIDEO: "video:save",
  REVEAL_FILE: "file:reveal",
  // Push (main→renderer) channel names
  SESSION_EVENT: "session:event",
  SESSION_VIDEO_PROGRESS: "session:video-progress",
  SESSION_VIDEO_SAVED: "session:video-saved",
  BRIDGE_CONNECTION_CHANGE: "bridge:connection-change",
} as const;
