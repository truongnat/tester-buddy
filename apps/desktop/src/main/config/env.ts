import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";

function parseEnvFile(filepath: string) {
  const raw = readFileSync(filepath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function walkParents(startDir: string, maxDepth = 6) {
  const dirs: string[] = [];
  let current = startDir;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    dirs.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

export function loadEnvFromWorkspace() {
  const candidates = new Set<string>();
  for (const dir of walkParents(process.cwd())) {
    candidates.add(join(dir, ".env"));
  }
  for (const dir of walkParents(__dirname)) {
    candidates.add(join(dir, ".env"));
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      parseEnvFile(candidate);
      return candidate;
    }
  }
  return null;
}
