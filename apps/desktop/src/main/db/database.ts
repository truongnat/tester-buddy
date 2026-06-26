import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { join } from "path";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { app } from "electron";
import { randomUUID } from "crypto";
import type { BrowserEvent } from "@testerbuddy/protocol";
import type { TimelineEvent } from "@testerbuddy/shared";

const SCHEMA_VERSION = 6;

type Severity = "low" | "medium" | "high" | "critical";
type TicketStatus = "todo" | "in_progress" | "done" | "blocked";
type MediaKind = "screenshot" | "video";

export interface SessionRecord {
  id: string;
  activeTabId?: number;
  activeUrl?: string;
  connectedAt: string;
}

export interface EventRecord {
  id: string;
  sessionId: string;
  type: string;
  timestamp: number;
  data: string;
}

export interface ScreenshotRecord {
  fileId: string;
  eventId?: string;
  filepath: string;
  timestamp: number;
}

export interface ProjectRecord {
  id: string;
  name: string;
  key: string;
  url?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketRecord {
  id: string;
  projectId: string;
  code: string;
  title: string;
  description?: string;
  status: TicketStatus;
  externalUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaRecord {
  id: string;
  projectId: string;
  ticketId: string;
  bugId?: string;
  kind: MediaKind;
  filepath: string;
  thumbnailPath?: string;
  sourceSessionId?: string;
  sourceEventId?: string;
  createdAt: string;
}

export interface ActiveCaptureContext {
  projectId: string;
  ticketId: string;
}

export interface BugReportRecord {
  id: string;
  projectId?: string;
  ticketId?: string;
  title: string;
  severity: Severity;
  description?: string;
  steps: TimelineEvent[];
  stepsToReproduce: string;
  expectedResult?: string;
  actualResult?: string;
  screenshots: string[];
  video?: string;
  mediaIds: string[];
  evidence?: MediaRecord[];
  createdAt: string;
  updatedAt: string;
}

export type BugReportUpsert = Omit<BugReportRecord, "createdAt" | "updatedAt" | "evidence"> & {
  createdAt?: string;
  updatedAt?: string;
  evidence?: MediaRecord[];
};

export type MediaQuery = {
  ids?: string[];
  projectId?: string;
  ticketId?: string;
  bugId?: string;
};

function slugify(value: string, fallback: string) {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || fallback).slice(0, 48);
}

function parseJsonArray<T>(value: unknown): T[] {
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class DatabaseManager {
  private db!: Database;
  private dbPath: string;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private activeCaptureContext: ActiveCaptureContext | null = null;

  constructor() {
    const userData = app.getPath("userData");
    this.dbPath = join(userData, "testerbuddy.sqlite");
  }

  async init() {
    const SQL = await initSqlJs();
    if (existsSync(this.dbPath)) {
      const filebuffer = readFileSync(this.dbPath);
      this.db = new SQL.Database(filebuffer);
    } else {
      this.db = new SQL.Database();
    }
    this.createTables();
    this.migrate();
    this.loadActiveCaptureContext();
    this.flush();
  }

  close() {
    this.closed = true;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.flush();
    this.db.close();
  }

  private createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS _meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        activeTabId INTEGER,
        activeUrl TEXT,
        connectedAt TEXT
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        sessionId TEXT,
        type TEXT,
        timestamp INTEGER,
        data TEXT,
        FOREIGN KEY(sessionId) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS screenshots (
        fileId TEXT PRIMARY KEY,
        eventId TEXT,
        filepath TEXT,
        timestamp INTEGER,
        FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key TEXT NOT NULL,
        url TEXT,
        description TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        code TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        externalUrl TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        ticketId TEXT NOT NULL,
        bugId TEXT,
        kind TEXT NOT NULL,
        filepath TEXT NOT NULL,
        thumbnailPath TEXT,
        sourceSessionId TEXT,
        sourceEventId TEXT,
        createdAt TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS bug_reports (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        ticketId TEXT,
        title TEXT NOT NULL,
        severity TEXT NOT NULL,
        description TEXT,
        stepsJson TEXT,
        stepsToReproduce TEXT NOT NULL,
        expectedResult TEXT,
        actualResult TEXT,
        screenshots TEXT,
        video TEXT,
        mediaIds TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);
  }

  private migrate() {
    const row = this.db.exec("SELECT value FROM _meta WHERE key = 'schema_version'");
    let version = 0;
    if (row.length > 0 && row[0].values.length > 0) {
      version = parseInt(row[0].values[0][0] as string, 10) || 0;
    }

    if (version < 2) {
      this.ensureColumn("bug_reports", "video", "TEXT");
    }

    if (version < 3) {
      this.ensureColumn("bug_reports", "stepsJson", "TEXT");
    }

    if (version < 4) {
      this.ensureColumn("bug_reports", "projectId", "TEXT");
      this.ensureColumn("bug_reports", "ticketId", "TEXT");
    }

    if (version < 5) {
      this.ensureColumn("bug_reports", "mediaIds", "TEXT");
    }

    if (version < 6) {
      this.ensureColumn("bug_reports", "updatedAt", "TEXT");
      this.db.run("UPDATE bug_reports SET updatedAt = COALESCE(updatedAt, createdAt)");
    }

    this.db.run("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)", [
      "schema_version",
      String(SCHEMA_VERSION),
    ]);
    this.markDirty();
  }

  private ensureColumn(table: string, column: string, type: string) {
    const cols = this.db.exec(`PRAGMA table_info(${table})`);
    const hasColumn = cols.length > 0 && cols[0].values.some((c: unknown[]) => c[1] === column);
    if (!hasColumn) {
      this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
    }
  }

  private markDirty() {
    if (this.closed) return;
    this.dirty = true;
    if (this.saveTimer === null) {
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.flush();
      }, 500);
    }
  }

