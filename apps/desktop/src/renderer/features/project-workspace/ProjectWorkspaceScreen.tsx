import { useState } from "react";
import { Plus, FolderOpen, Bug, Activity, MoreHorizontal } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";

interface Project {
  id: string;
  name: string;
  url: string;
  bugCount: number;
  sessionCount: number;
  lastActivity: string;
}

const MOCK_PROJECTS: Project[] = [
  { id: "p1", name: "Staging — Order Management", url: "staging.example.com",    bugCount: 4, sessionCount: 7,  lastActivity: "2h ago" },
  { id: "p2", name: "Admin Panel",                 url: "admin.internal.com",     bugCount: 1, sessionCount: 2,  lastActivity: "Yesterday" },
  { id: "p3", name: "Mobile Checkout",             url: "m.staging.example.com",  bugCount: 9, sessionCount: 12, lastActivity: "3d ago" },
];

export function ProjectWorkspaceScreen() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = MOCK_PROJECTS.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.url.includes(search)
  );

  const project = MOCK_PROJECTS.find((p) => p.id === selected);

  return (
    <div className="flex h-full min-h-0">
      {/* Project list */}
      <div className="w-72 shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="px-3 py-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text">Projects</span>
            <Button variant="ghost" size="icon">
              <Plus size={14} />
            </Button>
          </div>
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`w-full text-left px-3 py-3 hover:bg-surface-muted transition-colors ${selected === p.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text truncate">{p.name}</p>
                  <p className="text-xs text-text-muted truncate mt-0.5">{p.url}</p>
                </div>
                <span className="text-2xs text-text-muted shrink-0 mt-0.5">{p.lastActivity}</span>
              </div>
              <div className="flex gap-2 mt-2">
                <span className="flex items-center gap-1 text-2xs text-error">
                  <Bug size={10} /> {p.bugCount}
                </span>
                <span className="flex items-center gap-1 text-2xs text-text-muted">
                  <Activity size={10} /> {p.sessionCount}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Project detail */}
      <div className="flex-1 overflow-y-auto bg-bg">
        {project ? (
          <ProjectDetail project={project} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted">
            <FolderOpen size={32} className="opacity-30" />
            <p className="text-sm">Select a project</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectDetail({ project }: { project: Project }) {
  return (
    <div className="p-5 space-y-5 max-w-2xl">
      {/* Project header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-semibold text-base text-text">{project.name}</h1>
          <p className="text-xs text-text-muted mt-0.5">{project.url}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Activity size={13} />
            New Session
          </Button>
          <Button variant="ghost" size="icon">
            <MoreHorizontal size={14} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Bug Reports", value: project.bugCount, color: "text-error" },
          { label: "Sessions",    value: project.sessionCount, color: "text-primary" },
          { label: "Last Active", value: project.lastActivity, color: "text-text-muted" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface border border-border rounded p-3">
            <p className="text-2xs text-text-muted uppercase tracking-wide">{label}</p>
            <p className={`text-xl font-semibold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Recent bugs */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-text">Recent Bugs</h2>
          <Button variant="ghost" size="sm">
            <Plus size={12} /> New
          </Button>
        </div>
        <div className="space-y-1.5">
          {["Order submit returns 500", "Empty state not shown", "Pagination breaks on filter"].map((title, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-surface border border-border rounded hover:border-primary/30 cursor-pointer transition-colors">
              <Bug size={12} className="text-error shrink-0" />
              <span className="text-sm text-text flex-1 truncate">{title}</span>
              <Badge variant={i === 0 ? "error" : i === 1 ? "warning" : "default"}>
                {i === 0 ? "Critical" : i === 1 ? "High" : "Low"}
              </Badge>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
