import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import "./globals.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppShell } from "./components/AppShell";
import { LiveSessionScreen } from "./features/live-session/LiveSessionScreen";
import { BugReportScreen } from "./features/bug-reporter/BugReportScreen";
import { ProjectWorkspaceScreen } from "./features/project-workspace/ProjectWorkspaceScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";

createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/session" replace />} />
            <Route path="session" element={<LiveSessionScreen />} />
            <Route path="bugs" element={<BugReportScreen />} />
            <Route path="projects" element={<ProjectWorkspaceScreen />} />
            <Route path="settings" element={<SettingsScreen />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
