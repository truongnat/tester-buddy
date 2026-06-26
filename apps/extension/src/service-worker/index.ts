import {
  EVENT_TAB_SWITCHED, EVENT_TAB_UPDATED, EVENT_TAB_CLOSED, EVENT_SCREENSHOT_CAPTURED,
} from "@testerbuddy/protocol";
import type { BrowserEvent } from "@testerbuddy/protocol";
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

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const { changed, previousTabId } = tabRegistry.setActive(tabId);
  if (changed) {
    let url = "";
    let title = "";
    try {
      const tab = await chrome.tabs.get(tabId);
      url = tab.url ?? "";
      title = tab.title ?? "";
    } catch {}
    const event: BrowserEvent = { type: EVENT_TAB_SWITCHED, tabId, previousTabId, url, title };
    ws.send(event);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title) {
    const updated = tabRegistry.updateMeta(tabId, {
      url: tab.url || changeInfo.url,
      title: tab.title || changeInfo.title,
    });
    const event: BrowserEvent = {
      type: EVENT_TAB_UPDATED,
      tabId,
      url: updated.url,
      title: updated.title,
    };
    ws.send(event);
  }

  if (changeInfo.status === "complete" && tab.url && !tabRegistry.getMeta(tabId)?.url) {
    tabRegistry.updateMeta(tabId, { url: tab.url, title: tab.title || "" });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabRegistry.remove(tabId);
  const event: BrowserEvent = { type: EVENT_TAB_CLOSED, tabId };
  ws.send(event);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  return router.handle(msg, sender, sendResponse);
});
