// Runs in page context (not extension context) — can patch window.fetch / XHR
(function () {
  const CHANNEL = "__testerbuddy__";

  function dispatch(detail: unknown) {
    window.dispatchEvent(new CustomEvent(CHANNEL, { detail }));
  }

  // Hook fetch
  const _fetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = (init?.method ?? (typeof input !== "string" ? (input as Request).method : undefined) ?? "GET").toUpperCase();
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const start = Date.now();

    dispatch({ type: "network.request", requestId, method, url });

    try {
      const res = await _fetch(input, init);
      dispatch({ type: "network.response", requestId, status: res.status, durationMs: Date.now() - start });
      return res;
    } catch (err) {
      dispatch({ type: "network.response", requestId, status: 0, durationMs: Date.now() - start });
      throw err;
    }
  };

  // Hook console.error
  const _error = console.error.bind(console);
  console.error = function (...args) {
    dispatch({ type: "console.error", message: args.map(String).join(" ") });
    return _error(...args);
  };

  // Hook history.pushState and replaceState for SPA routing
  const wrapHistory = (type: "pushState" | "replaceState") => {
    const orig = window.history[type];
    return function (this: any, ...args: any[]) {
      const from = window.location.href;
      const res = orig.apply(this, args);
      const to = window.location.href;
      if (from !== to) {
        dispatch({ type: "navigation", from, to });
      }
      return res;
    };
  };
  window.history.pushState = wrapHistory("pushState");
  window.history.replaceState = wrapHistory("replaceState");
})();
