# Báo cáo Review — `tester-buddy`

> **Vai trò review:** Senior Tester + AI + Backend
> **Phạm vi:** lớp nền (base) — Electron main process (bridge server, IPC, DB, agent), `packages/protocol` + `packages/shared`, lớp capture của extension, **và review tính năng (feature/gaps/improvements) các màn hình renderer**.
> **Ngày:** 2026-06-27 · **Trạng thái typecheck:** xanh cả 4 package.
>
> **Mục lục:** §0 Tổng quan · §1 Bảo mật (CRITICAL→LOW) · **§2 Review Tính năng — Feature / Gaps / Improvements** · §3 Điểm mạnh · Phụ lục.

## Cập nhật triển khai — 2026-06-27

- Đã vá `C1`: upload localhost giờ yêu cầu `X-TesterBuddy-Token`, bỏ `CORS *`, giới hạn origin extension, giới hạn kích thước upload, siết `cleanName`, chặn path escape, đổi tên file sang `randomUUID`.
- Đã vá `C2`: redaction header/body/token ở network hook trước khi dispatch; console log từ page hook cũng redact.
- Đã vá `H1`: cấu hình Jira/GitHub chuyển khỏi `localStorage` sang secure storage ở main process.
- Đã vá `H2`: desktop không còn log raw payload/event body nhạy cảm; log file có redaction theo key nhạy cảm.
- Đã vá `H3`: `WebSocketServer` có `maxPayload`; upload HTTP có hard limit.
- Đã vá `H4`: page hook network/console chỉ dispatch khi capture active.
- Đã vá `G1/G4`: thêm AI draft qua Groq để sinh title/severity/description/steps/expected/actual từ timeline đã chọn.
- Đã vá `G7`: bỏ `prompt(JSON)` cho export config; thay bằng form trong UI.
- Đã vá `G8`: bỏ handoff qua `sessionStorage`; thay bằng typed in-memory handoff.
- Đã vá `G9`: Live Session chuyển sang dùng `entry.id` làm identity chính.
- Đã vá một phần `G5`: xóa ticket/project sẽ dọn media file trên đĩa thay vì chỉ xóa record DB.
- Chưa làm trong lượt này: replay/assertion (`G2`), surface điều khiển agent tổng quát (`G3`), bug list search/filter/status/tag đầy đủ (`G6`), review-redaction trước export (`G10`), test coverage (`M4`), ack/sequence cho agent commands (`M5`).

---

## 0. Tổng quan

Monorepo pnpm gọn gàng: `protocol` (Zod là source-of-truth, discriminated union) → `shared` → `desktop`/`extension`. Bridge = HTTP + WebSocket localhost `127.0.0.1:17393`. Extension hook `fetch`/`XHR`/`console`/`history` trên trang web → đẩy event qua WS về desktop → lưu SQLite (sql.js) → xuất bug report (Markdown/HTML/Jira/GitHub).

**Đánh giá nhanh:** code sạch, tách lớp tốt, typecheck xanh, dùng parameterized SQL, `contextIsolation:true`/`nodeIntegration:false`. **Nhưng** có **lỗ hổng bảo mật/quyền riêng tư nghiêm trọng** — đặc biệt đáng lo vì đây là công cụ QA bắt toàn bộ traffic của tester.

**Thứ tự xử lý khuyến nghị:** C1 → C2 → H2 → H1 → H3 → H4 → M1/M2. **C1 và C2 là chặn-release.**

---

## 🔴 CRITICAL — phải sửa trước khi dùng thật

### C1. Endpoint upload HTTP không xác thực + CORS `*` + path traversal
**File:** `apps/desktop/src/main/bridge/local-server.ts`, `packages/shared/src/utils/index.ts`

