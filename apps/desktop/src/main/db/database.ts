import initSqlJs from "sql.js";
import { join } from "path";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { app } from "electron";
import { randomUUID } from "crypto";
import type { BrowserEvent } from "@testerbuddy/protocol";

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
  data: string; // JSON string
}

export interface ScreenshotRecord {
  fileId: string;
  eventId?: string;
  filepath: string;
  timestamp: number;
}

export class DatabaseManager {
  private db!: initSqlJs.Database;
  private dbPath: string;

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
    this.save();
  }

  private createTables() {
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
      CREATE TABLE IF NOT EXISTS bug_reports (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        severity TEXT NOT NULL,
        description TEXT,
        stepsToReproduce TEXT NOT NULL,
        expectedResult TEXT,
        actualResult TEXT,
        screenshots TEXT,
        video TEXT,
        createdAt TEXT NOT NULL
      );
    `);

    // Safe migration for existing databases
    try {
      this.db.run("ALTER TABLE bug_reports ADD COLUMN video TEXT;");
    } catch {
      // Column already exists, ignore
    }
  }

  private save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
  }

  insertSession(id: string, activeTabId?: number, activeUrl?: string) {
    const connectedAt = new Date().toISOString();
    this.db.run(
      "INSERT OR REPLACE INTO sessions (id, activeTabId, activeUrl, connectedAt) VALUES (?, ?, ?, ?)",
      [id, activeTabId ?? null, activeUrl ?? null, connectedAt]
    );
    this.save();
  }

  updateSessionTab(id: string, activeTabId: number, activeUrl: string) {
    this.db.run(
      "UPDATE sessions SET activeTabId = ?, activeUrl = ? WHERE id = ?",
      [activeTabId, activeUrl, id]
    );
    this.save();
  }

  insertEvent(sessionId: string, event: BrowserEvent, timestamp: number): string {
    const id = randomUUID();
    this.db.run(
      "INSERT INTO events (id, sessionId, type, timestamp, data) VALUES (?, ?, ?, ?, ?)",
      [id, sessionId, event.type, timestamp, JSON.stringify(event)]
    );
    this.save();
    return id;
  }

  insertScreenshot(fileId: string, eventId: string | null, filepath: string, timestamp: number) {
    this.db.run(
      "INSERT OR REPLACE INTO screenshots (fileId, eventId, filepath, timestamp) VALUES (?, ?, ?, ?)",
      [fileId, eventId, filepath, timestamp]
    );
    this.save();
  }

  getSessions(): SessionRecord[] {
    const stmt = this.db.prepare("SELECT * FROM sessions ORDER BY connectedAt DESC");
    const result: SessionRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      result.push({
        id: row.id as string,
        activeTabId: row.activeTabId ? (row.activeTabId as number) : undefined,
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
        timestamp: row.timestamp as number,
        data: row.data as string,
      });
    }
    stmt.free();
    return result;
  }

  insertBugReport(report: Omit<BugReportRecord, "createdAt">) {
    const createdAt = new Date().toISOString();
    this.db.run(
      "INSERT OR REPLACE INTO bug_reports (id, title, severity, description, stepsToReproduce, expectedResult, actualResult, screenshots, video, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        report.id,
        report.title,
        report.severity,
        report.description ?? null,
        report.stepsToReproduce,
        report.expectedResult ?? null,
        report.actualResult ?? null,
        JSON.stringify(report.screenshots),
        report.video ?? null,
        createdAt,
      ]
    );
    this.save();
  }

  getBugReports(): BugReportRecord[] {
    const stmt = this.db.prepare("SELECT * FROM bug_reports ORDER BY createdAt DESC");
    const result: BugReportRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      result.push({
        id: row.id as string,
        title: row.title as string,
        severity: row.severity as any,
        description: row.description ? (row.description as string) : undefined,
        stepsToReproduce: row.stepsToReproduce as string,
        expectedResult: row.expectedResult ? (row.expectedResult as string) : undefined,
        actualResult: row.actualResult ? (row.actualResult as string) : undefined,
        screenshots: row.screenshots ? JSON.parse(row.screenshots as string) : [],
        video: row.video ? (row.video as string) : undefined,
        createdAt: row.createdAt as string,
      });
    }
    stmt.free();
    return result;
  }

  deleteBugReport(id: string) {
    this.db.run("DELETE FROM bug_reports WHERE id = ?", [id]);
    this.save();
  }
}

export interface BugReportRecord {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  description?: string;
  stepsToReproduce: string;
  expectedResult?: string;
  actualResult?: string;
  screenshots: string[];
  video?: string;
  createdAt: string;
}
