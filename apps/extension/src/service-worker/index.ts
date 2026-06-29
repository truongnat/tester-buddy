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
const ws = new WsClient({
  router,
  onConnected: () => {
    void syncActiveTab("connect");
  },
});
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

async function ensureContentScript(tabId: number, url?: string) {
  if (!canInject(url)) return;

  if (await hasLiveContentScript(tabId)) {
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

async function setTabActiveState(tabId: number | undefined, active: boolean) {
  if (tabId === undefined) return;
  try {
    await chrome.tabs.sendMessage(tabId, { source: "testerbuddy:set-active", active });
  } catch {
    // tab may not have the content script yet
  }
}

async function activateTabContent(tabId: number, url?: string) {
  await ensureContentScript(tabId, url);
  await setTabActiveState(tabId, true);
}

async function syncActiveTab(reason: "startup" | "connect" | "window-focus" = "startup") {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab?.id) return;
    const { changed, previousTabId } = tabRegistry.setActive(activeTab.id);
    const updated = tabRegistry.updateMeta(activeTab.id, {
      url: activeTab.url ?? "",
      title: activeTab.title ?? "",
    });
    if (changed) {
      await setTabActiveState(previousTabId, false);
    }
    if (activeTab.status === "complete") {
      await activateTabContent(activeTab.id, activeTab.url);
    }
    if (!changed && reason !== "startup") return;
    const event: BrowserEvent = {
      type: EVENT_TAB_SWITCHED,
      tabId: activeTab.id,
      previousTabId,
      url: updated.url,
      title: updated.title,
    };
    ws.send(event);
  } catch (error) {
    console.warn("[TesterBuddy] Failed to sync active tab", reason, error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[TesterBuddy] Extension installed");
  void syncActiveTab("startup");
});

chrome.runtime.onStartup.addListener(() => {
  void syncActiveTab("startup");
});

void syncActiveTab("startup");

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const { changed, previousTabId } = tabRegistry.setActive(tabId);
  if (changed) {
    await setTabActiveState(previousTabId, false);
    let url = "";
    let title = "";
    try {
      const tab = await chrome.tabs.get(tabId);
      url = tab.url ?? "";
      title = tab.title ?? "";
      tabRegistry.updateMeta(tabId, { url, title });
      if (tab.status === "complete") {
        await activateTabContent(tabId, url);
      }
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

  if (tabRegistry.getActiveTabId() === tabId && changeInfo.status === "complete") {
    void activateTabContent(tabId, tab.url);
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

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  void syncActiveTab("window-focus");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  return router.handle(msg, sender, sendResponse);
});
