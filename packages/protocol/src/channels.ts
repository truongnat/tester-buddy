export const BRIDGE_PORT = 17393;
export const BRIDGE_HOST = "127.0.0.1";
export const BRIDGE_WS_URL = `ws://${BRIDGE_HOST}:${BRIDGE_PORT}`;
export const BRIDGE_HTTP_URL = `http://${BRIDGE_HOST}:${BRIDGE_PORT}`;
export const UPLOAD_PATH = "/api/upload-video";
export const BRIDGE_UPLOAD_URL = `${BRIDGE_HTTP_URL}${UPLOAD_PATH}`;
