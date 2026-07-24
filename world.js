(function () {
  "use strict";

  var list = document.getElementById("insideList");
  var refreshButton = document.getElementById("insideRefresh");
  var health = document.getElementById("insideHealth");
  var notice = document.getElementById("insideNotice");
  var totalValue = document.getElementById("insideTotal");
  var sharedValue = document.getElementById("insideShared");
  var lockedValue = document.getElementById("insideLocked");
  var hasRendered = false;
  var loading = false;

  if (!list || !refreshButton || !health) return;

  function element(tag, className, text) {
    var result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }

  function icon(symbolId) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#" + symbolId);
    svg.setAttribute("aria-hidden", "true");
    svg.appendChild(use);
    return svg;
  }

  function asDate(value) {
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function relativeTime(value) {
    var date = asDate(value);
    if (!date) return "刚刚";
    var minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return minutes + " 分钟前";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + " 小时前";
    return Math.floor(hours / 24) + " 天前";
  }

  function exactTime(value) {
    var date = asDate(value);
    if (!date) return "";
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    } catch (error) {
      return date.toLocaleString();
    }
  }

  function warmth(value) {
    var date = asDate(value);
    if (!date) return "仍在余温中";
    var minutes = Math.ceil(Math.max(0, date.getTime() - Date.now()) / 60000);
    if (minutes <= 1) return "快要散去了";
    if (minutes < 60) return "还剩 " + minutes + " 分钟";
    return "还剩约 " + Math.ceil(minutes / 60) + " 小时";
  }

  function isVisible(item) {
    return Boolean(
      item &&
      item.locked === false &&
      item.visibility === "shared" &&
      typeof item.inside === "string" &&
      item.inside.length > 0
    );
  }

  function cardFor(item) {
    var shared = isVisible(item);
    var card = element("article", "inside-card " + (shared ? "is-shared" : "is-locked"));
    var top = element("div", "inside-card-top");
    var kind = element("span", "inside-kind");
    kind.appendChild(icon(shared ? "world-icon-inside" : "world-icon-lock"));
    kind.appendChild(document.createTextNode(shared ? "给你看的" : "留给自己的"));

    var time = element("time", "inside-time", relativeTime(item && item.occurred_at));
    if (item && item.occurred_at) {
      time.dateTime = item.occurred_at;
      time.title = exactTime(item.occurred_at);
    }
    top.appendChild(kind);
    top.appendChild(time);
    card.appendChild(top);

    if (shared) {
      card.appendChild(element("blockquote", "inside-words", item.inside));
    } else {
      var lockBody = element("div", "inside-lock-body");
      var lockContent = element("div");
      var lockMark = element("span", "inside-lock-mark");
      lockMark.appendChild(icon("world-icon-lock"));
      lockContent.appendChild(lockMark);
      lockContent.appendChild(element("strong", "", "这一下，Volo 选择留给自己。"));
      lockContent.appendChild(element("p", "", "你能看到它存在，但不会看到里面。"));
      lockBody.appendChild(lockContent);
      card.appendChild(lockBody);
    }

    var footer = element("footer", "inside-card-footer");
    footer.appendChild(element("span", "", exactTime(item && item.occurred_at)));
    footer.appendChild(element("span", "inside-warmth", warmth(item && item.expires_at)));
    card.appendChild(footer);
    return card;
  }

  function emptyState(title, copy) {
    var empty = element("div", "inside-empty");
    var content = element("div");
    content.appendChild(element("strong", "", title));
    content.appendChild(element("p", "", copy));
    empty.appendChild(content);
    return empty;
  }

  function render(payload) {
    var items = Array.isArray(payload && payload.items) ? payload.items : [];
    var fragment = document.createDocumentFragment();
    var sharedCount = 0;

    items.forEach(function (item) {
      if (isVisible(item)) sharedCount += 1;
      fragment.appendChild(cardFor(item));
    });
    if (!items.length) {
      fragment.appendChild(
        emptyState("现在很安静。", "还没有停留在 48 小时余温里的 Inside。")
      );
    }

    list.replaceChildren(fragment);
    list.classList.remove("is-loading");
    list.setAttribute("aria-busy", "false");
    totalValue.textContent = String(items.length);
    sharedValue.textContent = String(sharedCount);
    lockedValue.textContent = String(items.length - sharedCount);
    hasRendered = true;
  }

  function setLoading(active) {
    loading = active;
    refreshButton.disabled = active;
    refreshButton.classList.toggle("is-spinning", active);
    if (!hasRendered) list.setAttribute("aria-busy", active ? "true" : "false");
  }

  function setHealth(text, isError) {
    var dot = health.querySelector("i") || element("i");
    dot.setAttribute("aria-hidden", "true");
    health.replaceChildren(dot, document.createTextNode(" " + text));
    health.classList.toggle("is-error", Boolean(isError));
  }

  async function loadInside() {
    if (loading) return;
    setLoading(true);
    notice.textContent = "";
    setHealth("正在感受余温", false);

    try {
      if (!window.CCC || typeof window.CCC.inside !== "function") {
        throw new Error("Inside 连接尚未准备好");
      }
      var payload = await window.CCC.inside(60);
      render(payload);
      var now = new Date();
      setHealth(
        "已同步 · " +
          String(now.getHours()).padStart(2, "0") +
          ":" +
          String(now.getMinutes()).padStart(2, "0"),
        false
      );
    } catch (error) {
      if (!hasRendered) {
        list.replaceChildren(
          emptyState("暂时看不到这里。", "请确认已经连接 Maneo，再回来试一次。")
        );
        list.classList.remove("is-loading");
        list.setAttribute("aria-busy", "false");
        totalValue.textContent = "—";
        sharedValue.textContent = "—";
        lockedValue.textContent = "—";
      }
      setHealth("连接没有回应", true);
      notice.textContent = error && error.message ? error.message : "Inside 加载失败";
    } finally {
      setLoading(false);
    }
  }

  refreshButton.addEventListener("click", loadInside);
  document.addEventListener("ccc:config-changed", loadInside);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) loadInside();
  });
  window.setInterval(function () {
    if (!document.hidden) loadInside();
  }, 60000);

  loadInside();
})();
