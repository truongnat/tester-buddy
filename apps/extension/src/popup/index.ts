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

async function queryStatus() {
  setState("checking");
  try {
    const response = await chrome.runtime.sendMessage({ source: "testerbuddy:get-status" });
    if (!response || response.source !== "testerbuddy:status") {
      setState("disconnected");
      return;
    }
    const status = response.status as { state: string };
    switch (status.state) {
      case "connected":
        setState("connected");
        break;
      case "no-token":
        setState("no-token");
        break;
      default:
        setState("disconnected");
        break;
    }
  } catch {
    setState("disconnected");
  }
}

chrome.storage.local.get("pairingToken").then(({ pairingToken }) => {
  if (pairingToken) queryStatus();
  else setState("no-token");
});

// Save token — triggers service worker's storage listener to connect
btnSave.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) { tokenInput.focus(); return; }
  btnSave.disabled = true;
  try {
    await chrome.storage.local.set({ pairingToken: token });
    tokenInput.value = "";
    // Give service worker time to pick up the token and connect
    await new Promise((r) => setTimeout(r, 500));
    await queryStatus();
  } catch {
    setState("disconnected");
  } finally {
    btnSave.disabled = false;
  }
});

// Reset
btnReset.addEventListener("click", async () => {
  await chrome.storage.local.remove("pairingToken");
  setState("no-token");
});

// Recheck
btnRecheck.addEventListener("click", queryStatus);

tokenInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    btnSave.click();
  }
});
