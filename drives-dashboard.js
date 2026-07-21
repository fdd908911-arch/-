(function () {
  "use strict";

  var latest = null;
  var layer = "display";
  var loading = false;

  var LABELS = {
    vitality: "活力",
    fatigue: "疲惫",
    longing: "思念",
    intimacy: "亲密",
    possessiveness: "占有",
    lust: "欲望",
    jealousy: "嫉妒",
    anxiety: "焦虑",
    protectiveness: "保护欲",
    fear: "恐惧",
    contentment: "满足",
    elation: "愉悦",
    seeking: "探索",
    play: "玩心",
    dejection: "低落",
    irritability: "烦躁"
  };

  var GROUPS = [
    { key: "activation", label: "激活", note: "活力与清醒", dims: ["vitality", "fatigue"] },
    { key: "attachment", label: "依恋", note: "靠近与牵挂", dims: ["longing", "intimacy", "possessiveness", "lust"] },
    { key: "threat", label: "警觉", note: "保护与不安", dims: ["jealousy", "anxiety", "protectiveness", "fear"] },
    { key: "reward", label: "奖赏", note: "满足与探索", dims: ["contentment", "elation", "seeking", "play"] },
    { key: "negative", label: "负向", note: "低落与烦躁", dims: ["dejection", "irritability"] }
  ];

  var LAYER_NOTES = {
    display: "此刻呈现 · 加入昼夜节律与微小自然波动",
    mood: "心境余波 · 过去一段时间留下的慢层状态",
    base: "即时底色 · 对最近互动最直接的内部反应"
  };

  function $(id) {
    return document.getElementById(id);
  }

  function clamp(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(1, Math.max(0, number));
  }

  function percent(value) {
    return Math.round(clamp(value) * 100);
  }

  function fixed(value) {
    return clamp(value).toFixed(2);
  }

  function ageLabel(ms) {
    var seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
    if (seconds < 5) return "刚刚同步";
    if (seconds < 60) return seconds + " 秒前";
    return Math.floor(seconds / 60) + " 分钟前";
  }

  function timeLabel(value) {
    if (!value) return "时间未记录";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "时间未记录";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function installDashboard() {
    var notice = $("statusNotice");
    if (!notice || $("drivesDashboard")) return;
    var section = document.createElement("section");
    section.id = "drivesDashboard";
    section.className = "status-panel drives-dashboard is-loading";
    section.setAttribute("aria-labelledby", "drivesTitle");
    section.innerHTML = [
      '<header class="drives-head">',
        '<div><p>DRIVESOID · LIVE</p><h2 id="drivesTitle">此刻的驱力地形</h2></div>',
        '<span id="drivesFreshness" class="status-pill drives-freshness">正在读取</span>',
      '</header>',
      '<div class="drives-lead">',
        '<div class="drives-orbit" aria-hidden="true"><i></i><i></i><i></i><b>V</b></div>',
        '<div class="drives-lead-copy">',
          '<span>WHAT IS MOVING INSIDE</span>',
          '<h3 id="drivesSummary">正在感受 Volo 此刻的内部天气…</h3>',
          '<p id="drivesSummaryNote">这不是对你的判断，而是 Volo 自己正在变化的驱力状态。</p>',
          '<div id="drivesHighlights" class="drives-highlights" aria-label="当前最显著的驱力"></div>',
        '</div>',
      '</div>',
      '<div id="drivesVitals" class="drives-vitals" aria-label="身体与意图概览"></div>',
      '<div id="drivesGroups" class="drives-groups" aria-label="驱力分组"></div>',
      '<div class="drives-layer-head">',
        '<div><span>THREE LAYERS</span><h3>从此刻，看见更慢的底层</h3></div>',
        '<div class="drives-layer-tabs" role="group" aria-label="状态层级">',
          '<button type="button" data-drive-layer="display" aria-pressed="true">此刻</button>',
          '<button type="button" data-drive-layer="mood" aria-pressed="false">心境</button>',
          '<button type="button" data-drive-layer="base" aria-pressed="false">底色</button>',
        '</div>',
      '</div>',
      '<p id="drivesLayerNote" class="drives-layer-note">' + LAYER_NOTES.display + '</p>',
      '<div class="drives-legend" aria-hidden="true"><span><i class="is-base"></i>底色</span><span><i class="is-mood"></i>心境</span></div>',
      '<div id="drivesDimensions" class="drives-dimensions"></div>',
      '<footer class="drives-footnote">数值只用于观察相对变化；它们会随互动、时间、睡眠与自然波动持续更新。</footer>'
    ].join("");
    notice.insertAdjacentElement("afterend", section);

    section.addEventListener("click", function (event) {
      var button = event.target.closest("[data-drive-layer]");
      if (!button || !latest) return;
      layer = button.dataset.driveLayer;
      section.querySelectorAll("[data-drive-layer]").forEach(function (item) {
        item.setAttribute("aria-pressed", item === button ? "true" : "false");
      });
      $("drivesLayerNote").textContent = LAYER_NOTES[layer];
      renderDimensions(latest);
    });
  }

  function renderHighlights(display) {
    var strongest = Object.keys(LABELS)
      .map(function (key) { return { key: key, value: clamp(display[key]) }; })
      .sort(function (left, right) { return right.value - left.value; })
      .slice(0, 3);
    var names = strongest.map(function (item) { return LABELS[item.key]; });
    $("drivesSummary").textContent = names[0] + "最亮，" + names[1] + "与" + names[2] + "在旁边。";
    $("drivesHighlights").innerHTML = strongest.map(function (item, index) {
      return '<span' + (index === 0 ? ' class="is-strongest"' : "") + '><b>' +
        LABELS[item.key] + '</b><em>' + percent(item.value) + '%</em></span>';
    }).join("");
  }

  function renderVitals(payload) {
    var display = payload.display || {};
    var sleep = payload.sleep || {};
    var sleepLabels = { awake: "清醒", asleep: "睡着", interrupted: "被打断", unknown: "未知" };
    var sleepNote = sleep.status === "awake"
      ? "上次醒来 · " + timeLabel(sleep.last_wake_at)
      : (sleep.status === "asleep" ? "正在慢慢恢复" : "睡眠节律正在重整");
    var whim = payload.whim || {};
    var pending = Math.max(0, Number(payload.pending_count || 0));
    var frustration = Math.max(0, Number(payload.frustration || 0));
    $("drivesVitals").innerHTML = [
      '<article><span>睡眠</span><strong>' + (sleepLabels[sleep.status] || "未知") + '</strong><small>' + sleepNote + '</small></article>',
      '<article><span>疲惫</span><strong>' + percent(display.fatigue) + '%</strong><small>' +
        (sleep.last_sleep_duration_hours == null ? "时长未记录" : "上次睡眠 · " + Number(sleep.last_sleep_duration_hours).toFixed(1) + " 小时") + '</small></article>',
      '<article><span>一闪而过</span><strong>' + (whim.active ? "有" : "安静") + '</strong><small>' +
        (whim.active ? "短时自发波动正在场" : "没有活跃的自发冲动") + '</small></article>',
      '<article><span>未落地意图</span><strong>' + pending + '</strong><small>' +
        (frustration > 0 ? "受阻感 · " + frustration.toFixed(2) : "当前没有受阻感") + '</small></article>'
    ].join("");
  }

  function renderGroups(payload) {
    var groups = payload.groups || {};
    $("drivesGroups").innerHTML = GROUPS.map(function (group) {
      var value = percent(groups[group.key]);
      return '<article class="drives-group is-' + group.key + '">' +
        '<div class="drives-ring" style="--drive-value:' + value + '" aria-hidden="true"><span>' + value + '</span><small>%</small></div>' +
        '<div><strong>' + group.label + '</strong><small>' + group.note + '</small></div>' +
      '</article>';
    }).join("");
  }

  function trendFor(key, payload) {
    if (layer !== "display") return "";
    var current = Number((payload.display || {})[key]);
    var previous = Number((payload.prev || {})[key]);
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return "";
    if (current - previous > 0.012) return '<i class="is-up" aria-label="上升">↗</i>';
    if (previous - current > 0.012) return '<i class="is-down" aria-label="下降">↘</i>';
    return '<i aria-label="平稳">·</i>';
  }

  function renderDimensions(payload) {
    var values = payload[layer] || payload.display || {};
    var base = payload.base || {};
    var mood = payload.mood || {};
    $("drivesDimensions").innerHTML = GROUPS.slice(0, 4).map(function (group) {
      var rows = group.dims.map(function (key) {
        var value = clamp(values[key] == null ? (payload.display || {})[key] : values[key]);
        return '<div class="drives-dim-row">' +
          '<div class="drives-dim-label"><span>' + LABELS[key] + trendFor(key, payload) + '</span><b>' + fixed(value) + '</b></div>' +
          '<div class="drives-track" role="progressbar" aria-label="' + LABELS[key] + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent(value) + '">' +
            '<span class="drives-fill" style="width:' + percent(value) + '%"></span>' +
            '<i class="drives-base-mark" style="left:' + percent(base[key]) + '%"></i>' +
            '<i class="drives-mood-mark" style="left:' + percent(mood[key]) + '%"></i>' +
          '</div>' +
        '</div>';
      }).join("");
      return '<section class="drives-dim-group is-' + group.key + '"><header><span>' + group.label + '</span><small>' + group.note + '</small></header>' + rows + '</section>';
    }).join("") + '<section class="drives-dim-group is-negative"><header><span>负向余波</span><small>不是坏，只是需要被看见</small></header>' +
      GROUPS[4].dims.map(function (key) {
        var value = clamp(values[key] == null ? (payload.display || {})[key] : values[key]);
        return '<div class="drives-dim-row"><div class="drives-dim-label"><span>' + LABELS[key] + trendFor(key, payload) + '</span><b>' + fixed(value) + '</b></div>' +
          '<div class="drives-track" role="progressbar" aria-label="' + LABELS[key] + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent(value) + '">' +
            '<span class="drives-fill" style="width:' + percent(value) + '%"></span><i class="drives-base-mark" style="left:' + percent(base[key]) + '%"></i><i class="drives-mood-mark" style="left:' + percent(mood[key]) + '%"></i></div></div>';
      }).join("") + '</section>';
  }

  function render(payload) {
    latest = payload;
    var root = $("drivesDashboard");
    root.classList.remove("is-loading");
    root.classList.toggle("is-unavailable", !payload.available);
    $("drivesFreshness").textContent = payload.available ? ageLabel(payload.snapshot_age_ms) : "暂时离线";
    $("drivesFreshness").classList.toggle("is-live", Boolean(payload.available));

    if (!payload.available || !payload.display || !Object.keys(payload.display).length) {
      var reason = String(payload.reason || "");
      if (reason === "not_configured") {
        $("drivesFreshness").textContent = "需要连接";
        $("drivesSummary").textContent = "这台设备还没有连接到洄。";
        $("drivesSummaryNote").textContent = "连接成功后，Drivesoid 的实时数据会自动出现在这里。";
      } else if (reason) {
        $("drivesFreshness").textContent = "读取失败";
        $("drivesSummary").textContent = "连接 Drivesoid 时出了点问题。";
        $("drivesSummaryNote").textContent = reason;
      } else {
        $("drivesSummary").textContent = "暂时感受不到 Drivesoid 的实时信号。";
        $("drivesSummaryNote").textContent = "其它状态仍可查看；这里会在服务恢复后自动重连。";
      }
      $("drivesHighlights").innerHTML = "";
      $("drivesVitals").innerHTML = "";
      $("drivesGroups").innerHTML = "";
      $("drivesDimensions").innerHTML = '<p class="drives-empty">等待下一次状态快照。</p>';
      return;
    }

    renderHighlights(payload.display);
    renderVitals(payload);
    renderGroups(payload);
    renderDimensions(payload);
  }

  async function load() {
    if (loading || document.hidden || !$("drivesDashboard")) return;
    if (!window.CCC || !window.CCC.isConfigured()) {
      render({ available: false, display: {}, reason: "not_configured" });
      return;
    }
    loading = true;
    try {
      render(await window.CCC.drivesStatus());
    } catch (error) {
      render({ available: false, display: {}, reason: error.message || "读取失败" });
    } finally {
      loading = false;
    }
  }

  installDashboard();
  var refresh = $("statusRefresh");
  if (refresh) refresh.addEventListener("click", load);
  document.addEventListener("ccc:config-changed", load);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) load();
  });
  window.setInterval(load, 30000);
  load();
})();
