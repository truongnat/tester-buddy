(function () {
  const CHANNEL = "__testerbuddy__";
  const MAX_BODY_SIZE = 5 * 1024; // 5KB — chrome.runtime.sendMessage limit ~64KB

  function dispatch(detail: unknown) {
    window.dispatchEvent(new CustomEvent(CHANNEL, { detail }));
  }

  function getStack(): string | undefined {
    try {
      const err = new Error();
      const stack = err.stack;
      if (!stack) return undefined;
      return stack.split("\n").filter(
        (l) => !l.includes("fetch-xhr-hook") && !l.includes("getStack")
      ).join("\n");
    } catch {
      return undefined;
    }
  }

  function parseQueryParams(url: string): Record<string, string> | undefined {
    try {
      const qs = new URL(url).searchParams;
      if (!qs.toString()) return undefined;
      const params: Record<string, string> = {};
      qs.forEach((v, k) => { params[k] = v; });
      return params;
    } catch {
      return undefined;
    }
  }

  function headersToArray(input: any): { name: string; value: string }[] | undefined {
    if (!input) return undefined;
    try {
      const result: { name: string; value: string }[] = [];
      if (typeof input.forEach === "function") {
        input.forEach((v: string, k: string) => result.push({ name: k, value: v }));
      } else if (Array.isArray(input)) {
        for (const [name, value] of input) result.push({ name, value });
      } else if (typeof input === "object") {
        for (const key of Object.keys(input)) {
          const val = input[key];
          if (typeof val === "string") result.push({ name: key, value: val });
        }
      }
      return result.length > 0 ? result : undefined;
    } catch {
      return undefined;
    }
  }

  function truncateBody(body: string): string {
    if (!body) return "";
    if (body.length > MAX_BODY_SIZE) {
      return body.slice(0, MAX_BODY_SIZE) + `\n[+${body.length - MAX_BODY_SIZE} more bytes]`;
    }
    return body;
  }

  function stringifyBody(body: unknown): string | undefined {
    if (!body) return undefined;
    try {
      if (typeof body === "string") return truncateBody(body);
      if (body instanceof URLSearchParams) return truncateBody(body.toString());
      if (body instanceof Blob) return `[Blob ${body.size}b ${body.type}]`;
      if (body instanceof ArrayBuffer) return `[ArrayBuffer ${body.byteLength}b]`;
      if (typeof body === "object") {
        const s = JSON.stringify(body);
        return s ? truncateBody(s) : `[unstringifiable]`;
      }
      return `[${String(body)}]`;
    } catch {
      return `[unparseable]`;
    }
  }

  function getErrorType(err: any): "timeout" | "abort" | "cors" | "network-error" | undefined {
    if (!err) return undefined;
    if (err.name === "AbortError") return "abort";
    if (err.name === "TimeoutError") return "timeout";
    const m = String(err.message || "");
    if (m.includes("CORS") || m.includes("cross-origin")) return "cors";
    if (m.includes("Failed to fetch") || m.includes("NetworkError") || m.includes("NetworkError")) return "network-error";
    return undefined;
  }

  function isTextContentType(ct: string | null | undefined): boolean {
    if (!ct) return false;
    return /^text\//.test(ct) || /^application\/json/.test(ct) || /^application\/xml/.test(ct) || /^application\/x-www-form-urlencoded/.test(ct) || /^application\/graphql/.test(ct) || /\+json/.test(ct) || /\+xml/.test(ct);
  }

  function rid(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ── Hook fetch ──
  const _fetch = window.fetch.bind(window);
  window.fetch = async function (input: any, init?: any) {
    const rid_ = rid();
    const start = Date.now();

    // Extract URL + method
    let url: string;
    let method: string;
    let req: Request | undefined;

    try {
      if (typeof input === "string") {
        url = input;
        req = undefined;
      } else if (input instanceof Request) {
        url = input.url;
        req = input;
      } else {
        url = String(input);
        req = undefined;
      }
      method = (init?.method ?? req?.method ?? "GET").toUpperCase();
    } catch {
      url = String(input);
      method = "GET";
    }

    // Capture request headers (best-effort)
    let requestHeaders: any = undefined;
    try {
      if (init?.headers) requestHeaders = headersToArray(init.headers);
      else if (req?.headers) requestHeaders = headersToArray(req.headers);
    } catch {}

    // Capture request body (best-effort, only for non-GET)
    let requestBody: string | undefined = undefined;
    try {
      if (method !== "GET") {
        const body = init?.body ?? req?.body;
        if (body) requestBody = stringifyBody(body);
      }
    } catch {}

    // Capture content-type
    let mimeType: string | undefined = undefined;
    try {
      if (req?.headers) mimeType = (req.headers as Headers).get("content-type") || undefined;
      if (!mimeType && init?.headers) {
        const h = init.headers;
        mimeType = h["content-type"] || h["Content-Type"] || undefined;
      }
    } catch {}

    dispatch({
      type: "network.request",
      requestId: rid_,
      method,
      url,
      requestHeaders,
      requestBody,
      queryParams: parseQueryParams(url),
      mimeType,
    });

    try {
      const res = await _fetch(input, init);
      const durationMs = Date.now() - start;

      // Capture response headers (best-effort)
      let responseHeaders: any = undefined;
      let contentType: string | undefined = undefined;
      let size: number | undefined = undefined;
      try {
        responseHeaders = headersToArray(res.headers);
        contentType = res.headers.get("content-type") || undefined;
        const cl = res.headers.get("content-length");
        if (cl) size = parseInt(cl, 10) || undefined;
      } catch {}

      // Capture response body (only for text content types, best-effort)
      let responseBody: string | undefined = undefined;
      if (contentType && isTextContentType(contentType)) {
        try {
          const cloned = res.clone();
          const text = await cloned.text();
          if (text) {
            responseBody = truncateBody(text);
            if (!size) size = text.length;
          }
        } catch {
          // Binary/streaming/opaque — skip body capture
        }
      }

      dispatch({
        type: "network.response",
        requestId: rid_,
        status: res.status,
        statusText: res.statusText || undefined,
        durationMs,
        responseHeaders,
        responseBody,
        contentType,
        size,
      });
      return res;
    } catch (err: any) {
      dispatch({
        type: "network.response",
        requestId: rid_,
        status: 0,
        durationMs: Date.now() - start,
        errorType: getErrorType(err),
      });
      throw err;
    }
  };

  // ── Hook XMLHttpRequest ──
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  const _setReqHeader = XMLHttpRequest.prototype.setRequestHeader;

  const xhrMap = new WeakMap<XMLHttpRequest, {
    method: string; url: string; rid: string; start: number;
    reqHeaders: { name: string; value: string }[];
    reqBody?: string; done: boolean;
  }>();

  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: any, ...rest: any[]) {
    const state = {
      method: String(method).toUpperCase(),
      url: typeof url === "string" ? url : String(url),
      rid: rid(),
      start: Date.now(),
      reqHeaders: [] as { name: string; value: string }[],
      reqBody: undefined as string | undefined,
      done: false,
    };
    xhrMap.set(this, state);

    dispatch({
      type: "network.request",
      requestId: state.rid,
      method: state.method,
      url: state.url,
      queryParams: parseQueryParams(state.url),
    });

    (_open as any).call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
    const s = xhrMap.get(this);
    if (s) s.reqHeaders.push({ name, value });
    _setReqHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: any) {
    const s = xhrMap.get(this);
    if (s) {
      s.start = Date.now();
      if (body) s.reqBody = stringifyBody(body);
    }

    this.addEventListener("load", () => {
      const s = xhrMap.get(this);
      if (!s || s.done) return;
      s.done = true;

      const durationMs = Date.now() - s.start;
      let resHeaders: any = undefined;
      let resBody: string | undefined = undefined;
      let ct: string | undefined = undefined;
      let size: number | undefined = undefined;

      try {
        const h = this.getAllResponseHeaders();
        if (h) {
          resHeaders = h.split("\r\n").filter(Boolean).map(line => {
            const i = line.indexOf(":");
            return { name: line.slice(0, i).trim(), value: line.slice(i + 1).trim() };
          });
          if (resHeaders.length === 0) resHeaders = undefined;
        }
        ct = this.getResponseHeader("content-type") || undefined;
      } catch {}

      try {
        const text = this.responseText;
        if (text && typeof text === "string") {
          if (!ct || isTextContentType(ct)) {
            resBody = truncateBody(text);
            size = text.length;
          }
        }
      } catch {}

      dispatch({
        type: "network.response",
        requestId: s.rid,
        status: this.status,
        statusText: this.statusText || undefined,
        durationMs,
        responseHeaders: resHeaders,
        responseBody: resBody,
        contentType: ct,
        size,
      });
    }, { once: true });

    this.addEventListener("error", () => {
      const s = xhrMap.get(this);
      if (!s || s.done) return;
      s.done = true;
      dispatch({ type: "network.response", requestId: s.rid, status: 0, durationMs: Date.now() - s.start, errorType: "network-error" });
    }, { once: true });

    this.addEventListener("abort", () => {
      const s = xhrMap.get(this);
      if (!s || s.done) return;
      s.done = true;
      dispatch({ type: "network.response", requestId: s.rid, status: 0, durationMs: Date.now() - s.start, errorType: "abort" });
    }, { once: true });

    this.addEventListener("timeout", () => {
      const s = xhrMap.get(this);
      if (!s || s.done) return;
      s.done = true;
      dispatch({ type: "network.response", requestId: s.rid, status: 0, durationMs: Date.now() - s.start, errorType: "timeout" });
    }, { once: true });

    _send.call(this, body);
  };

  // ── Hook console ──
  function hookConsole(level: "log" | "warn" | "info" | "debug" | "trace") {
    const orig = (console as any)[level].bind(console);
    (console as any)[level] = function (...args: any[]) {
      dispatch({ type: "console.log", level, message: args.map(String).join(" "), stack: level === "trace" ? getStack() : undefined, timestamp: Date.now() });
      orig(...args);
    };
  }
  hookConsole("log"); hookConsole("warn"); hookConsole("info"); hookConsole("debug"); hookConsole("trace");

  const _error = console.error.bind(console);
  console.error = function (...args: any[]) {
    dispatch({ type: "console.log", level: "error", message: args.map(String).join(" "), stack: getStack(), timestamp: Date.now() });
    _error(...args);
  };

  // ── Hook history ──
  const wrapHistory = (type: "pushState" | "replaceState") => {
    const orig = window.history[type];
    return function (this: any, ...args: any[]) {
      const from = location.href;
      const r = orig.apply(this, args as any);
      const to = location.href;
      if (from !== to) {
        dispatch({ type: "navigation", from, to, navigationType: "spa", title: document.title, referrer: document.referrer || undefined });
      }
      return r;
    };
  };
  window.history.pushState = wrapHistory("pushState");
  window.history.replaceState = wrapHistory("replaceState");
})();
