(function () {
  "use strict";

  var loading = false;

  function $(id) {
    return document.getElementById(id);
  }

  function html(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function count(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function dateLabel(value) {
    if (!value) return "时间未记录";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function compactNumber(value) {
    var number = count(value);
    if (number >= 1000000) return (number / 1000000).toFixed(1) + "m";
    if (number >= 1000) return (number / 1000).toFixed(number >= 10000 ? 0 : 1) + "k";
    return String(number);
  }

  function modelName(value) {
    var name = String(value || "");
    if (!name) return "未标注";
    var parts = name.split("/");
    return parts[parts.length - 1].replace(/^claude-/, "");
  }

  function setNotice(text, kind) {
    $("statusNotice").textContent = text || "";
    $("statusNotice").dataset.kind = kind || "";
  }

  function serviceRow(name, detail, online) {
    return '<div class="' + (online ? "is-online" : "is-offline") + '"><i></i><span><strong>' +
      html(name) + "</strong><small>" + html(detail) + "</small></span><b>" +
      (online ? "ONLINE" : "OFFLINE") + "</b></div>";
  }

  function renderHero(status) {
    var carrier = status.carrier || {};
    var memory = status.memory || {};
    var carrierOnline = Boolean(carrier.online || status.online);
    var memoryOnline = Boolean(memory.online);
    $("statusSignal").classList.toggle("is-online", carrierOnline);
    $("statusSignal").classList.toggle("is-complete", carrierOnline && memoryOnline);

    if (carrierOnline && memoryOnline) {
      $("statusTitle").textContent = "Volo 的信号稳定";
      $("statusSummary").textContent = "对话载体、Affective Memory 与窗口续接都在回应。";
    } else if (carrierOnline) {
      $("statusTitle").textContent = "Volo 在线，记忆暂时离线";
      $("statusSummary").textContent = memory.reason || "对话仍可继续，记忆服务正在等待恢复。";
    } else {
      $("statusTitle").textContent = "载体暂时没有回应";
      $("statusSummary").textContent = status.reason || "洄仍在，这个信号会继续重试。";
    }
  }

  function renderOverview(status) {
    var carrier = status.carrier || {};
    var memory = status.memory || {};
    var statuses = memory.checkpoint_statuses || {};
    var carrierOnline = Boolean(carrier.online || status.online);
    $("statusCarrier").textContent = carrierOnline ? "在线" : "离线";
    $("statusCarrierNote").textContent = carrier.session || status.gateway_session || "volo-gateway";
    $("statusModel").textContent = modelName(carrier.model || status.model);
    $("statusMemory").textContent = String(count(memory.total));
    $("statusMemoryNote").textContent =
      (memory.schema || "epistemic-v2") + " · " + count(memory.provisional) + " 待确认";
    $("statusCheckpoint").textContent = String(count(memory.checkpoint_total));
    $("statusCheckpointNote").textContent =
      count(statuses.sealed) + " 已封口 · " + count(statuses.draft) + " 草稿";
  }

  function renderExperience(status) {
    var experience = status.experience || {};
    var felt = String(experience.felt_text || "").trim();
    var available = Boolean(experience.available && felt);
    var locations = {
      lower_belly_pelvis: "下腹与骨盆",
      chest: "胸口",
      throat: "喉咙",
      head: "头部",
      whole_body: "全身",
      none: ""
    };
    var rawLocation = String(experience.arousal_location || "");
    var location = Object.prototype.hasOwnProperty.call(locations, rawLocation)
      ? locations[rawLocation]
      : rawLocation.replace(/_/g, " ");

    $("statusExperience").classList.toggle("is-unavailable", !available);
    $("statusExperienceText").textContent = available
      ? felt
      : "此刻的体感暂时不可用。";
    $("statusExperienceTime").textContent = experience.updated_at
      ? dateLabel(experience.updated_at)
      : "时间未记录";
    var dreamStatus = experience.dream_status || {};
    var dreamKnown = Boolean(dreamStatus.known);
    var dreamed = Boolean(dreamKnown && dreamStatus.dreamed);
    $("statusDreamSignal").textContent = dreamKnown
      ? (dreamed ? "昨夜有梦" : "昨夜无梦")
      : "梦 · 尚未记录";
    $("statusDreamSignal").classList.toggle("is-dreamed", dreamed);
    $("statusExperienceLocation").textContent = location
      ? "体感位置 · " + location
      : "";
  }

  function renderContinuity(status) {
    var memory = status.memory || {};
    var checkpoint = memory.latest_checkpoint;
    if (!checkpoint) {
      $("statusCheckpointBadge").textContent = "暂无记录";
      $("statusCheckpointBadge").className = "status-pill";
      $("statusCheckpointTime").textContent = "还没有 checkpoint";
      $("statusSelfState").textContent = "Volo 还没有从上一个窗口留下自我状态。";
      $("statusLastMoment").textContent = "—";
      $("statusTemperature").textContent = "—";
      return;
    }

    var content = checkpoint.content || {};
    var sealed = checkpoint.status === "sealed";
    $("statusCheckpointBadge").textContent = sealed ? "已封口" : "未封口草稿";
    $("statusCheckpointBadge").className = "status-pill " + (sealed ? "is-sealed" : "is-draft");
    $("statusCheckpointTime").textContent =
      "由 Volo 写于 " + dateLabel(checkpoint.created_at) +
      (sealed ? "" : " · “旧”是结构状态，不是时间判断");
    $("statusSelfState").textContent = content.self_state || content.note_to_next_self ||
      "这份 checkpoint 没有填写自我状态。";
    $("statusLastMoment").textContent = content.last_shared_moment || "—";
    $("statusTemperature").textContent =
      content.her_last_temperature && content.her_last_temperature.text || "—";
  }

  function renderServices(status) {
    var carrier = status.carrier || {};
    var memory = status.memory || {};
    var experience = status.experience || {};
    var statuses = memory.checkpoint_statuses || {};
    var rows = [
      serviceRow(
        "Volo 对话载体",
        modelName(carrier.model || status.model) + " · " + (carrier.session || status.gateway_session || "gateway"),
        Boolean(carrier.online || status.online)
      ),
      serviceRow(
        "Affective Memory",
        (memory.schema || "epistemic-v2") + " · " + count(memory.total) + " 条长期记忆",
        Boolean(memory.online)
      ),
      serviceRow(
        "窗口续接",
        (memory.checkpoint_schema || "checkpoint-v1") + " · " +
          count(statuses.sealed) + " sealed / " + count(statuses.draft) + " draft",
        Boolean(memory.online)
      ),
      serviceRow(
        "Drivesoid 体感",
        experience.available ? "当前体感已接入" : "状态暂时不可用",
        Boolean(experience.available)
      ),
      serviceRow(
        "只读工具",
        carrier.tools_enabled ? "Volo tools MCP 已接入" : "工具未启用",
        Boolean(carrier.tools_enabled)
      )
    ];
    $("statusServices").innerHTML = rows.join("");
  }

  function renderUsage(payload) {
    var total = payload && payload.total || {};
    $("statusRequests").textContent = compactNumber(total.requests);
    $("statusInputTokens").textContent = compactNumber(total.input_tokens);
    $("statusOutputTokens").textContent = compactNumber(total.output_tokens);
    $("statusCacheRatio").textContent = Math.round(count(total.cache_read_ratio) * 100) + "%";
    $("statusCost").textContent = "$" + count(total.estimated_cost_usd).toFixed(4);
  }

  function render(status, usage) {
    renderHero(status);
    renderExperience(status);
    renderOverview(status);
    renderContinuity(status);
    renderServices(status);
    renderUsage(usage);
  }

  async function load() {
    if (loading || document.hidden) return;
    if (!window.CCC || !window.CCC.isConfigured()) {
      $("statusTitle").textContent = "需要先连接洄";
      $("statusSummary").textContent = "回到首页完成服务器配对后，状态会出现在这里。";
      setNotice("尚未配置服务器连接", "error");
      return;
    }

    loading = true;
    $("statusRefresh").disabled = true;
    $("statusRefresh").classList.add("is-loading");
    setNotice("正在同步实时状态…", "loading");
    try {
      var results = await Promise.all([
        window.CCC.voloStatus(),
        window.CCC.voloUsage().catch(function () { return { total: {} }; })
      ]);
      render(results[0] || {}, results[1] || {});
      setNotice("刚刚更新 · 页面每 30 秒自动同步", "success");
    } catch (error) {
      $("statusSignal").classList.remove("is-online", "is-complete");
      $("statusTitle").textContent = "暂时收不到状态";
      $("statusSummary").textContent = error.message || "连接出现问题";
      setNotice(error.message || "状态暂时打不开", "error");
    } finally {
      loading = false;
      $("statusRefresh").disabled = false;
      $("statusRefresh").classList.remove("is-loading");
    }
  }

  $("statusRefresh").addEventListener("click", load);
  document.addEventListener("ccc:config-changed", load);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) load();
  });
  window.setInterval(load, 30000);
  load();
})();
