import { useEffect, useState } from "react";
import { Copy, Check, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SettingsScreen() {
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [connCount, setConnCount] = useState(0);

  useEffect(() => {
    window.testerbuddy?.getPairingToken().then(setToken);
    window.testerbuddy?.getConnectionCount().then(setConnCount);
    const unsubscribe = window.testerbuddy?.onConnectionChange(setConnCount);
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const copy = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 max-w-lg space-y-6">
      <h1 className="font-semibold text-base text-text">Settings</h1>

      {/* Connection status */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-text">Bridge Status</h2>
        <div
          className={`flex items-center gap-3 px-3 py-2.5 rounded border text-sm font-medium ${
            connCount > 0
              ? "bg-success/10 border-success/30 text-success"
              : "bg-surface-muted border-border text-text-muted"
          }`}
        >
          {connCount > 0 ? (
            <>
              <Wifi size={14} /> {connCount} extension{connCount > 1 ? "s" : ""}{" "}
              connected
            </>
          ) : (
            <>
              <WifiOff size={14} /> No extensions connected
            </>
          )}
        </div>
        <p className="text-xs text-text-muted">
          Listening on <code className="font-mono">127.0.0.1:17393</code>
        </p>
      </section>

      {/* Pairing token */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-text">Pairing Token</h2>
        <p className="text-xs text-text-muted">
          Copy and paste into the TesterBuddy extension popup to connect.
        </p>
        <div className="flex items-center gap-2 p-3 bg-surface border border-border rounded font-mono text-xs text-text break-all">
          <span className="flex-1 select-text">{token || "Loading..."}</span>
          <Button variant="ghost" size="icon" onClick={copy} disabled={!token}>
            {copied ? (
              <Check size={13} className="text-success" />
            ) : (
              <Copy size={13} />
            )}
          </Button>
        </div>
        <p className="text-2xs text-text-muted">
          Token is saved across restarts. Delete{" "}
          <code className="font-mono">pairing-token.txt</code> from app data to
          regenerate.
        </p>
      </section>
    </div>
  );
}
