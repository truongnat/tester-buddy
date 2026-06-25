export class TabRegistry {
  private activeTabId?: number;
  private tabs = new Set<number>();
  private tabMeta = new Map<number, { url: string; title: string }>();

  setActive(tabId: number) {
    const prev = this.activeTabId;
    this.activeTabId = tabId;
    this.tabs.add(tabId);
    return { previousTabId: prev !== tabId ? prev : undefined, changed: prev !== tabId };
  }

  updateMeta(tabId: number, meta: { url?: string; title?: string }) {
    const existing = this.tabMeta.get(tabId) || { url: "", title: "" };
    const updated = { ...existing };
    if (meta.url !== undefined) updated.url = meta.url;
    if (meta.title !== undefined) updated.title = meta.title;
    this.tabMeta.set(tabId, updated);
    return updated;
  }

  getMeta(tabId: number) {
    return this.tabMeta.get(tabId);
  }

  remove(tabId: number) {
    this.tabs.delete(tabId);
    this.tabMeta.delete(tabId);
    if (this.activeTabId === tabId) this.activeTabId = undefined;
  }

  getActiveTabId() {
    return this.activeTabId;
  }
}