  private flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const data = this.db.export();
    writeFileSync(this.dbPath, Buffer.from(data));
  }

  private getMeta(key: string) {
    const stmt = this.db.prepare("SELECT value FROM _meta WHERE key = ?");
    stmt.bind([key]);
    const value = stmt.step() ? (stmt.getAsObject().value as string | undefined) : undefined;
    stmt.free();
    return value;
  }

  private setMeta(key: string, value: string) {
    this.db.run("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)", [key, value]);
    this.markDirty();
  }

  private loadActiveCaptureContext() {
    const raw = this.getMeta("active_capture_context");
    if (!raw) {
      this.activeCaptureContext = null;
      return;
    }
    try {
      const parsed = JSON.parse(raw) as ActiveCaptureContext | null;
      if (parsed?.projectId && parsed?.ticketId) {
        this.activeCaptureContext = parsed;
        return;
      }
    } catch {
      // noop
    }
    this.activeCaptureContext = null;
  }

  setActiveCaptureContext(context: ActiveCaptureContext | null) {
    this.activeCaptureContext = context;
    this.setMeta("active_capture_context", JSON.stringify(context));
  }

  getActiveCaptureContext() {
    return this.activeCaptureContext;
  }

  insertSession(id: string, activeTabId?: number, activeUrl?: string) {
    const connectedAt = new Date().toISOString();
    this.db.run(
      "INSERT OR REPLACE INTO sessions (id, activeTabId, activeUrl, connectedAt) VALUES (?, ?, ?, ?)",
      [id, activeTabId ?? null, activeUrl ?? null, connectedAt]
    );
    this.markDirty();
  }

  updateSessionTab(id: string, activeTabId: number, activeUrl: string) {
    this.db.run("UPDATE sessions SET activeTabId = ?, activeUrl = ? WHERE id = ?", [activeTabId, activeUrl, id]);
    this.markDirty();
  }

  insertEvent(sessionId: string, event: BrowserEvent, timestamp: number) {
    const id = randomUUID();
    this.db.run(
      "INSERT INTO events (id, sessionId, type, timestamp, data) VALUES (?, ?, ?, ?, ?)",
      [id, sessionId, event.type, timestamp, JSON.stringify(event)]
    );
    this.markDirty();
    return id;
  }

  insertScreenshot(fileId: string, eventId: string | null, filepath: string, timestamp: number) {
    this.db.run(
      "INSERT OR REPLACE INTO screenshots (fileId, eventId, filepath, timestamp) VALUES (?, ?, ?, ?)",
      [fileId, eventId, filepath, timestamp]
    );
    this.markDirty();
  }

  getSessions(): SessionRecord[] {
    const stmt = this.db.prepare("SELECT * FROM sessions ORDER BY connectedAt DESC");
    const result: SessionRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      result.push({
        id: row.id as string,
        activeTabId: row.activeTabId ? Number(row.activeTabId) : undefined,
        activeUrl: row.activeUrl ? (row.activeUrl as string) : undefined,
        connectedAt: row.connectedAt as string,
      });
    }
    stmt.free();
    return result;
  }

  getEvents(sessionId: string): EventRecord[] {
    const stmt = this.db.prepare("SELECT * FROM events WHERE sessionId = ? ORDER BY timestamp ASC");
    stmt.bind([sessionId]);
    const result: EventRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      result.push({
        id: row.id as string,
        sessionId: row.sessionId as string,
        type: row.type as string,
        timestamp: Number(row.timestamp),
        data: row.data as string,
      });
    }
    stmt.free();
    return result;
  }

  createProject(input: Pick<ProjectRecord, "name" | "key" | "url" | "description">) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const key = (input.key?.trim() || slugify(input.name, id.slice(0, 8))).toUpperCase();
    this.db.run(
      "INSERT INTO projects (id, name, key, url, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, input.name.trim(), key, input.url?.trim() || null, input.description?.trim() || null, now, now]
    );
    this.markDirty();
    return this.getProject(id);
  }

  updateProject(id: string, input: Partial<Pick<ProjectRecord, "name" | "key" | "url" | "description">>) {
    const current = this.getProject(id);
    if (!current) return null;
    const next: ProjectRecord = {
      ...current,
      name: input.name?.trim() || current.name,
      key: input.key?.trim().toUpperCase() || current.key,
      url: input.url?.trim() || undefined,
      description: input.description?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    this.db.run(
      "UPDATE projects SET name = ?, key = ?, url = ?, description = ?, updatedAt = ? WHERE id = ?",
      [next.name, next.key, next.url ?? null, next.description ?? null, next.updatedAt, id]
    );
    this.markDirty();
    return this.getProject(id);
  }

  deleteProject(id: string) {
    const ticketIds = this.getTickets(id).map((ticket) => ticket.id);
    for (const ticketId of ticketIds) {
      this.deleteTicket(ticketId);
    }
    this.db.run("DELETE FROM bug_reports WHERE projectId = ?", [id]);
    this.db.run("DELETE FROM media WHERE projectId = ?", [id]);
    this.db.run("DELETE FROM projects WHERE id = ?", [id]);
    if (this.activeCaptureContext?.projectId === id) {
      this.setActiveCaptureContext(null);
    } else {
      this.markDirty();
    }
  }

  getProjects() {
    const stmt = this.db.prepare("SELECT * FROM projects ORDER BY updatedAt DESC, createdAt DESC");
    const result: ProjectRecord[] = [];
    while (stmt.step()) {
      result.push(this.mapProject(stmt.getAsObject()));
    }
    stmt.free();
    return result;
  }

  getProject(id: string) {
    const stmt = this.db.prepare("SELECT * FROM projects WHERE id = ? LIMIT 1");
    stmt.bind([id]);
    const project = stmt.step() ? this.mapProject(stmt.getAsObject()) : null;
    stmt.free();
    return project;
  }

  createTicket(input: Pick<TicketRecord, "projectId" | "code" | "title" | "description" | "status" | "externalUrl">) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const code = input.code?.trim().toUpperCase() || slugify(input.title, id.slice(0, 8)).toUpperCase();
    this.db.run(
      "INSERT INTO tickets (id, projectId, code, title, description, status, externalUrl, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        input.projectId,
        code,
        input.title.trim(),
        input.description?.trim() || null,
        input.status || "todo",
        input.externalUrl?.trim() || null,
        now,
        now,
      ]
    );
    this.markDirty();
    return this.getTicket(id);
  }

  updateTicket(id: string, input: Partial<Pick<TicketRecord, "code" | "title" | "description" | "status" | "externalUrl">>) {
    const current = this.getTicket(id);
    if (!current) return null;
    const next: TicketRecord = {
      ...current,
      code: input.code?.trim().toUpperCase() || current.code,
      title: input.title?.trim() || current.title,
      description: input.description?.trim() || undefined,
      status: input.status || current.status,
      externalUrl: input.externalUrl?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    this.db.run(
      "UPDATE tickets SET code = ?, title = ?, description = ?, status = ?, externalUrl = ?, updatedAt = ? WHERE id = ?",
      [next.code, next.title, next.description ?? null, next.status, next.externalUrl ?? null, next.updatedAt, id]
    );
    this.markDirty();
    return this.getTicket(id);
  }

  deleteTicket(id: string) {
    this.db.run("UPDATE media SET bugId = NULL WHERE ticketId = ?", [id]);
    this.db.run("DELETE FROM media WHERE ticketId = ?", [id]);
    this.db.run("DELETE FROM bug_reports WHERE ticketId = ?", [id]);
    this.db.run("DELETE FROM tickets WHERE id = ?", [id]);
    if (this.activeCaptureContext?.ticketId === id) {
      this.setActiveCaptureContext(null);
    } else {
      this.markDirty();
    }
  }

  getTickets(projectId?: string) {
    const stmt = this.db.prepare(
      projectId
        ? "SELECT * FROM tickets WHERE projectId = ? ORDER BY updatedAt DESC, createdAt DESC"
        : "SELECT * FROM tickets ORDER BY updatedAt DESC, createdAt DESC"
    );
    if (projectId) stmt.bind([projectId]);
    const result: TicketRecord[] = [];
    while (stmt.step()) {
      result.push(this.mapTicket(stmt.getAsObject()));
    }
    stmt.free();
    return result;
  }

  getTicket(id: string) {
    const stmt = this.db.prepare("SELECT * FROM tickets WHERE id = ? LIMIT 1");
    stmt.bind([id]);
    const ticket = stmt.step() ? this.mapTicket(stmt.getAsObject()) : null;
    stmt.free();
    return ticket;
  }

  createMedia(input: Omit<MediaRecord, "id" | "createdAt">) {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db.run(
      "INSERT INTO media (id, projectId, ticketId, bugId, kind, filepath, thumbnailPath, sourceSessionId, sourceEventId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        input.projectId,
        input.ticketId,
        input.bugId ?? null,
        input.kind,
        input.filepath,
        input.thumbnailPath ?? null,
        input.sourceSessionId ?? null,
        input.sourceEventId ?? null,
        createdAt,
      ]
    );
    this.markDirty();
    return this.getMedia({ ids: [id] })[0] ?? null;
  }

  getMedia(query: MediaQuery = {}) {
    const where: string[] = [];
    const params: string[] = [];

    if (query.ids && query.ids.length > 0) {
      where.push(`id IN (${query.ids.map(() => "?").join(",")})`);
      params.push(...query.ids);
    }
    if (query.projectId) {
      where.push("projectId = ?");
      params.push(query.projectId);
    }
    if (query.ticketId) {
      where.push("ticketId = ?");
      params.push(query.ticketId);
    }
    if (query.bugId) {
      where.push("bugId = ?");
      params.push(query.bugId);
    }

    const sql = `SELECT * FROM media${where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY createdAt DESC`;
    const stmt = this.db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const result: MediaRecord[] = [];
    while (stmt.step()) {
      result.push(this.mapMedia(stmt.getAsObject()));
    }
    stmt.free();

    if (query.ids && query.ids.length > 0) {
      const order = new Map(query.ids.map((id, index) => [id, index]));
      result.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }

    return result;
  }

  insertBugReport(report: BugReportUpsert) {
    const current = this.getBugReport(report.id);
    const now = new Date().toISOString();
    const evidence = report.evidence ?? this.getMedia({ ids: report.mediaIds });
    const screenshots = report.screenshots.length > 0
      ? report.screenshots
      : evidence.filter((item) => item.kind === "screenshot").map((item) => item.filepath);
    const video = report.video ?? evidence.find((item) => item.kind === "video")?.filepath;
    const createdAt = current?.createdAt ?? report.createdAt ?? now;
    const updatedAt = report.updatedAt ?? now;

    this.db.run(
      "INSERT OR REPLACE INTO bug_reports (id, projectId, ticketId, title, severity, description, stepsJson, stepsToReproduce, expectedResult, actualResult, screenshots, video, mediaIds, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        report.id,
        report.projectId ?? null,
        report.ticketId ?? null,
        report.title,
        report.severity,
        report.description ?? null,
        JSON.stringify(report.steps ?? []),
        report.stepsToReproduce,
        report.expectedResult ?? null,
        report.actualResult ?? null,
        JSON.stringify(screenshots),
        video ?? null,
        JSON.stringify(report.mediaIds ?? []),
        createdAt,
        updatedAt,
      ]
    );
    this.syncBugMediaLinks(report.id, report.mediaIds ?? []);
    this.markDirty();
    return this.getBugReport(report.id);
  }

  getBugReports(filters: { projectId?: string; ticketId?: string } = {}) {
    const where: string[] = [];
    const params: string[] = [];
    if (filters.projectId) {
      where.push("projectId = ?");
      params.push(filters.projectId);
    }
    if (filters.ticketId) {
      where.push("ticketId = ?");
      params.push(filters.ticketId);
    }
    const stmt = this.db.prepare(
      `SELECT * FROM bug_reports${where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY createdAt DESC`
    );
    if (params.length > 0) stmt.bind(params);
    const result: BugReportRecord[] = [];
    while (stmt.step()) {
      result.push(this.mapBugReport(stmt.getAsObject()));
    }
    stmt.free();
    return result;
  }

  getBugReport(id: string) {
    const stmt = this.db.prepare("SELECT * FROM bug_reports WHERE id = ? LIMIT 1");
    stmt.bind([id]);
    const report = stmt.step() ? this.mapBugReport(stmt.getAsObject()) : null;
    stmt.free();
    return report;
  }

  deleteBugReport(id: string) {
    this.db.run("UPDATE media SET bugId = NULL WHERE bugId = ?", [id]);
    this.db.run("DELETE FROM bug_reports WHERE id = ?", [id]);
    this.markDirty();
  }

  attachMediaToBug(mediaId: string, bugId: string) {
    this.db.run("UPDATE media SET bugId = ? WHERE id = ?", [bugId, mediaId]);
    const report = this.getBugReport(bugId);
    if (report) {
      const nextMediaIds = Array.from(new Set([...report.mediaIds, mediaId]));
      this.db.run("UPDATE bug_reports SET mediaIds = ?, updatedAt = ? WHERE id = ?", [JSON.stringify(nextMediaIds), new Date().toISOString(), bugId]);
    }
    this.markDirty();
  }

  detachMediaFromBug(mediaId: string, bugId?: string) {
    this.db.run(
      bugId ? "UPDATE media SET bugId = NULL WHERE id = ? AND bugId = ?" : "UPDATE media SET bugId = NULL WHERE id = ?",
      bugId ? [mediaId, bugId] : [mediaId]
    );

    const targetBugId = bugId ?? this.getMedia({ ids: [mediaId] })[0]?.bugId;
    if (targetBugId) {
      const report = this.getBugReport(targetBugId);
      if (report) {
        const nextMediaIds = report.mediaIds.filter((id) => id !== mediaId);
        this.db.run("UPDATE bug_reports SET mediaIds = ?, updatedAt = ? WHERE id = ?", [JSON.stringify(nextMediaIds), new Date().toISOString(), targetBugId]);
      }
    }
    this.markDirty();
  }

  private syncBugMediaLinks(bugId: string, mediaIds: string[]) {
    this.db.run("UPDATE media SET bugId = NULL WHERE bugId = ?", [bugId]);
    for (const mediaId of mediaIds) {
      this.db.run("UPDATE media SET bugId = ? WHERE id = ?", [bugId, mediaId]);
    }
  }

  private mapProject(row: Record<string, unknown>): ProjectRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      key: row.key as string,
      url: row.url ? (row.url as string) : undefined,
      description: row.description ? (row.description as string) : undefined,
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string,
    };
  }

  private mapTicket(row: Record<string, unknown>): TicketRecord {
    return {
      id: row.id as string,
      projectId: row.projectId as string,
      code: row.code as string,
      title: row.title as string,
      description: row.description ? (row.description as string) : undefined,
      status: row.status as TicketStatus,
      externalUrl: row.externalUrl ? (row.externalUrl as string) : undefined,
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string,
    };
  }

  private mapMedia(row: Record<string, unknown>): MediaRecord {
    return {
      id: row.id as string,
      projectId: row.projectId as string,
      ticketId: row.ticketId as string,
      bugId: row.bugId ? (row.bugId as string) : undefined,
      kind: row.kind as MediaKind,
      filepath: row.filepath as string,
      thumbnailPath: row.thumbnailPath ? (row.thumbnailPath as string) : undefined,
      sourceSessionId: row.sourceSessionId ? (row.sourceSessionId as string) : undefined,
      sourceEventId: row.sourceEventId ? (row.sourceEventId as string) : undefined,
      createdAt: row.createdAt as string,
    };
  }

  private mapBugReport(row: Record<string, unknown>): BugReportRecord {
    const mediaIds = parseJsonArray<string>(row.mediaIds);
    const evidence = mediaIds.length > 0 ? this.getMedia({ ids: mediaIds }) : [];
    return {
      id: row.id as string,
      projectId: row.projectId ? (row.projectId as string) : undefined,
      ticketId: row.ticketId ? (row.ticketId as string) : undefined,
      title: row.title as string,
      severity: row.severity as Severity,
      description: row.description ? (row.description as string) : undefined,
      steps: parseJsonArray<TimelineEvent>(row.stepsJson),
      stepsToReproduce: row.stepsToReproduce as string,
      expectedResult: row.expectedResult ? (row.expectedResult as string) : undefined,
      actualResult: row.actualResult ? (row.actualResult as string) : undefined,
      screenshots: parseJsonArray<string>(row.screenshots),
      video: row.video ? (row.video as string) : undefined,
      mediaIds,
      evidence,
      createdAt: row.createdAt as string,
      updatedAt: (row.updatedAt as string) || (row.createdAt as string),
    };
  }
}
