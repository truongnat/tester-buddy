export const EVENT_TAB_CONNECTED = "tab.connected";
export const EVENT_TAB_UPDATED = "tab.updated";
export const EVENT_TAB_SWITCHED = "tab.switched";
export const EVENT_TAB_CLOSED = "tab.closed";
export const EVENT_USER_CLICK = "user.click";
export const EVENT_USER_INPUT = "user.input";
export const EVENT_NAVIGATION = "navigation";
export const EVENT_CONSOLE_LOG = "console.log";
export const EVENT_NETWORK_REQUEST = "network.request";
export const EVENT_NETWORK_RESPONSE = "network.response";
export const EVENT_SCREENSHOT_CAPTURED = "screenshot.captured";
export const EVENT_DOM_SNAPSHOT = "dom.snapshot";
export const EVENT_DOM_HIGHLIGHTED = "dom.highlighted";

export const COMMAND_CAPTURE_VISIBLE_TAB = "capture.visibleTab";
export const COMMAND_HIGHLIGHT_ELEMENT = "highlight.element";
export const COMMAND_CLICK = "click";
export const COMMAND_TYPE = "type";
export const COMMAND_READ_DOM = "read.dom";
export const COMMAND_GET_PAGE_CONTEXT = "get.pageContext";

export const ALL_EVENT_TYPES = [
  EVENT_TAB_CONNECTED,
  EVENT_TAB_UPDATED,
  EVENT_TAB_SWITCHED,
  EVENT_TAB_CLOSED,
  EVENT_USER_CLICK,
  EVENT_USER_INPUT,
  EVENT_NAVIGATION,
  EVENT_CONSOLE_LOG,
  EVENT_NETWORK_REQUEST,
  EVENT_NETWORK_RESPONSE,
  EVENT_SCREENSHOT_CAPTURED,
  EVENT_DOM_SNAPSHOT,
  EVENT_DOM_HIGHLIGHTED,
] as const;

export const ALL_COMMAND_TYPES = [
  COMMAND_CAPTURE_VISIBLE_TAB,
  COMMAND_HIGHLIGHT_ELEMENT,
  COMMAND_CLICK,
  COMMAND_TYPE,
  COMMAND_READ_DOM,
  COMMAND_GET_PAGE_CONTEXT,
] as const;
