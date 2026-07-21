(function () {
  "use strict";

  function create() {
    var view = document.getElementById("voloView");
    var button = document.getElementById("voloUsageButton");
    var sidebar = document.getElementById("voloUsageSidebar");
    var close = document.getElementById("voloUsageClose");
    var refresh = document.getElementById("voloUsageRefresh");
    var status = document.getElementById("voloUsageStatus");
    var recent = document.getElementById("voloUsageRecent");
    var open = window.matchMedia("(min-width: 761px)").matches;
    var gateway = false;
    var loading = false;
    var bound = false;

    function node(id) {
      return document.getElementById(id);
    }

    function setText(id, value) {
      var target = node(id);
      if (target) target.textContent = value;
    }

    function number(value) {
      var parsed = Number(value || 0);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatNumber(value) {
      return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(number(value));
    }

    function formatRate(value) {
      return (Math.max(0, number(value)) * 100).toFixed(1) + "%";
    }

    function formatCost(value) {
      return "$" + number(value).toFixed(6);
    }

    function asDate(value) {
      var parsed = Number(value);
      var date = Number.isFinite(parsed) ? new Date(parsed * 1000) : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    function shortTime(value) {
      var date = value ? new Date(value) : new Date();
      if (Number.isNaN(date.getTime())) date = new Date();
      return new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(date);
    }

    function setOpen(next) {
      open = Boolean(next);
      view.classList.toggle("is-usage-open", gateway && open);
      button.hidden = !gateway;
      sidebar.hidden = !gateway || !open;
      sidebar.setAttribute("aria-hidden", String(!gateway || !open));
      button.setAttribute("aria-expanded", String(gateway && open));
      if (gateway && open) load();
    }

    function render(payload) {
      var total = payload && payload.total ? payload.total : {};
      var rows = payload && Array.isArray(payload.recent) ? payload.recent : [];
      var latest = rows[0] || {};
      var requests = number(total.requests);
      status.classList.remove("is-error");
      status.textContent = requests
        ? "已记录 " + formatNumber(requests) + " 次 · 仅当前 Gateway 会话"
        : "等待第一条 Gateway 对话";

      var latestDate = asDate(latest.created_at);
      setText("voloUsageTime", latestDate ? latestDate.toLocaleString("zh-CN", { hour12: false }) : "—");
      setText("voloUsageInput", rows.length ? formatNumber(latest.input_tokens) : "—");
      setText("voloUsageOutput", rows.length ? formatNumber(latest.output_tokens) : "—");
      setText("voloUsageCacheRead", rows.length ? formatNumber(latest.cache_read_input_tokens) : "—");
      setText("voloUsageHitRate", rows.length ? formatRate(latest.cache_read_ratio) : "—");
      setText("voloUsageWrite5m", rows.length ? formatNumber(latest.cache_write_5m_tokens) + " tokens" : "—");
      setText("voloUsageWrite1h", rows.length ? formatNumber(latest.cache_write_1h_tokens) + " tokens" : "—");
      setText("voloUsageCreation", rows.length ? formatNumber(latest.cache_creation_input_tokens) + " tokens" : "—");
      setText("voloUsageCost", rows.length ? formatCost(latest.estimated_cost_usd) : "—");
      setText("voloUsageModel", latest.model || "—");
      setText("voloUsageFinish", latest.finish_reason || "—");
      setText("voloUsageRequests", formatNumber(requests) + " 次请求");
      setText("voloUsageTotalIO", formatNumber(total.input_tokens) + " / " + formatNumber(total.output_tokens));
      setText("voloUsageTotalRead", formatNumber(total.cache_read_input_tokens) + " tokens");
      setText("voloUsageTotalRate", formatRate(total.cache_read_ratio));
      setText("voloUsageTotalCost", formatCost(total.estimated_cost_usd));

      recent.replaceChildren();
      if (!rows.length) {
        var empty = document.createElement("p");
        empty.textContent = "暂无记录";
        recent.appendChild(empty);
        return;
      }
      rows.forEach(function (request) {
        var row = document.createElement("article");
        row.className = "volo-usage-request";
        var time = document.createElement("time");
        var date = asDate(request.created_at);
        time.textContent = date ? shortTime(date.toISOString()) : "—";
        var summary = document.createElement("span");
        summary.textContent = "入 " + formatNumber(request.input_tokens) + " · 出 " + formatNumber(request.output_tokens);
        var rate = document.createElement("strong");
        rate.textContent = formatRate(request.cache_read_ratio);
        rate.title = "缓存读取 " + formatNumber(request.cache_read_input_tokens) + " tokens";
        row.append(time, summary, rate);
        recent.appendChild(row);
      });
    }

    async function load() {
      if (!gateway || loading || !window.CCC.isConfigured()) return;
      loading = true;
      status.classList.remove("is-error");
      status.textContent = "正在读取 Gateway 账本…";
      try {
        render(await window.CCC.voloUsage());
      } catch (error) {
        status.classList.add("is-error");
        status.textContent = "账本暂时不可用 · " + error.message;
      } finally {
        loading = false;
      }
    }

    function updateCarrier(isGateway) {
      gateway = Boolean(isGateway);
      if (!gateway) {
        view.classList.remove("is-usage-open");
        button.hidden = true;
        sidebar.hidden = true;
        sidebar.setAttribute("aria-hidden", "true");
        button.setAttribute("aria-expanded", "false");
        return;
      }
      setOpen(open);
    }

    function bind() {
      if (bound) return;
      bound = true;
      button.addEventListener("click", function () { setOpen(!open); });
      close.addEventListener("click", function () { setOpen(false); });
      refresh.addEventListener("click", load);
    }

    return {
      bind: bind,
      load: load,
      render: render,
      updateCarrier: updateCarrier
    };
  }

  window.VoloUsage = { create: create };
})();
