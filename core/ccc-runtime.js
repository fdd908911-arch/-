(function () {
  "use strict";

  var CONFIG_KEY = "island-chat.ccc-connection.v1";
  var SESSION_KEY = "island-chat.ccc-selected-session.v1";

  function defaultBaseUrl() {
    var path = window.location.pathname;
    if (path === "/hui-v40" || path.indexOf("/hui-v40/") === 0) {
      return window.location.origin + "/hui-api";
    }
    if (path === "/ccc" || path.indexOf("/ccc/") === 0) {
      return window.location.origin + "/ccc-api";
    }
    return window.location.origin;
  }

  function normalizeBaseUrl(value) {
    var normalized = String(value || "").trim().replace(/\/+$/, "");
    if (!normalized) return "";
    if (normalized === window.location.origin) return defaultBaseUrl();
    return normalized;
  }

  function hasPairCookie() {
    return ("; " + document.cookie).indexOf("; ccc_paired=1") !== -1;
  }

  function readConfig() {
    try {
      var saved = JSON.parse(localStorage.getItem(CONFIG_KEY));
      var originalBaseUrl = String(saved && saved.baseUrl ? saved.baseUrl : "").replace(/\/+$/, "");
      var next = {
        baseUrl: normalizeBaseUrl(originalBaseUrl),
        token: String(saved && saved.token ? saved.token : "")
      };
      if (originalBaseUrl && next.baseUrl !== originalBaseUrl) {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      }
      return next;
    } catch (error) {
      return { baseUrl: "", token: "" };
    }
  }

  var config = readConfig();
  var selectedSession = "";
  try { selectedSession = localStorage.getItem(SESSION_KEY) || ""; } catch (error) {}

  function apiUrl(path, query) {
    var base = config.baseUrl || defaultBaseUrl();
    var url = new URL(path.replace(/^\//, ""), base.replace(/\/+$/, "") + "/");
    Object.keys(query || {}).forEach(function (key) {
      var value = query[key];
      if (value !== null && value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  }

  async function request(path, options) {
    options = options || {};
    if (!config.token && !hasPairCookie()) {
      throw new Error("请先配置服务器地址和访问 Token");
    }
    var headers = Object.assign({ Accept: "application/json" }, options.headers || {});
    if (config.token) headers["X-Auth-Token"] = config.token;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json; charset=utf-8";
    }
    var response;
    try {
      response = await fetch(apiUrl(path, options.query), {
        method: options.method || "GET",
        headers: headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: "no-store",
        credentials: "same-origin"
      });
    } catch (error) {
      throw new Error("无法连接服务器，请检查地址、HTTPS 或跨域配置");
    }
    var payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      if (response.ok) {
        throw new Error("服务器地址返回的不是 API 数据，请重新连接");
      }
    }
    if (!response.ok || payload.ok === false) {
      var reason = payload.detail || payload.error || response.statusText || "request_failed";
      throw new Error("HTTP " + response.status + " · " + reason);
    }
    return payload;
  }

  async function requestBlob(path, options) {
    options = options || {};
    if (!config.token && !hasPairCookie()) {
      throw new Error("请先配置服务器地址和访问 Token");
    }
    var headers = Object.assign({ Accept: "image/png" }, options.headers || {});
    if (config.token) headers["X-Auth-Token"] = config.token;
    var response;
    try {
      response = await fetch(apiUrl(path, options.query), {
        method: options.method || "GET",
        headers: headers,
        cache: "no-store",
        credentials: "same-origin"
      });
    } catch (error) {
      throw new Error("无法连接服务器，请检查地址、HTTPS 或跨域配置");
    }
    if (!response.ok) {
      var payload = {};
      try { payload = await response.json(); } catch (error) {}
      var reason = payload.detail || payload.error || response.statusText || "request_failed";
      throw new Error("HTTP " + response.status + " · " + reason);
    }
    return response.blob();
  }

  function saveConfig(baseUrl, token) {
    config = {
      baseUrl: normalizeBaseUrl(baseUrl),
      token: String(token || "").trim()
    };
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch (error) {}
    document.dispatchEvent(new CustomEvent("ccc:config-changed"));
  }

  function setSelectedSession(session) {
    selectedSession = String(session || "");
    try {
      if (selectedSession) localStorage.setItem(SESSION_KEY, selectedSession);
      else localStorage.removeItem(SESSION_KEY);
    } catch (error) {}
    document.dispatchEvent(
      new CustomEvent("ccc:session-selected", { detail: { session: selectedSession } })
    );
  }

  window.addEventListener("storage", function (event) {
    if (event.key === CONFIG_KEY) {
      config = readConfig();
      document.dispatchEvent(new CustomEvent("ccc:config-changed"));
    }
    if (event.key === SESSION_KEY) {
      selectedSession = String(event.newValue || "");
      document.dispatchEvent(
        new CustomEvent("ccc:session-selected", { detail: { session: selectedSession } })
      );
    }
  });

  window.CCCRuntime = {
    defaultBaseUrl: defaultBaseUrl,
    readConfig: readConfig,
    getConfig: function () {
      return { baseUrl: config.baseUrl, token: config.token };
    },
    isConfigured: function () {
      return Boolean(config.token || hasPairCookie());
    },
    saveConfig: saveConfig,
    getSelectedSession: function () {
      return selectedSession;
    },
    setSelectedSession: setSelectedSession,
    apiUrl: apiUrl,
    request: request,
    requestBlob: requestBlob
  };
})();
