import { EventRecorder } from "./event-recorder";
import { PageBridge } from "./page-bridge";
import { injectScript } from "./dom-inspector";

const bridge = new PageBridge();
const recorder = new EventRecorder(bridge);
recorder.start();

// Inject fetch/XHR/console hook into page context
injectScript(chrome.runtime.getURL("injected.js"));

// Bridge events from injected script (page context) → SW
window.addEventListener("__testerbuddy__", (e) => {
  const event = (e as CustomEvent).detail;
  bridge.send(event);
});
