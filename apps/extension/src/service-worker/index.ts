import { WsClient } from "./ws-client";
import { Router } from "./router";
import { TabRegistry } from "./tab-registry";

const tabRegistry = new TabRegistry();
const router = new Router(tabRegistry);
const ws = new WsClient({ router });
router.setWs(ws);

chrome.runtime.onInstalled.addListener(() => {
  console.log("[TesterBuddy] Extension installed");
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  tabRegistry.setActive(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabRegistry.remove(tabId);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  return router.handle(msg, sender, sendResponse);
});


