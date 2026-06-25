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
  const { changed } = tabRegistry.setActive(tabId);
  if (changed) {
    ws.send({
      type: "tab.switched",
      tabId,
    } as any);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.title) {
    const prev = tabRegistry.getMeta(tabId);
    const updated = tabRegistry.updateMeta(tabId, {
      url: tab.url || changeInfo.url,
      title: tab.title || changeInfo.title,
    });
    ws.send({
      type: "tab.updated",
      tabId,
      url: updated.url,
      title: updated.title,
    } as any);
  }

  // On initial load, capture full tab info
  if (changeInfo.status === "complete" && tab.url && !tabRegistry.getMeta(tabId)?.url) {
    tabRegistry.updateMeta(tabId, { url: tab.url, title: tab.title || "" });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabRegistry.remove(tabId);
  ws.send({ type: "tab.closed", tabId } as any);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  return router.handle(msg, sender, sendResponse);
});
