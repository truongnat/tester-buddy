import { useEffect, useMemo, useState } from "react";
import { Plus, FolderOpen, Bug, Film, Link2, Pencil, Trash2, Ticket, Save, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input, Textarea } from "../../components/ui/input";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";

type ProjectRecord = {
  id: string;
  name: string;
  key: string;
  url?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectForm = {
  name: string;
  description: string;
};

type TicketRecord = {
  id: string;
  projectId: string;
  code: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  externalUrl?: string;
  createdAt: string;
  updatedAt: string;
};

type TicketForm = {
  code: string;
  title: string;
  description: string;
  status: TicketRecord["status"];
  externalUrl: string;
};

type MediaRecord = {
  id: string;
  projectId: string;
  ticketId: string;
  bugId?: string;
  kind: "screenshot" | "video";
  filepath: string;
  createdAt: string;
};

type BugReportRecord = {
  id: string;
  projectId?: string;
  ticketId?: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  createdAt: string;
};

type DeleteState =
  | { kind: "project"; id: string; name: string }
  | { kind: "ticket"; id: string; name: string }
  | null;

const EMPTY_PROJECT: ProjectForm = { name: "", description: "" };
const EMPTY_TICKET: TicketForm = { code: "", title: "", description: "", status: "todo", externalUrl: "" };

export function ProjectWorkspaceScreen() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [bugs, setBugs] = useState<BugReportRecord[]>([]);
  const [media, setMedia] = useState<MediaRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectForm>(EMPTY_PROJECT);
  const [projectFormInitial, setProjectFormInitial] = useState<ProjectForm>(EMPTY_PROJECT);
  const [ticketForm, setTicketForm] = useState<TicketForm>(EMPTY_TICKET);
  const [ticketFormInitial, setTicketFormInitial] = useState<TicketForm>(EMPTY_TICKET);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState>(null);

  const loadProjects = async () => {
    const next = ((await window.testerbuddy?.getProjects()) ?? []) as ProjectRecord[];
    setProjects(next);
    setSelectedProjectId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
  };

  const loadProjectDetail = async (projectId: string | null, preferredTicketId?: string | null) => {
    if (!projectId) {
      setTickets([]);
      setBugs([]);
      setMedia([]);
      setSelectedTicketId(null);
      return;
    }
    const [nextTickets, nextBugs, nextMedia] = await Promise.all([
      window.testerbuddy?.getTickets(projectId) ?? Promise.resolve([]),
      window.testerbuddy?.getBugReports({ projectId }) ?? Promise.resolve([]),
      window.testerbuddy?.getMedia({ projectId }) ?? Promise.resolve([]),
    ]);
    const typedTickets = nextTickets as TicketRecord[];
    setTickets(typedTickets);
    setBugs(nextBugs as BugReportRecord[]);
    setMedia(nextMedia as MediaRecord[]);
    setSelectedTicketId((current) => {
      const candidate = preferredTicketId ?? current;
      return candidate && typedTickets.some((item) => item.id === candidate) ? candidate : typedTickets[0]?.id ?? null;
    });
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    void loadProjectDetail(selectedProjectId);
  }, [selectedProjectId]);

  const filteredProjects = useMemo(() => projects.filter((project) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return project.name.toLowerCase().includes(q) || project.key.toLowerCase().includes(q) || project.description?.toLowerCase().includes(q);
  }), [projects, search]);

  const selectedProject = projects.find((item) => item.id === selectedProjectId) ?? null;
  const selectedTicket = tickets.find((item) => item.id === selectedTicketId) ?? null;
  const visibleBugs = selectedTicketId ? bugs.filter((bug) => bug.ticketId === selectedTicketId) : bugs;
  const visibleMedia = selectedTicketId ? media.filter((item) => item.ticketId === selectedTicketId) : media;
  const hasUnsavedProjectChanges = JSON.stringify(projectForm) !== JSON.stringify(projectFormInitial);
  const hasUnsavedTicketChanges = JSON.stringify(ticketForm) !== JSON.stringify(ticketFormInitial);

  const confirmDiscardProjectChanges = () => {
    if (!showProjectModal || !hasUnsavedProjectChanges) return true;
    return confirm("Project form has unsaved changes. Leave without saving?");
  };

  const confirmDiscardTicketChanges = () => {
    if (!hasUnsavedTicketChanges) return true;
    return confirm("Ticket form has unsaved changes. Leave without saving?");
  };

  const resetTicketForm = () => {
    setTicketForm(EMPTY_TICKET);
    setTicketFormInitial(EMPTY_TICKET);
    setEditingTicketId(null);
  };

  const openCreateProjectModal = () => {
    if (!confirmDiscardProjectChanges()) return;
    setEditingProjectId(null);
    setProjectForm(EMPTY_PROJECT);
    setProjectFormInitial(EMPTY_PROJECT);
    setShowProjectModal(true);
  };

  const openEditProjectModal = (project: ProjectRecord) => {
    if (!confirmDiscardProjectChanges()) return;
    const nextForm = {
      name: project.name,
      description: project.description ?? "",
    };
    setEditingProjectId(project.id);
    setProjectForm(nextForm);
    setProjectFormInitial(nextForm);
    setShowProjectModal(true);
  };

  const closeProjectModal = () => {
    if (!confirmDiscardProjectChanges()) return;
    setShowProjectModal(false);
    setEditingProjectId(null);
    setProjectForm(EMPTY_PROJECT);
    setProjectFormInitial(EMPTY_PROJECT);
  };

  const submitProject = async () => {
    if (!projectForm.name.trim()) return;
    if (editingProjectId) {
      await window.testerbuddy?.updateProject(editingProjectId, projectForm);
    } else {
      const created = await window.testerbuddy?.createProject(projectForm);
      setSelectedProjectId((created as ProjectRecord | undefined)?.id ?? null);
    }
    setShowProjectModal(false);
    setEditingProjectId(null);
    setProjectForm(EMPTY_PROJECT);
    setProjectFormInitial(EMPTY_PROJECT);
    await loadProjects();
  };

  const submitTicket = async () => {
    if (!selectedProjectId || !ticketForm.title.trim()) return;
    if (editingTicketId) {
      await window.testerbuddy?.updateTicket(editingTicketId, ticketForm);
    } else {
      const created = await window.testerbuddy?.createTicket({ ...ticketForm, projectId: selectedProjectId });
      setSelectedTicketId((created as TicketRecord | undefined)?.id ?? null);
    }
    resetTicketForm();
    await loadProjectDetail(selectedProjectId, selectedTicketId);
  };

  const startCreateTicket = () => {
    if (!confirmDiscardTicketChanges()) return;
    resetTicketForm();
  };

  const cancelTicketEdit = () => {
    if (!confirmDiscardTicketChanges()) return;
    resetTicketForm();
  };

  const startEditTicket = (ticket: TicketRecord) => {
    if (!confirmDiscardTicketChanges()) return;
    const nextForm = {
      code: ticket.code,
      title: ticket.title,
      description: ticket.description ?? "",
      status: ticket.status,
      externalUrl: ticket.externalUrl ?? "",
    };
    setEditingTicketId(ticket.id);
    setTicketForm(nextForm);
    setTicketFormInitial(nextForm);
  };

  const confirmDelete = async () => {
    if (!deleteState) return;
    if (deleteState.kind === "project") {
      await window.testerbuddy?.deleteProject(deleteState.id);
      await loadProjects();
    } else {
      await window.testerbuddy?.deleteTicket(deleteState.id);
      if (selectedProject) {
        await loadProjectDetail(selectedProject.id);
      }
    }
    setDeleteState(null);
  };

  const stats = [
    { label: "Tickets", value: tickets.length, icon: Ticket },
    { label: "Bugs", value: visibleBugs.length, icon: Bug },
    { label: "Media", value: visibleMedia.length, icon: Film },
  ];

  return (
    <>
      <div className="flex h-full min-h-0 bg-[#f7f8fb]">
        <aside className="w-80 shrink-0 border-r border-border bg-surface flex flex-col">
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-text">Projects</p>
                <p className="text-2xs text-text-muted">Real workspace data from the local database.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={openCreateProjectModal}>
                <Plus size={14} />
              </Button>
            </div>
            <Input placeholder="Search project name, key, or description" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {filteredProjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-xs text-text-muted text-center">
                No projects yet.
              </div>
            ) : filteredProjects.map((project) => {
              const bugCount = bugs.filter((bug) => bug.projectId === project.id).length;
              const ticketCount = project.id === selectedProjectId ? tickets.length : 0;
              const isActive = project.id === selectedProjectId;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${isActive ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-surface-muted"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text">{project.name}</p>
                      <p className="truncate text-2xs text-text-muted mt-1">{project.key}</p>
                      {project.description && <p className="mt-2 line-clamp-2 text-2xs text-text-muted">{project.description}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <span onClick={(e) => { e.stopPropagation(); openEditProjectModal(project); }} className="rounded p-1 text-text-muted hover:text-text">
                        <Pencil size={12} />
                      </span>
                      <span onClick={(e) => {
                        e.stopPropagation();
                        setDeleteState({ kind: "project", id: project.id, name: project.name });
                      }} className="rounded p-1 text-text-muted hover:text-error">
                        <Trash2 size={12} />
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2 text-2xs text-text-muted">
                    <span>{bugCount} bugs</span>
                    <span>{ticketCount} tickets</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          {!selectedProject ? (
            <div className="flex h-full items-center justify-center text-text-muted gap-3">
              <FolderOpen size={28} className="opacity-40" />
              <span className="text-sm">Select or create a project.</span>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-lg font-semibold text-text">{selectedProject.name}</h1>
                      <Badge variant="primary">{selectedProject.key}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">Generated project key for storage and media path mapping.</p>
                    {selectedProject.description && <p className="mt-3 max-w-3xl text-sm text-text-muted">{selectedProject.description}</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-3 min-w-[320px]">
                    {stats.map(({ label, value, icon: Icon }) => (
                      <div key={label} className="rounded-xl border border-border bg-bg p-3">
                        <div className="flex items-center gap-2 text-text-muted text-2xs uppercase tracking-wide">
                          <Icon size={12} />
                          {label}
                        </div>
                        <p className="mt-2 text-xl font-semibold text-text">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[1.3fr_.9fr]">
                <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-text">Tickets</h2>
                      <p className="text-2xs text-text-muted">Create, edit, and link internal tickets to external trackers.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={startCreateTicket}>
                      <Plus size={13} />
                      New Ticket
                    </Button>
                  </div>

                  <div className="grid gap-3 rounded-xl border border-border bg-bg p-3 md:grid-cols-2">
                    <Input placeholder="Ticket code" value={ticketForm.code} onChange={(e) => setTicketForm((prev) => ({ ...prev, code: e.target.value }))} />
                    <Input placeholder="Ticket title" value={ticketForm.title} onChange={(e) => setTicketForm((prev) => ({ ...prev, title: e.target.value }))} />
                    <Input placeholder="External URL (Jira/GitHub)" value={ticketForm.externalUrl} onChange={(e) => setTicketForm((prev) => ({ ...prev, externalUrl: e.target.value }))} className="md:col-span-2" />
                    <Textarea rows={3} placeholder="Ticket description" value={ticketForm.description} onChange={(e) => setTicketForm((prev) => ({ ...prev, description: e.target.value }))} className="md:col-span-2" />
                    <select value={ticketForm.status} onChange={(e) => setTicketForm((prev) => ({ ...prev, status: e.target.value as TicketRecord["status"] }))} className="h-10 rounded border border-border bg-surface px-3 text-sm text-text md:col-span-1">
                      <option value="todo">Todo</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                      <option value="blocked">Blocked</option>
                    </select>
                    <div className="flex justify-end gap-2 md:col-span-1">
                      {editingTicketId && <Button type="button" variant="outline" size="sm" onClick={cancelTicketEdit}>Cancel</Button>}
                      <Button type="button" size="sm" onClick={() => void submitTicket()}>
                        <Save size={13} />
                        {editingTicketId ? "Update" : "Create"}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {tickets.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-4 text-xs text-text-muted text-center">No tickets yet.</div>
                    ) : tickets.map((ticket) => {
                      const isActive = ticket.id === selectedTicketId;
                      const ticketBugCount = bugs.filter((bug) => bug.ticketId === ticket.id).length;
                      const ticketMediaCount = media.filter((item) => item.ticketId === ticket.id).length;
                      return (
                        <button
                          key={ticket.id}
                          type="button"
                          onClick={() => setSelectedTicketId(ticket.id)}
                          className={`w-full rounded-xl border p-3 text-left transition ${isActive ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-surface-muted"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-text">{ticket.title}</p>
                                <Badge variant="default">{ticket.code}</Badge>
                                <Badge variant={ticket.status === "blocked" ? "error" : ticket.status === "done" ? "primary" : ticket.status === "in_progress" ? "warning" : "default"}>{ticket.status.replace("_", " ")}</Badge>
                              </div>
                              <p className="mt-1 text-xs text-text-muted">{ticket.description || "No ticket description"}</p>
                              {ticket.externalUrl && (
                                <a href={ticket.externalUrl} className="mt-2 inline-flex items-center gap-1 text-2xs text-primary underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>
                                  <Link2 size={11} />
                                  Open external ticket
                                </a>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <span onClick={(e) => { e.stopPropagation(); startEditTicket(ticket); }} className="rounded p-1 text-text-muted hover:text-text">
                                <Pencil size={12} />
                              </span>
                              <span onClick={(e) => {
                                e.stopPropagation();
                                setDeleteState({ kind: "ticket", id: ticket.id, name: ticket.title });
                              }} className="rounded p-1 text-text-muted hover:text-error">
                                <Trash2 size={12} />
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 flex gap-3 text-2xs text-text-muted">
                            <span>{ticketBugCount} bugs</span>
                            <span>{ticketMediaCount} media</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-semibold text-text">Recent Bugs</h2>
                        <p className="text-2xs text-text-muted">{selectedTicket ? `Filtered to ${selectedTicket.code}` : "Project-wide bug history."}</p>
                      </div>
                      {selectedTicket && <Badge variant="primary">{selectedTicket.code}</Badge>}
                    </div>
                    <div className="mt-3 space-y-2">
                      {visibleBugs.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border p-4 text-xs text-text-muted text-center">No bugs for this scope.</div>
                      ) : visibleBugs.slice(0, 8).map((bug) => (
                        <div key={bug.id} className="rounded-xl border border-border bg-bg p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-text">{bug.title}</p>
                            <Badge variant={bug.severity === "critical" ? "error" : bug.severity === "high" ? "warning" : bug.severity === "medium" ? "primary" : "default"}>{bug.severity}</Badge>
                          </div>
                          <p className="mt-1 text-2xs text-text-muted">{new Date(bug.createdAt).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-semibold text-text">Recent Media</h2>
                        <p className="text-2xs text-text-muted">Filter by ticket or bug from the database, not mocks.</p>
                      </div>
                      <Badge variant="default">{visibleMedia.length}</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {visibleMedia.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border p-4 text-xs text-text-muted text-center">No media stored yet.</div>
                      ) : visibleMedia.slice(0, 10).map((item) => (
                        <div key={item.id} className="rounded-xl border border-border bg-bg p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Film size={14} className="text-primary shrink-0" />
                              <p className="truncate text-sm font-medium text-text">{item.filepath.split(/[\\/]/).pop()}</p>
                            </div>
                            <Badge variant={item.kind === "video" ? "warning" : "default"}>{item.kind}</Badge>
                          </div>
                          <p className="mt-1 truncate text-2xs text-text-muted">{item.filepath}</p>
                          <p className="mt-1 text-2xs text-text-muted">{new Date(item.createdAt).toLocaleString()}{item.bugId ? " · attached to bug" : " · ticket media"}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-text">{editingProjectId ? "Edit Project" : "Create Project"}</h2>
                <p className="text-2xs text-text-muted">Project key is generated automatically from the name.</p>
              </div>
              <button type="button" onClick={closeProjectModal} className="rounded-lg p-1 text-text-muted hover:bg-surface-muted hover:text-text">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="space-y-2">
                <label className="text-3xs font-bold uppercase tracking-wider text-text-muted">Project Name</label>
                <Input
                  placeholder="e.g. Checkout Web"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-3xs font-bold uppercase tracking-wider text-text-muted">Description</label>
                <Textarea
                  rows={4}
                  placeholder="Short context about this project or environment"
                  value={projectForm.description}
                  onChange={(e) => setProjectForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button type="button" variant="outline" size="sm" onClick={closeProjectModal}>Cancel</Button>
              <Button type="button" size="sm" onClick={() => void submitProject()}>
                <Save size={13} />
                {editingProjectId ? "Update Project" : "Create Project"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteState !== null}
        title={deleteState?.kind === "project" ? "Delete Project" : "Delete Ticket"}
        description={deleteState ? `This will permanently delete ${deleteState.kind} "${deleteState.name}" and related records in this scope.` : ""}
        confirmLabel={deleteState?.kind === "project" ? "Delete Project" : "Delete Ticket"}
        onCancel={() => setDeleteState(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
