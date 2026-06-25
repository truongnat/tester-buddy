const banner        = document.getElementById("banner")!;
const bannerIcon    = document.getElementById("banner-icon")!;
const bannerLabel   = document.getElementById("banner-label")!;
const bannerHint    = document.getElementById("banner-hint")!;
const formSection   = document.getElementById("form-section")!;
const connSection   = document.getElementById("connected-section")!;
const tokenInput    = document.getElementById("token-input") as HTMLInputElement;
const btnSave       = document.getElementById("btn-save") as HTMLButtonElement;
const btnReset      = document.getElementById("btn-reset") as HTMLButtonElement;
const btnRecheck    = document.getElementById("btn-recheck") as HTMLButtonElement;

type State = "no-token" | "checking" | "connected" | "disconnected" | "invalid-token";

const STATE_CONFIG: Record<State, { cls: string; icon: string; label: string; hint: string }> = {
  "no-token":      { cls: "no-token",     icon: "🔑", label: "Not connected",      hint: "Paste your pairing token below to connect." },
  "checking":      { cls: "no-token",     icon: "⏳", label: "Checking…",          hint: "Connecting to TesterBuddy desktop…" },
  "connected":     { cls: "connected",    icon: "●",  label: "Connected",          hint: "Desktop bridge is active. Recording ready." },
  "disconnected":  { cls: "disconnected", icon: "⚠️", label: "Desktop not running",hint: "Start TesterBuddy desktop app and try again." },
  "invalid-token": { cls: "error",        icon: "✗",  label: "Invalid token",      hint: "Token was rejected. Reset and try again." },
};

function setState(state: State) {
  const cfg = STATE_CONFIG[state];
  banner.className = `status-banner ${cfg.cls}`;
  bannerIcon.textContent = cfg.icon;
  bannerLabel.textContent = cfg.label;
  bannerHint.textContent = cfg.hint;

  const hasToken = state !== "no-token";
  formSection.style.display = hasToken ? "none" : "block";
  connSection.style.display = hasToken ? "block" : "none";
}

function checkConnection(token: string) {
  setState("checking");
  const ws = new WebSocket(`ws://127.0.0.1:17393?token=${token}`);
  let resolved = false;

  const timer = setTimeout(() => {
    if (!resolved) { resolved = true; ws.close(); setState("disconnected"); }
  }, 3000);

  ws.onopen = () => {
    if (resolved) return;
    resolved = true;
    clearTimeout(timer);
    setState("connected");
    ws.close();
  };
  ws.onclose = (e) => {
    if (resolved) return; // already handled by onopen
    clearTimeout(timer);
    resolved = true;
    if (e.code === 4001) setState("invalid-token");
    else setState("disconnected");
  };
  ws.onerror = () => {
    if (resolved) return;
    clearTimeout(timer);
    resolved = true;
    setState("disconnected");
  };
}

chrome.storage.local.get("pairingToken").then(({ pairingToken }) => {
  if (pairingToken) checkConnection(pairingToken);
  else setState("no-token");
});

// Save token
btnSave.addEventListener("click", () => {
  const token = tokenInput.value.trim();
  if (!token) { tokenInput.focus(); return; }
  chrome.storage.local.set({ pairingToken: token }).then(() => {
    tokenInput.value = "";
    checkConnection(token);
  });
});

// Reset
btnReset.addEventListener("click", () => {
  chrome.storage.local.remove("pairingToken").then(() => setState("no-token"));
});

// Recheck
btnRecheck.addEventListener("click", () => {
  chrome.storage.local.get("pairingToken").then(({ pairingToken }) => {
    if (pairingToken) checkConnection(pairingToken);
    else setState("no-token");
  });
});

tokenInput.addEventListener("keydown", (e) => { if (e.key === "Enter") btnSave.click(); });
