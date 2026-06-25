import { NavLink, Outlet } from "react-router-dom";
import { Activity, Bug, FolderOpen, Settings } from "lucide-react";
import { cn } from "../lib/cn";
import { useConnection } from "../lib/useConnection";

const NAV = [
  { to: "/session", icon: Activity, label: "Live Session" },
  { to: "/bugs", icon: Bug, label: "Bug Reports" },
  { to: "/projects", icon: FolderOpen, label: "Projects" },
];

export function AppShell() {
  const { connectionCount, isConnected } = useConnection();

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* Sidebar */}
      <aside className="w-48 shrink-0 flex flex-col border-r border-border bg-surface">
        {/* Logo with status */}
        <div className="titlebar flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-primary flex items-center justify-center">
              <Activity size={12} className="text-white" />
            </span>
            <span className="font-semibold text-sm text-text">TesterBuddy</span>
          </div>
          
          {/* Connection Dot */}
          <span 
            className={cn(
              "w-2 h-2 rounded-full transition-all duration-300",
              isConnected ? "bg-success animate-pulse" : "bg-text-muted/40"
            )}
            title={isConnected ? `${connectionCount} active connection(s)` : "Offline"}
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-2.5 py-2 rounded text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-text-muted hover:bg-surface-muted hover:text-text"
                )
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: connection status */}
        <div className="px-3 py-3 border-t border-border">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 text-xs text-text-muted hover:text-text transition-colors",
                isActive && "text-text"
              )
            }
          >
            <Settings size={13} />
            Settings
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
