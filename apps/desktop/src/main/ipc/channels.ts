// IPC channel definitions — typed bridge between renderer and main
export const IPC = {
  GET_PAIRING_TOKEN: "bridge:get-pairing-token",
  GET_SESSIONS: "bridge:get-sessions",
  GET_CONNECTION_COUNT: "bridge:get-connection-count",
  START_SESSION: "session:start",
  STOP_SESSION: "session:stop",
  CAPTURE_SCREENSHOT: "capture:screenshot",
  EXPORT_BUG: "bug:export",
  GET_EVENTS: "session:get-events",
  SAVE_BUG_REPORT: "bug:save",
  GET_BUG_REPORTS: "bug:get-all",
  DELETE_BUG_REPORT: "bug:delete",
  SAVE_VIDEO: "video:save",
  REVEAL_FILE: "file:reveal",
  START_VIDEO: "video:start",
  STOP_VIDEO: "video:stop",
} as const;
