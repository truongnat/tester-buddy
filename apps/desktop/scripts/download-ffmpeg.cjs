const { createWriteStream, existsSync, mkdirSync, unlinkSync, readdirSync, renameSync, rmSync, chmodSync } = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");
const os = require("os");

const RESOURCES_DIR = path.resolve(__dirname, "..", "resources");
const TMP_DIR = os.tmpdir();

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : require("http");
    mod
      .get(
        url,
        { headers: { "User-Agent": "testerbuddy" } },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            httpGet(res.headers.location).then(resolve).catch(reject);
            return;
          }
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve(data));
        }
      )
      .on("error", reject);
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https
      .get(url, { headers: { "User-Agent": "testerbuddy" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          unlinkSync(dest);
          download(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", reject);
  });
}

function findBinary(dir, name) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findBinary(fullPath, name);
      if (found) return found;
    } else if (entry.name === name) {
      return fullPath;
    }
  }
  return null;
}

async function getBtbNAssetUrl(keyword) {
  const body = await httpGet("https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest");
  const release = JSON.parse(body);
  for (const asset of release.assets) {
    if (asset.name.includes(keyword)) {
      return asset.browser_download_url;
    }
  }
  return null;
}

async function getEvermeetUrl() {
  const html = await httpGet("https://evermeet.cx/ffmpeg/");
  const auto = html.match(/href="(ffmpeg-\d+-g[0-9a-f]+\.zip)"/);
  if (auto) return `https://evermeet.cx/ffmpeg/${auto[1]}`;
  const stable = html.match(/href="(ffmpeg-\d+\.\d+\.\d+\.zip)"/);
  if (stable) return `https://evermeet.cx/ffmpeg/${stable[1]}`;
  return null;
}

async function getDownloadInfo() {
  const p = process.platform;
  const ext = p === "win32" ? ".exe" : "";
  const binaryName = `ffmpeg${ext}`;

  if (p === "darwin") {
    const url = await getEvermeetUrl();
    if (!url) throw new Error("Could not find macOS ffmpeg download URL");
    return { url, ext, binaryName, archiveExt: ".zip" };
  }

  const folder = p === "win32" ? (process.arch === "x64" ? "win64" : "win32") : "linux64";
  const archiveExt = p === "win32" ? ".zip" : ".tar.xz";
  const keyword = `-${folder}-gpl${archiveExt}`;

  const url = await getBtbNAssetUrl(keyword);
  if (!url) throw new Error(`Could not find ffmpeg asset for ${folder}`);
  return { url, ext, binaryName, archiveExt };
}

async function main() {
  if (!existsSync(RESOURCES_DIR)) {
    mkdirSync(RESOURCES_DIR, { recursive: true });
  }

  const info = await getDownloadInfo();
  const targetPath = path.join(RESOURCES_DIR, info.binaryName);

  console.log(`Platform: ${process.platform} (${os.arch()})`);
  console.log(`Downloading ${info.binaryName}...`);
  console.log(`URL: ${info.url}`);

  if (existsSync(targetPath)) {
    console.log(`${info.binaryName} already exists at ${targetPath}, skipping.`);
    return;
  }

  const archiveName = path.basename(info.url);
  const archivePath = path.join(TMP_DIR, archiveName);

  console.log("Downloading...");
  await download(info.url, archivePath);

  console.log("Extracting...");
  const extractDir = path.join(TMP_DIR, `ffmpeg-${Date.now()}`);
  mkdirSync(extractDir, { recursive: true });

  try {
    if (info.archiveExt === ".zip") {
      if (process.platform === "darwin") {
        execSync(`unzip -q "${archivePath}" -d "${extractDir}" 2>/dev/null`, { stdio: "pipe" });
      } else {
        execSync(
          `powershell -NoProfile -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${extractDir}' -Force"`,
          { stdio: "pipe" }
        );
      }
    } else {
      execSync(`tar xf "${archivePath}" -C "${extractDir}"`, { stdio: "pipe" });
    }
  } catch (err) {
    throw new Error(`Extraction failed: ${err.message}`);
  }

  const found = findBinary(extractDir, info.binaryName);
  if (!found) {
    throw new Error(`${info.binaryName} not found in archive`);
  }

  renameSync(found, targetPath);

  if (info.ext === "") {
    chmodSync(targetPath, 0o755);
  }

  console.log(`Installed to: ${targetPath}`);

  unlinkSync(archivePath);
  rmSync(extractDir, { recursive: true, force: true });

  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
