import { BrowserWindow, desktopCapturer } from "electron";

export async function pickScreen(): Promise<Electron.DesktopCapturerSource | null> {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });

  if (sources.length === 0) return null;
  if (sources.length === 1) return sources[0];

  return new Promise((resolve) => {
    const thumbnails = sources.map((s) => ({
      id: s.id,
      name: s.name,
      dataUrl: s.thumbnail.toDataURL(),
    }));

    const picker = new BrowserWindow({
      width: 700,
      height: 500,
      resizable: false,
      modal: true,
      title: "Select Screen to Record",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Select Screen</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #1a1d23;
    color: #e0e0e0;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }
  h2 { font-size: 16px; font-weight: 600; color: #fff; }
  .grid {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .card {
    background: #262a33;
    border: 2px solid transparent;
    border-radius: 10px;
    padding: 8px;
    cursor: pointer;
    transition: border-color 0.15s, transform 0.1s;
    text-align: center;
    width: 280px;
  }
  .card:hover { border-color: #0F9F8F; transform: scale(1.02); }
  .card img {
    width: 100%;
    height: 160px;
    object-fit: cover;
    border-radius: 6px;
    display: block;
    background: #111;
  }
  .card .label {
    margin-top: 8px;
    font-size: 13px;
    font-weight: 500;
    color: #c0c4cc;
  }
  .hint {
    font-size: 12px;
    color: #888;
  }
</style>
</head>
<body>
  <h2>Select a screen to record</h2>
  <div class="grid">
    ${thumbnails.map((t, i) => `
    <div class="card" data-index="${i}">
      <img src="${t.dataUrl}" alt="${t.name}" />
      <div class="label">${t.name}</div>
    </div>
    `).join("")}
  </div>
  <div class="hint">Click on the screen you want to capture</div>
<script>
  document.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index, 10);
      document.title = '__select__' + idx;
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.title = '__select__-1';
  });
<\/script>
</body>
</html>`;

    picker.webContents.on("page-title-updated", (e, title) => {
      e.preventDefault();
      if (!title.startsWith("__select__")) return;
      const index = parseInt(title.replace("__select__", ""), 10);
      if (index >= 0 && index < sources.length) {
        resolve(sources[index]);
      } else {
        resolve(null);
      }
      if (!picker.isDestroyed()) picker.close();
    });

    picker.on("closed", () => {
      resolve(null);
    });

    picker.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}
