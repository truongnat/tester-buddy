export class TabRegistry {
  private activeTabId?: number;
  private authorizedTabId?: number;
  private tabs = new Set<number>();

  setActive(tabId: number) {
    this.activeTabId = tabId;
    this.tabs.add(tabId);
  }

  authorize(tabId: number) {
    this.authorizedTabId = tabId;
  }

  getAuthorizedTabId() {
    return this.authorizedTabId;
  }

  remove(tabId: number) {
    this.tabs.delete(tabId);
    if (this.activeTabId === tabId) this.activeTabId = undefined;
    if (this.authorizedTabId === tabId) this.authorizedTabId = undefined;
  }

  getActiveTabId() {
    return this.activeTabId;
  }
}
