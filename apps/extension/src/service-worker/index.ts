import {
  EVENT_TAB_SWITCHED, EVENT_TAB_UPDATED, EVENT_TAB_CLOSED,
} from "@testerbuddy/protocol";
import type { BrowserEvent } from "@testerbuddy/protocol";
import { WsClient } from "./ws-client";
import { Router } from "./router";
import { TabRegistry } from "./tab-registry";

declare const __TESTERBUDDY_BUILD_VERSION__: string;
declare const __TESTERBUDDY_CONTENT_FILE__: string;

const tabRegistry = new TabRegistry();
const router = new Router(tabRegistry);
const ws = new WsClient({ router, onConnected: () => void reinjectOpenTabs() });
router.setWs(ws);

function canInject(url?: string) {
  return Boolean(url) && !/^chrome:\/\//.test(url!) && !/^edge:\/\//.test(url!) && !/^about:/.test(url!);
}

async function hasLiveContentScript(tabId: number) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { source: "testerbuddy:ping" });
    return response?.source === "testerbuddy:pong" && response?.version === __TESTERBUDDY_BUILD_VERSION__;
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId: number, url?: string, force = false) {
  if (!canInject(url)) return;

  if (!force && await hasLiveContentScript(tabId)) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [__TESTERBUDDY_CONTENT_FILE__],
    });
  } catch (error) {
    console.warn("[TesterBuddy] Failed to inject content script", tabId, error);
  }
}

async function reinjectOpenTabs(force = false) {
  try {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    await Promise.all(tabs.map((tab) => tab.id ? ensureContentScript(tab.id, tab.url, force) : Promise.resolve()));
  } catch (error) {
    console.warn("[TesterBuddy] Failed to reinject open tabs", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[TesterBuddy] Extension installed");
  void reinjectOpenTabs(true);
});

chrome.runtime.onStartup.addListener(() => {
  void reinjectOpenTabs(true);
});

void reinjectOpenTabs(true);

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const { changed, previousTabId } = tabRegistry.setActive(tabId);
  if (changed) {
    let url = "";
    let title = "";
    try {
      const tab = await chrome.tabs.get(tabId);
      url = tab.url ?? "";
      title = tab.title ?? "";
      void ensureContentScript(tabId, url);
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

  if (changeInfo.status === "loading" || changeInfo.status === "complete") {
    void ensureContentScript(tabId, tab.url, changeInfo.status === "complete");
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