- Dòng 32-34: `Access-Control-Allow-Origin: *` cho server localhost.
- Dòng 42-48: route `POST /upload` **không kiểm tra pairing token** (chỉ WebSocket validate token ở `websocket-hub.ts:21`).
- Dòng 70: tên thư mục ghép từ query param `tabId/projectId/ticketId` do client điều khiển, đưa thẳng vào `join(documentsDir, "TesterBuddy", folderName)`.
- `cleanName` **chỉ thay `:` → `_`**, KHÔNG lọc `/`, `\`, `..`.

→ **Bất kỳ website nào** đang mở trong trình duyệt cũng POST được tới `127.0.0.1:17393/upload`, và với `projectId=../../../../...` có thể **ghi file ra ngoài thư mục TesterBuddy** (arbitrary path write, bytes tùy ý, đuôi `.webm`). Chuỗi unauthenticated write-to-disk từ web origin bất kỳ.

**Khắc phục:**
- Bắt buộc pairing token cho endpoint upload.
- Bỏ CORS `*` — chỉ cho origin extension/ứng dụng.
- `cleanName` whitelist `[A-Za-z0-9._-]`, chặn `..`.
- `path.resolve` rồi kiểm tra path nằm trong thư mục cho phép (prefix check).

### C2. Secret/PII trong network capture không được redact
**File:** `apps/extension/src/injected/fetch-xhr-hook.ts` → `apps/desktop/src/main/db/database.ts` → `apps/desktop/src/main/issue-export.service.ts`

- Bắt **toàn bộ request/response headers** (dòng 184, 290) — gồm `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key`…
- Bắt **request body** (149) và **response body** (198, 300) — token, JWT, dữ liệu cá nhân.
- Lưu **plaintext** vào SQLite (`database.ts:381 insertEvent`, cột `data TEXT`), có thể lọt vào bug report xuất ra **GitHub/Jira công khai**.

Mâu thuẫn: input field được redact đàng hoàng (`event-recorder.ts:55` bỏ qua `type=password`; `page-bridge.ts redactValue`) — **nhưng** token trong network header thì không hề. Mức bảo vệ không nhất quán.

**Khắc phục:** redact tại biên trước khi `dispatch` — strip/`••••` các header nhạy cảm (`authorization`, `cookie`, `set-cookie`, `x-api-key`…); nhận diện token/JWT trong body bằng regex + entropy; cho cấu hình allowlist domain được phép bắt body.

---

## 🟠 HIGH

### H1. Token Jira/GitHub lưu `localStorage` plaintext
`apps/desktop/src/renderer/features/bug-reporter/BugReportScreen.tsx:110-145` — lưu `{ token }` qua `localStorage.setItem`. Trong Electron renderer, localStorage là file plaintext trên đĩa → token issue-tracker bị lộ nếu máy bị truy cập.
**Khắc phục:** chuyển lưu trữ về main process qua `safeStorage` (Electron) / OS keychain; không giữ secret ở renderer.

### H2. Ghi dữ liệu nhạy cảm ra `main.log` plaintext
`apps/desktop/src/main/bridge/websocket-hub.ts:32,35` log "raw message" + event đã parse; `app.ts:29-36` redirect `console.log` ra `main.log`. → toàn bộ network body/header (gồm secret ở C2) đổ vào log file không mã hóa.
**Khắc phục:** bỏ log raw payload ở production; chỉ log metadata (type, tabId); chạy redaction trước khi log.

### H3. Không giới hạn kích thước payload → DoS bộ nhớ
- `websocket-hub.ts:14` `new WebSocketServer({ server })` không set `maxPayload`.
- `local-server.ts:66-69` gom toàn bộ body upload vào mảng `chunks` không giới hạn.

Kết hợp C1 (CORS `*`, không auth) → website bất kỳ gửi POST khổng lồ làm OOM app.
**Khắc phục:** set `maxPayload` cho WS; giới hạn `Content-Length`/tổng byte cho upload; rate-limit kết nối.

### H4. Capture không gắn với "phiên ghi có đồng thuận"
`apps/extension/src/service-worker/index.ts` (`onActivated:106`, `onUpdated:126` → `activateTabContent`) tự inject content script mỗi khi đổi/cập nhật tab. Cờ `active` trong `event-recorder.ts` chỉ chặn click/input — **nhưng hook network/console trong `fetch-xhr-hook.ts` chạy bất kể `active`**, nên traffic bị bắt liên tục trên mọi tab user mở, không chỉ khi tester chủ động "record".
**Khắc phục:** gate hook network/console theo trạng thái recording; chỉ báo UI rõ ràng "đang ghi"; mặc định off.

---

## 🟡 MEDIUM

| # | Vấn đề | Vị trí | Đề xuất |
|---|--------|--------|---------|
| M1 | IPC tin tưởng renderer hoàn toàn, không validate Zod tại biên; `options as JiraExportConfig`/`as GitHubExportConfig` đưa thẳng vào `fetch` kèm credential | `ipc/handlers.ts:293,299`; `SAVE_BUG_REPORT:360`; `EXECUTE_AGENT_COMMAND:408` | Validate bằng Zod ở mọi handler (defense-in-depth) |
| M2 | Pairing token truyền qua **query string** `?token=` → dễ lọt log; `validate` dùng `===` (không constant-time) | `websocket-hub.ts:19`; `pairing.service.ts:30` | Dùng header/subprotocol; `crypto.timingSafeEqual` |
| M3 | `Math.random()` đặt tên file (trái CLAUDE.md yêu cầu `crypto.randomUUID`) | `local-server.ts:79` | Dùng `randomUUID()` |
| M4 | **Không có test nào** cho một công cụ QA; `pnpm test` chưa cấu hình; parser lệnh agent phức tạp mà 0 test | `agent/agent-command.service.ts` | Unit test cho normalizer + Zod round-trip (xem mục Tester) |
| M5 | Agent gửi chuỗi lệnh "fire-and-forget" qua WS, không đảm bảo thứ tự/ack | `agent/browser-control.service.ts:23-34` | Thêm ack/sequence id; chờ kết quả từng lệnh |

---

## 🟢 LOW
- `getErrorType` lặp điều kiện `NetworkError` hai lần — `fetch-xhr-hook.ts:97`.
- `normalizeArray` trả `null` nếu **bất kỳ** phần tử nào parse fail → drop cả batch, không báo lệnh nào sai — `agent-command.service.ts:29-45`.
- Nhiều `catch {}` nuốt lỗi im lặng (`safeSend` ở shared; WS malformed JSON `websocket-hub.ts:44`) — chấp nhận cho best-effort nhưng nên log debug.
- `as any`/`any[]` trong hook DOM và `app.ts:29` logRedirect — trái rule "no any" của CLAUDE.md (tạm chấp nhận khi hook prototype, nên khoanh vùng).
- `database.ts` ghi lại **toàn bộ file** mỗi lần flush (đặc thù sql.js) — ổn ở quy mô hiện tại, lưu ý khi dữ liệu lớn.

---

## 🧪 Góc nhìn Senior Tester (đặc thù QA tool)
1. **Mỉa mai lớn nhất:** công cụ giúp người khác test lại **không có test**. Ưu tiên:
   - `agent-command.service` (string/JSON/object → BrowserCommand) — bảng input/output, gồm ca lỗi.
   - Round-trip Zod `BrowserEventSchema`/`BrowserCommandSchema` (fixture mỗi `type`).
   - `database` migrate v0→v6 (idempotent, không mất dữ liệu).
   - Redaction (sau khi thêm) — test password/header/JWT bị che.
2. **Determinism của capture:** `getSelector` và timeline phụ thuộc DOM → cần golden test cho selector ổn định.
3. **Repro tin cậy:** nếu thiếu network gating (H4), report lẫn nhiễu traffic nền → giảm chất lượng repro.

## 🤖 Góc nhìn AI / Agent
- Pipeline `AgentRunner → AgentCommandService.normalize → BrowserControl` mạch lạc, tách chuẩn hóa khỏi I/O — tốt.
- **Thiếu phản hồi vòng lặp:** lệnh gửi đi không có kết quả trả về (click thành công? selector không thấy?), agent không thể tự sửa → nên có response envelope cho mỗi command.
- **Không có policy/allowlist** cho hành vi agent (type/click bất kỳ selector). Hướng tự động hóa nên thêm guard + consent cho hành động có side-effect.

## §2. Review Tính năng — Feature / Gaps / Improvements

### 2.1 Tính năng hiện có (inventory)

| Khu vực | Đã làm được |
|---------|-------------|
| **Live Session** (`LiveSessionScreen.tsx`) | Timeline realtime mọi event (tab, network, console, user click/input, navigation, DOM); filter theo loại + search + sort; chọn event → xem JSON chi tiết + copy; multi-select → tạo bug; chụp screenshot; quay video (getDisplayMedia); pause/resume timeline |
| **Project Workspace** (`ProjectWorkspaceScreen.tsx`) | CRUD project + ticket (status `todo/in_progress/done/blocked`); search project; đếm bug/media theo ticket; xóa có xác nhận |
| **Bug Reporter** (`BugReportScreen.tsx`) | Soạn bug (title, severity, description, steps-to-reproduce, expected/actual); đính kèm evidence (screenshot/video); link timeline steps từ session; export **Markdown / HTML / Jira / GitHub** |
| **Settings** | Hiện + copy pairing token |
| **Extension** | Pairing bằng token (popup); auto-inject content script; bắt network/console/user/nav; screenshot (`captureVisibleTab`); video (offscreen); screen picker |
| **Agent primitives** (preload + backend) | `readDom`, `getPageContext`, `highlightElement`, `click`, `type`, `executeAgentCommand`, `sendCommand` |

→ Bản chất hiện tại: **session recorder + manual bug reporter** chất lượng tốt. Tên gọi "QA Assistant" và bộ agent primitives mới chỉ là **khung**, chưa thành sản phẩm "trợ lý".

### 2.2 Gaps lớn (theo mức độ ảnh hưởng giá trị)

**G1 — 🔴 Không có AI/LLM nào (dù định vị là "Assistant").**
Toàn repo không có tích hợp LLM (`grep` openai/anthropic/llm/gpt/gemini = rỗng). "Agent" chỉ là `AgentCommandService.normalize` + gửi lệnh qua WS — **không có bộ não sinh/lập kế hoạch hành động**. Hệ quả: không auto tóm tắt bug, không tự sinh repro steps từ timeline, không gợi ý severity, không phát hiện flaky/anomaly, không "ngôn ngữ tự nhiên → thao tác test".

**G2 — 🔴 Không có khái niệm test/assertion/replay.**
Đây là tool cho *tester* nhưng: click/type được **ghi** lại mà **không replay** được; không có assertion (element tồn tại, text bằng, status==200); không chạy lại regression. Thiếu đúng phần lõi của một QA tool.

**G3 — 🟠 Agent primitives "chết".**
`readDom/click/type/highlight/executeAgentCommand` expose qua preload nhưng **không màn hình nào dùng** — năng lực dựng xong mà không có surface điều khiển.

**G4 — 🟠 Bug report 100% thủ công.**
Timeline steps link được nhưng `stepsToReproduce` là free text; không auto-generate từ chuỗi event đã chọn.

**G5 — 🟠 Quản lý vòng đời dữ liệu thiếu.**
Bảng `events` không bao giờ prune → phình vô hạn; xóa bug/ticket **không** dọn file screenshot/video trên đĩa (`createMedia` ghi file nhưng delete chỉ xóa record → **orphan media**); không retention policy; không "export cả session" (JSON/HAR) để chia sẻ.

**G6 — 🟠 Bug list nghèo:** không search/filter/sort; bug **không có status riêng** (status nằm ở ticket); không tag/label/assignee.

**G7 — 🟡 Cấu hình Jira/GitHub qua `window.prompt(JSON)`** (`BugReportScreen.tsx:127,141`) — dán JSON thô vào dialog, UX kém; lưu `localStorage` plaintext (trùng H1).

**G8 — 🟡 Hand-off giữa màn hình bằng `sessionStorage`** stringly-typed (`testerbuddy:temp_steps_json`...) — dễ vỡ, không schema.

**G9 — 🟡 Bug React key/selection dùng `${ts}-${type}`** (`LiveSessionScreen.tsx:223,442`) — hai event cùng mili-giây + cùng type sẽ **trùng key** → chọn nhầm/checkbox sai. Đã có `entry.id` (id DB) nhưng không dùng.

**G10 — 🟡 Không có review/scrub dữ liệu nhạy cảm trước khi export** (nối C2) — user không thể xem & xóa secret đã bắt trước khi đẩy lên Jira/GitHub.

**G11 — 🟢 UX blocking:** dùng `alert()`/`prompt()` (LiveSession:293, BugReport:134,148); custom `Select` cần audit bàn phím/ARIA.

### 2.3 Improvements đề xuất (ưu tiên)

**P1 — Biến khung agent thành giá trị thật (đòn bẩy cao nhất):**
- **LLM tóm tắt + sinh repro:** timeline đã chọn → tự sinh title/severity gợi ý + steps-to-reproduce + summary. Tận dụng đúng dữ liệu đang có.
- **NL → browser command:** dùng `getPageContext`/`readDom` làm ngữ cảnh để LLM sinh chuỗi `BrowserCommand` (đã có sẵn pipeline thực thi) → đây là "Assistant" thực sự. Nhớ gate bằng policy/redaction (C2) trước khi gửi DOM cho model.

**P2 — Thêm replay + assertion (lõi QA):**
- Replay chuỗi `user.click/input/navigation` đã ghi như một test xác định; thêm event assertion (exists/text/status) → regression run thật sự. Đây là nâng cấp "recorder" → "test tool".

**P3 — UX & đúng đắn:**
- Thay `prompt(JSON)` bằng form Settings cho Jira/GitHub; lưu qua `safeStorage` (đồng thời fix H1).
- Thay `sessionStorage` bằng store có type (Zustand/Jotai) hoặc route state.
- Dùng `entry.id` (id DB) cho React key & selection thay `ts-type` (fix G9).
- Bug list: search/filter/sort + status riêng cho bug + tag.

**P4 — Vòng đời dữ liệu:**
- Prune/retention cho `events`; GC file media khi xóa bug/ticket; màn "export full session" (JSON/HAR); màn review-redaction trước export.

> **Kết luận feature:** sản phẩm đang là *trình ghi phiên + báo cáo bug thủ công* khá hoàn chỉnh về UX, nhưng **chưa phải QA/AI tool** — thiếu hai trụ cột: (1) AI để tự động hóa phân tích/sinh nội dung, (2) replay+assertion để thành test thật. Khung kỹ thuật (agent commands, DOM read, page context, timeline có cấu trúc, Zod schema) **đã sẵn sàng** để xây hai trụ cột này — đây là cơ hội nâng cấp rõ ràng nhất.

---

## ✅ Điểm mạnh đáng giữ
Zod source-of-truth + `z.infer`; discriminated union narrow đúng; tách `protocol/shared` rõ; Electron baseline an toàn (`contextIsolation`); SQL parameterized; redact input field + skip password; truncate body 5KB; log rotation; typecheck xanh toàn bộ.

---

### Phụ lục — file đã đọc khi review
`packages/protocol/src/schemas.ts`, `constants.ts`; `packages/shared/src/utils/index.ts`; `apps/desktop/src/main/{app.ts, bridge/local-server.ts, bridge/websocket-hub.ts, bridge/pairing.service.ts, bridge/extension-session-registry.ts, db/database.ts, ipc/handlers.ts, issue-export.service.ts, agent/*.ts}`; `apps/extension/src/{injected/fetch-xhr-hook.ts, content/event-recorder.ts, content/page-bridge.ts, service-worker/index.ts}`; `apps/extension/public/manifest.json`.

**Renderer (review tính năng §2):** `apps/desktop/src/renderer/components/AppShell.tsx`; `apps/desktop/src/renderer/features/{live-session/LiveSessionScreen.tsx, project-workspace/ProjectWorkspaceScreen.tsx, bug-reporter/BugReportScreen.tsx, settings/SettingsScreen.tsx}`; `apps/desktop/src/renderer/types/global.d.ts` (preload API surface).
