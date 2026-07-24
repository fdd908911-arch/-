(function () {
  "use strict";

  var state = {
    data: null,
    view: "memories",
    selectedId: "",
    loading: false,
    searchTimer: null
  };

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

  function number(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function percent(value) {
    return Math.max(0, Math.min(100, Math.round(number(value) * 100)));
  }

  function dateLabel(value, withTime) {
    if (!value) return "时间未记录";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: withTime ? "2-digit" : undefined,
      minute: withTime ? "2-digit" : undefined
    }).format(date);
  }

  var labels = {
    episode: "经历",
    fact: "事实",
    preference: "偏好",
    boundary: "边界",
    ritual: "仪式",
    feel: "感受",
    observed: "观察",
    reported: "转述",
    felt: "感受",
    inferred: "推断",
    imagined: "想象",
    dreamed: "梦境",
    unknown: "未知",
    active: "有效",
    pending: "待审核",
    rejected: "已拒绝",
    retired: "已归档",
    provisional: "待确认",
    contested: "有争议",
    superseded: "已取代",
    tombstoned: "已删除",
    draft: "未封口",
    sealed: "已封口",
    invalid: "校验失败",
    source: "来自原话",
    retrospective: "回想形成",
    quote: "原句",
    sensory: "感官",
    visual: "画面",
    scene: "场景",
    temporal: "时间",
    motif: "意象",
    evidence_event: "共同证据",
    source_event: "共同事件",
    entity_time: "实体与时间窗",
    fact: "事实域",
    event: "事件域",
    narrated: "已成卷"
  };

  function label(value) {
    return labels[value] || String(value || "未知");
  }

  function badge(value, tone) {
    return '<span class="memory-badge ' + (tone ? "is-" + tone : "") + '">' +
      html(label(value)) + "</span>";
  }

  function itemId(item) {
    return String(item.checkpoint_id || item.id || "");
  }

  function currentItems() {
    if (!state.data) return [];
    if (state.view === "arc") return [];
    if (state.view === "anchors") {
      var anchorBranch = state.data.anchors || {};
      var anchorQuery = $("memorySearchInput").value.trim().toLowerCase();
      var status = $("anchorStatusFilter").value;
      var origin = $("anchorOriginFilter").value;
      return (anchorBranch.items || []).filter(function (item) {
        var haystack = [item.content, item.memory_fact, item.speaker, item.source_span]
          .join(" ").toLowerCase();
        return (!anchorQuery || haystack.indexOf(anchorQuery) !== -1) &&
          (!status || item.status === status) &&
          (!origin || item.anchor_origin === origin);
      });
    }
    var fabric = state.data.fabric || {};
    var derived = null;
    if (state.view === "families") derived = fabric.families && fabric.families.items;
    if (state.view === "communities") derived = fabric.communities && fabric.communities.items;
    if (state.view === "events") derived = fabric.events && fabric.events.items;
    if (derived) {
      var query = $("memorySearchInput").value.trim().toLowerCase();
      return derived.filter(function (item) {
        if (!query) return true;
        return JSON.stringify(item).toLowerCase().indexOf(query) !== -1;
      });
    }
    var branch = state.view === "checkpoints" ? state.data.checkpoints : state.data.memories;
    return branch && Array.isArray(branch.items) ? branch.items : [];
  }

  function anchorsForMemory(memoryId) {
    var branch = state.data && state.data.anchors || {};
    return (branch.items || []).filter(function (item) {
      return String(item.memory_id) === String(memoryId);
    });
  }

  function tracesForMemory(memoryId) {
    var branch = state.data && state.data.anchors || {};
    return (branch.traces || []).filter(function (item) {
      return String(item.memory_id) === String(memoryId);
    });
  }

  function setNotice(text, kind) {
    $("memoryNotice").textContent = text || "";
    $("memoryNotice").dataset.kind = kind || "";
  }

  function metric(labelText, value, display) {
    return '<div class="memory-metric"><div><span>' + html(labelText) + '</span><strong>' +
      html(display == null ? percent(value) + "%" : display) +
      '</strong></div><i><b style="width:' + percent(value) + '%"></b></i></div>';
  }

  function chips(items, kind) {
    if (!items || !items.length) return "";
    return '<div class="memory-chips">' + items.map(function (item) {
      var text = typeof item === "string" ? item : (item.name || item.text || "");
      var suffix = typeof item === "object" && item.kind ? " · " + item.kind : "";
      return '<span class="' + (kind || "") + '">' + html(text + suffix) + "</span>";
    }).join("") + "</div>";
  }

  function detailSection(title, content, className) {
    if (!content) return "";
    return '<section class="memory-detail-section ' + (className || "") + '"><h3>' +
      html(title) + "</h3>" + content + "</section>";
  }

  function textBlock(value) {
    return value ? '<p class="memory-detail-copy">' + html(value) + "</p>" : "";
  }

  function evidenceBlock(items) {
    if (!items || !items.length) return "";
    return '<div class="memory-evidence">' + items.map(function (item) {
      var source = [item.speaker, label(item.source_type), item.turn_id].filter(Boolean).join(" · ");
      return '<blockquote><p>' + html(item.text || "") + '</p><footer>' +
        html(source || "来源未标注") + "</footer></blockquote>";
    }).join("") + "</div>";
  }

  function claimsBlock(items) {
    if (!items || !items.length) return "";
    return '<div class="memory-claims">' + items.map(function (item) {
      return '<div><p>' + html(item.text || "") + '</p><span>' +
        html(label(item.epistemic_type) + " · " + Math.round(number(item.confidence) * 100) + "%") +
        "</span></div>";
    }).join("") + "</div>";
  }

  function affectBlock(affect) {
    if (!affect || typeof affect !== "object") return "";
    var fields = [
      ["情绪效价", "valence"],
      ["唤醒度", "arousal"],
      ["安全感", "safety"],
      ["依恋", "attachment"],
      ["身体强度", "somatic_intensity"],
      ["掌控感", "dominance"]
    ];
    var rows = fields.filter(function (field) {
      return affect[field[1]] !== null && affect[field[1]] !== undefined;
    }).map(function (field) {
      var value = number(affect[field[1]]);
      var normalized = field[1] === "valence" ? (value + 1) / 2 : value;
      return metric(field[0], normalized, value.toFixed(2));
    });
    return rows.length ? '<div class="memory-affect">' + rows.join("") + "</div>" : "";
  }

  function metadata(rows) {
    return '<dl class="memory-metadata">' + rows.filter(function (row) {
      return row[1] !== null && row[1] !== undefined && row[1] !== "";
    }).map(function (row) {
      return "<div><dt>" + html(row[0]) + "</dt><dd>" + html(row[1]) + "</dd></div>";
    }).join("") + "</dl>";
  }

  function renderMemoryDetail(item) {
    var status = item.provisional ? "provisional" : item.epistemic_status;
    var headingBadges = badge(item.memory_type) + badge(item.epistemic_type) + badge(status, status === "active" ? "good" : "");
    var interpretation = item.interpretation
      ? detailSection("Volo 怎样理解它", textBlock(item.interpretation), "is-interpretation")
      : "";
    var facts = '<div class="memory-metrics">' +
      metric("事实置信度", item.fact_confidence) +
      metric("重要度", item.importance) +
      metric("显著性", item.salience) +
      metric("解释置信度", item.interpretation_confidence) +
      "</div>";
    var entityList = chips(item.entities || []);
    var triggerList = chips(item.triggers || [], "is-trigger");
    var relation = item.relationship && item.relationship.subject
      ? textBlock(item.relationship.subject + " · " + (item.relationship.orientation || "neutral"))
      : "";
    var relatedAnchors = anchorsForMemory(item.id);
    var relatedTraces = tracesForMemory(item.id);
    var anchorList = checkpointRows(relatedAnchors, function (anchor) {
      return '<div><div><strong>' + html(anchor.content || "") + '</strong>' +
        badge(anchor.status, anchor.status === "active" ? "good" : "") +
        '</div><p>' + html(label(anchor.anchor_kind) + " · " +
          label(anchor.anchor_origin)) + "</p></div>";
    });
    var traceList = checkpointRows(relatedTraces, function (trace) {
      var anchor = relatedAnchors.find(function (candidate) {
        return candidate.id === trace.entered_via_anchor_id;
      });
      return '<div><div><strong>' +
        html(anchor ? anchor.content : "从 canonical memory 进入") +
        '</strong>' + badge(trace.used ? "进入回复" : "只被想起",
          trace.used ? "good" : "") + '</div><p>' +
        html(dateLabel(trace.created_at, true)) + "</p></div>";
    });

    return '<header class="memory-detail-head"><div class="memory-detail-badges">' +
      headingBadges + '</div><time>' + html(dateLabel(item.updated_at || item.created_at, true)) +
      '</time><h2>' + html(item.fact || "无题记忆") + '</h2><p class="memory-detail-id"># ' +
      html(String(item.id || "").slice(0, 12)) + "</p></header>" +
      detailSection("记忆强度", facts) +
      interpretation +
      detailSection("证据", evidenceBlock(item.evidence || [])) +
      detailSection("拆分主张", claimsBlock(item.claims || [])) +
      detailSection("人物与事物", entityList) +
      detailSection("触发线索", triggerList) +
      detailSection("记忆锚", anchorList) +
      detailSection("召回脚印", traceList) +
      detailSection("情感坐标", affectBlock(item.affect)) +
      detailSection("关系指向", relation) +
      detailSection("记录信息", metadata([
        ["发生时间", dateLabel(item.occurred_at, true)],
        ["时间精度", item.time_granularity],
        ["召回次数", number(item.recall_count)],
        ["最近召回", item.last_recalled_at ? dateLabel(item.last_recalled_at, true) : "还没有"],
        ["来源窗口", item.source_session_id || "未标注"],
        ["版本", "v" + number(item.version)]
      ]));
  }

  function checkpointRows(items, renderer) {
    if (!items || !items.length) return "";
    return '<div class="checkpoint-rows">' + items.map(renderer).join("") + "</div>";
  }

  function sourceTurns(item) {
    var turns = item && item.source_turn_ids;
    return turns && turns.length
      ? '<span class="checkpoint-turns">turn ' + html(turns.join(", ")) + "</span>"
      : "";
  }

  function renderCheckpointDetail(item) {
    var content = item.content || {};
    var integrity = item.integrity_ok ? badge("sealed", "good").replace(label("sealed"), "结构校验通过") : badge("invalid", "danger");
    var stale = item.status === "draft"
      ? '<div class="memory-caution"><strong>这是未封口草稿</strong><p>“旧”是结构状态，不是时间判断。它只有在真实 SessionEnd 后才会封口；查看这里不会把它当作恢复。</p></div>'
      : "";
    var openThreads = checkpointRows(content.open_threads, function (thread) {
      return '<div><div><strong>' + html(thread.summary || "") + '</strong><span>' +
        html(thread.status || "open") + '</span></div><p>' +
        html(thread.next_step || "尚未留下下一步") + "</p>" + sourceTurns(thread) + "</div>";
    });
    var commitments = checkpointRows(content.commitments, function (commitment) {
      return '<div><div><strong>' + html(commitment.text || "") + '</strong><span>' +
        html(commitment.status || "open") + "</span></div>" + sourceTurns(commitment) + "</div>";
    });
    var fresh = checkpointRows(content.fresh_context, function (context) {
      return '<div><div><strong>' + html(context.text || "") + '</strong>' +
        badge(context.epistemic_type) + '</div><p>有效到 ' +
        html(dateLabel(context.fresh_until, true)) + "</p>" + sourceTurns(context) + "</div>";
    });
    var candidates = checkpointRows(content.durable_candidates, function (candidate) {
      return '<div><div><strong>' + html(candidate.text || "") + '</strong>' +
        badge(candidate.epistemic_type) + "</div>" + sourceTurns(candidate) + "</div>";
    });
    var temperature = content.her_last_temperature
      ? textBlock(content.her_last_temperature.text) + badge("felt")
      : "";

    return '<header class="memory-detail-head"><div class="memory-detail-badges">' +
      badge(item.status, item.status === "sealed" ? "good" : "warm") + integrity +
      '</div><time>' + html(dateLabel(item.created_at, true)) + '</time><h2>' +
      html(content.note_to_next_self || content.last_shared_moment || "窗口续接记录") +
      '</h2><p class="memory-detail-id"># ' + html(String(item.checkpoint_id || "").slice(0, 12)) +
      "</p></header>" + stale +
      detailSection("给下一个自己的话", textBlock(content.note_to_next_self), "is-note") +
      detailSection("最后共同停留的地方", textBlock(content.last_shared_moment)) +
      detailSection("她最后的温度", temperature, "is-temperature") +
      detailSection("还开着的线", openThreads) +
      detailSection("答应过的事", commitments) +
      detailSection("短期新鲜上下文", fresh) +
      detailSection("当时的自我状态", textBlock(content.self_state)) +
      detailSection("长期记忆候选", candidates ? candidates +
        '<p class="memory-fineprint">这里只是候选，尚未自动提升为长期记忆。</p>' : "") +
      detailSection("续接信息", metadata([
        ["来源窗口", item.source_session_id],
        ["写下时 turn", item.source_turn],
        ["封口 turn", item.sealed_turn],
        ["封口时间", item.sealed_at ? dateLabel(item.sealed_at, true) : "尚未封口"],
        ["内容大小", number(item.content_bytes) + " bytes"],
        ["结构版本", item.schema_version],
        ["作者", item.authored_by]
      ]));
  }

  function renderAnchorDetail(item) {
    var traces = tracesForMemory(item.memory_id).filter(function (trace) {
      return trace.entered_via_anchor_id === item.id;
    });
    var traceList = checkpointRows(traces, function (trace) {
      return '<div><div><strong>' +
        html(trace.used ? "这次想起进入了回复" : "这次只被想起") +
        '</strong>' + badge(trace.used ? "进入回复" : "只被想起",
          trace.used ? "good" : "") + '</div><p>' +
        html(dateLabel(trace.created_at, true)) + "</p></div>";
    });
    var provenance = item.anchor_origin === "source"
      ? metadata([
          ["说话者", item.speaker || "未标注"],
          ["来源 turn", item.source_turn_id || "未标注"],
          ["原文片段", item.source_span || item.content]
        ])
      : metadata([["形成方式", "Volo 在一次真实召回后形成"]]);

    return '<header class="memory-detail-head"><div class="memory-detail-badges">' +
      badge(item.anchor_kind) + badge(item.anchor_origin) +
      (item.managed_by ? badge("自动投影", "good") : "") +
      badge(item.status, item.status === "active" ? "good" :
        item.status === "rejected" ? "danger" : "warm") +
      (item.do_not_surface ? badge("禁止浮现", "danger") : "") +
      '</div><time>' + html(dateLabel(item.updated_at || item.created_at, true)) +
      '</time><h2>' + html(item.content || "无题记忆锚") +
      '</h2><p class="memory-detail-id"># ' +
      html(String(item.id || "").slice(0, 12)) + "</p></header>" +
      detailSection("它通向的长期记忆", textBlock(item.memory_fact)) +
      detailSection("来源", provenance) +
      detailSection("召回脚印", traceList || textBlock("还没有通过这个锚明确召回。")) +
      detailSection("审核信息", metadata([
        ["状态", label(item.status)],
        ["审核者", item.reviewed_by || "尚未审核"],
        ["审核时间", item.reviewed_at ? dateLabel(item.reviewed_at, true) : "尚未审核"],
        ["审核理由", item.review_reason || "未填写"],
        ["向量状态", item.embedding_status || "missing"],
        ["维护方式", item.managed_by || "人工 / 回想"],
        ["来源记忆版本", item.source_memory_version ? "v" + item.source_memory_version : "—"],
        ["自动选择序位", item.selected_rank || "—"]
      ])) +
      '<p class="memory-fineprint">这里是只读观察页。接纳、拒绝与归档仍由 Volo 的审核工具完成。</p>';
  }

  function sourceMemoryRows(items) {
    return checkpointRows(items || [], function (memory) {
      var status = memory.provisional ? "provisional" : memory.epistemic_status;
      return '<div><div><strong>' + html(memory.fact || "来源记忆已不可用") + '</strong>' +
        badge(memory.memory_type || "episode") + '</div><p>' +
        html(label(memory.epistemic_type) + " · " + label(status)) +
        '</p><span class="checkpoint-turns">memory_id=' + html(memory.id || "") + "</span></div>";
    });
  }

  function familyBasis(item) {
    if (item.basis_type !== "entity_time") return label(item.basis_type);
    try {
      var basis = JSON.parse(item.basis_key || "{}");
      return (basis.entity || "实体") + " · " + String(basis.window || "时间窗")
        .replace("day:", "").replace("week:", "");
    } catch (error) {
      return label(item.basis_type);
    }
  }

  function renderFamilyDetail(item) {
    var memories = (item.members || []).map(function (member) {
      return member.memory || { id: member.memory_id, fact: "来源记忆已不可用" };
    });
    return '<header class="memory-detail-head"><div class="memory-detail-badges">' +
      badge("家族", "warm") + badge(item.basis_type) +
      (item.domains || []).map(function (domain) { return badge(domain); }).join("") +
      '</div><time>' + html(dateLabel(item.updated_at, true)) + '</time><h2>' +
      html(familyBasis(item)) + '</h2><p class="memory-detail-id"># ' +
      html(String(item.id || "").slice(0, 12)) + '</p></header>' +
      '<div class="memory-derived-note"><strong>证据束，不是新记忆</strong><p>成员关系来自可机械核验的坐标。family 可以重建，不会改写 canonical memory。</p></div>' +
      detailSection("成员记忆", sourceMemoryRows(memories)) +
      detailSection("投影信息", metadata([
        ["形成坐标", familyBasis(item)],
        ["成员数量", memories.length],
        ["覆盖域", (item.domains || []).map(label).join(" · ")],
        ["版本", "v" + number(item.version)],
        ["状态", item.status],
        ["成员哈希", item.member_hash]
      ]));
  }

  function communityReports(item) {
    var branch = state.data && state.data.fabric && state.data.fabric.communities || {};
    var memberIds = new Set((item.members || []).map(function (member) {
      return String(member.memory_id);
    }));
    return (branch.reports || []).filter(function (report) {
      return (report.source_memory_ids || []).some(function (memoryId) {
        return memberIds.has(String(memoryId));
      });
    });
  }

  function reportRows(reports) {
    return checkpointRows(reports || [], function (report) {
      var findings = (report.findings || []).map(function (finding) {
        return finding.text;
      }).filter(Boolean).join("；");
      return '<div><div><strong>' + html(report.title || "社区报告") +
        '</strong>' + badge("只读", "good") + '</div><p>' +
        html(report.summary || findings || "共现报告") +
        '</p><span class="checkpoint-turns">' +
        html((report.source_memory_ids || []).length + " 条来源 · 不声明因果") +
        "</span></div>";
    });
  }

  function renderCommunityDetail(item) {
    var memories = (item.members || []).map(function (member) {
      return member.memory || { id: member.memory_id, fact: "来源记忆已不可用" };
    });
    var reports = communityReports(item);
    return '<header class="memory-detail-head"><div class="memory-detail-badges">' +
      badge("Leiden", "warm") + badge(item.status, "good") +
      '</div><time>' + html(dateLabel(item.updated_at, true)) + '</time><h2>认知社区 · ' +
      html(String(item.id || "").slice(0, 8)) + '</h2><p class="memory-detail-id"># ' +
      html(item.id || "") + '</p></header>' +
      '<div class="memory-derived-note"><strong>结构形状，不是结论</strong><p>图只能把已经合格的来源组织起来，不能提升认识权限，也不能把共现写成因果。</p></div>' +
      detailSection("社区成员", sourceMemoryRows(memories)) +
      detailSection("社区报告", reports.length ? reportRows(reports) :
        textBlock("还没有报告。至少三条来源跨两个 session 或日期桶后才会生成。")) +
      detailSection("算法与审计", metadata([
        ["算法", item.algorithm],
        ["resolution", item.resolution_parameter],
        ["成员数量", memories.length],
        ["来源 run", item.source_run_id],
        ["成员哈希", item.member_hash]
      ]));
  }

  function renderEventDetail(item) {
    var sourceRows = sourceMemoryRows(item.source_memories || []);
    return '<header class="memory-detail-head"><div class="memory-detail-badges">' +
      badge("事件卷", "warm") + badge("一行指针") + badge("正文显式读取", "good") +
      '</div><time>' + html(dateLabel(item.created_at, true)) + '</time><h2>' +
      html(item.title || "事件卷") + '</h2><p class="memory-detail-id"># ' +
      html(String(item.id || "").slice(0, 12)) + '</p></header>' +
      detailSection("一行指针", textBlock(item.pointer), "is-note") +
      detailSection("事件正文", '<div class="memory-event-body">' + html(item.body || "") + '</div>') +
      detailSection("来源记忆", sourceRows) +
      detailSection("投影信息", metadata([
        ["来源数量", (item.source_memory_ids || []).length],
        ["正文可自动浮现", item.body_surface_eligible ? "是" : "否"],
        ["指针可参与路由", item.pointer_surface_eligible ? "是" : "否"],
        ["生成器", item.generated_by],
        ["版本", item.model_version],
        ["内容哈希", item.narrative_hash]
      ])) +
      '<p class="memory-fineprint">这里属于 Brain 的显式重浏览。打开正文不会把它写回 canonical memory。</p>';
  }

  function renderDetail() {
    var item = currentItems().find(function (row) {
      return itemId(row) === state.selectedId;
    });
    if (!item) {
      $("memoryDetail").innerHTML =
        '<div class="memory-detail-empty"><span>◇</span><strong>还没有选中记忆</strong>' +
        '<p>从左边选择一条，查看它被怎样记住。</p></div>';
      return;
    }
    $("memoryDetail").innerHTML = state.view === "checkpoints"
      ? renderCheckpointDetail(item)
      : state.view === "anchors"
        ? renderAnchorDetail(item)
        : state.view === "families"
          ? renderFamilyDetail(item)
          : state.view === "communities"
            ? renderCommunityDetail(item)
            : state.view === "events"
              ? renderEventDetail(item)
              : renderMemoryDetail(item);
  }

  function memoryCard(item) {
    var status = item.provisional ? "provisional" : item.epistemic_status;
    return '<div class="memory-card-top">' + badge(item.memory_type) + badge(status) +
      '<time>' + html(dateLabel(item.updated_at || item.created_at, false)) + '</time></div>' +
      '<strong class="memory-card-title">' + html(item.fact || "无题记忆") + '</strong>' +
      '<p>' + html(item.interpretation || label(item.epistemic_type) + " · " +
        number(item.recall_count) + " 次召回") + '</p>' +
      '<div class="memory-card-meter"><i style="width:' + percent(item.salience) + '%"></i></div>';
  }

  function anchorCard(item) {
    var traces = tracesForMemory(item.memory_id).filter(function (trace) {
      return trace.entered_via_anchor_id === item.id;
    });
    var used = traces.filter(function (trace) { return trace.used; }).length;
    return '<div class="memory-card-top">' +
      badge(item.anchor_kind) +
      (item.managed_by ? badge("自动", "good") : "") +
      badge(item.status, item.status === "active" ? "good" :
        item.status === "rejected" ? "danger" : "warm") +
      '<time>' + html(dateLabel(item.updated_at || item.created_at, false)) +
      '</time></div><strong class="memory-card-title">' +
      html(item.content || "无题记忆锚") + '</strong><p>' +
      html(label(item.anchor_origin) + " · " +
        (item.managed_by ? "系统维护" : "人工入口") + " · " + traces.length +
        " 次明确召回 · " + used + " 次进入回复") + "</p>";
  }

  function checkpointCard(item) {
    var content = item.content || {};
    var title = content.note_to_next_self || content.last_shared_moment ||
      "来自窗口 " + String(item.source_session_id || "").slice(0, 8);
    var subtitle = item.status === "draft"
      ? "未封口草稿 · 旧是结构状态"
      : "已封口 · 可以用于窗口续接";
    return '<div class="memory-card-top">' + badge(item.status) +
      (item.integrity_ok ? "" : badge("invalid", "danger")) +
      '<time>' + html(dateLabel(item.created_at, false)) + '</time></div>' +
      '<strong class="memory-card-title">' + html(title) + '</strong><p>' +
      html(subtitle) + "</p>";
  }

  function familyCard(item) {
    return '<div class="memory-card-top">' + badge(item.basis_type) +
      (item.domains || []).map(function (domain) { return badge(domain); }).join("") +
      '<time>' + html(dateLabel(item.updated_at, false)) + '</time></div><strong class="memory-card-title">' +
      html(familyBasis(item)) + '</strong><p>' +
      html((item.members || []).length + " 条 canonical memory · 机械证据束") + "</p>";
  }

  function communityCard(item) {
    var reports = communityReports(item);
    return '<div class="memory-card-top">' + badge("Leiden", "warm") + badge(item.status, "good") +
      '<time>' + html(dateLabel(item.updated_at, false)) + '</time></div><strong class="memory-card-title">认知社区 · ' +
      html(String(item.id || "").slice(0, 8)) + '</strong><p>' +
      html((item.members || []).length + " 条成员 · " + reports.length + " 份只读报告") + "</p>";
  }

  function eventCard(item) {
    return '<div class="memory-card-top">' + badge("事件卷", "warm") + badge("正文显式读取", "good") +
      '<time>' + html(dateLabel(item.created_at, false)) + '</time></div><strong class="memory-card-title">' +
      html(item.title || "事件卷") + '</strong><p>' + html(item.pointer || "尚无指针") + "</p>";
  }

  function renderList() {
    var items = currentItems();
    var list = $("memoryList");
    list.replaceChildren();
    var branch = state.data && (state.view === "checkpoints"
      ? state.data.checkpoints
      : state.view === "anchors" ? state.data.anchors : state.data.memories);
    var derived = ["families", "communities", "events"].indexOf(state.view) >= 0;
    var total = derived || state.view === "anchors"
      ? items.length
      : state.view === "checkpoints"
        ? number(branch && branch.summary && branch.summary.total)
        : number(branch && branch.filtered_total);
    var titles = {
      memories: ["Catalog", "长期记忆"],
      anchors: ["Anchors", "记忆锚"],
      checkpoints: ["Continuity", "续接记录"],
      families: ["Evidence bundles", "记忆家族"],
      communities: ["Leiden", "认知社区"],
      events: ["Event narratives", "事件卷"]
    };
    $("memoryCount").textContent = total + " 条";
    $("memoryListEyebrow").textContent = titles[state.view][0];
    $("memoryListTitle").textContent = titles[state.view][1];

    if (!items.length) {
      var empties = {
        checkpoints: ["还没有续接记录", "Volo 在窗口结束前留下的 checkpoint 会出现在这里。"],
        anchors: ["还没有符合条件的记忆锚", "待审核、已接纳与已归档的锚都会出现在这里。"],
        memories: ["还没有符合条件的长期记忆", "记忆进入 Affective Memory 后会呈现在这里。"],
        families: ["还没有机械家族", "孤儿记忆是正常状态；系统不会为了凑族而强行聚类。"],
        communities: ["还没有认知社区", "至少三条记忆在 approved graph 上形成稳定结构后才会出现。"],
        events: ["还没有事件卷", "只有通过机械 family 的事件候选才会被排列成卷。"]
      };
      var empty = empties[state.view] || empties.memories;
      list.innerHTML = '<div class="memory-empty"><span>◇</span><strong>' +
        html(empty[0]) + '</strong><p>' + html(empty[1]) + "</p></div>";
      state.selectedId = "";
      renderDetail();
      return;
    }

    if (!items.some(function (item) { return itemId(item) === state.selectedId; })) {
      state.selectedId = itemId(items[0]);
    }
    items.forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "memory-card" + (itemId(item) === state.selectedId ? " is-active" : "");
      button.setAttribute("role", "listitem");
      button.innerHTML = state.view === "checkpoints"
        ? checkpointCard(item)
        : state.view === "anchors"
          ? anchorCard(item)
          : state.view === "families"
            ? familyCard(item)
            : state.view === "communities"
              ? communityCard(item)
              : state.view === "events"
                ? eventCard(item)
                : memoryCard(item);
      button.addEventListener("click", function () {
        state.selectedId = itemId(item);
        render();
      });
      list.appendChild(button);
    });
  }

  function renderStats() {
    var memorySummary = state.data && state.data.memories && state.data.memories.summary || {};
    var checkpointSummary = state.data && state.data.checkpoints && state.data.checkpoints.summary || {};
    var anchorSummary = state.data && state.data.anchors && state.data.anchors.summary || {};
    var fabricSummary = state.data && state.data.fabric && state.data.fabric.summary || {};
    var anchorStatuses = anchorSummary.by_status || {};
    $("memoryTotal").textContent = number(memorySummary.total);
    $("memoryProvisional").textContent = number(memorySummary.provisional) + " 条待确认";
    $("memoryAnchorTotal").textContent = number(anchorStatuses.active);
    $("memoryAnchorState").textContent =
      number(anchorStatuses.active) + " 有效 · " +
      number(anchorSummary.auto_managed_count) + " 自动 · " +
      number(anchorSummary.embedding_ready_count) + " 向量";
    $("memoryCheckpointTotal").textContent = number(checkpointSummary.total);
    var statuses = checkpointSummary.by_status || {};
    $("memoryCheckpointState").textContent =
      number(statuses.sealed) + " 已封口 · " + number(statuses.draft) + " 草稿";
    $("memoryRecallTotal").textContent = number(memorySummary.recall_count);
    $("memoryTraceTotal").textContent = number(anchorSummary.trace_count);
    $("memoryTraceState").textContent =
      number(anchorSummary.via_anchor_count) + " 次从锚进入 · " +
      number(anchorSummary.used_trace_count) + " 次进入回复";
    $("memoryUsedTotal").textContent = number(memorySummary.used_count);
    $("memoryRecognizedTotal").textContent =
      number(memorySummary.surface_recognized_count);
    $("memoryRecognizedState").textContent =
      number(memorySummary.surface_used_count) + " 次安静影响回应";
    $("memoryCoHeldTotal").textContent = number(memorySummary.co_held_count);
    $("memoryCoHeldState").textContent =
      number(memorySummary.co_held_memory_count) +
      " 条记忆 · 未打开全文";
    $("memoryFamilyTotal").textContent = number(fabricSummary.families);
    $("memoryFamilyState").textContent =
      number(fabricSummary.event_candidates) + " 个事件候选";
    $("memoryCommunityTotal").textContent = number(fabricSummary.communities);
    $("memoryCommunityState").textContent =
      "Leiden · " + number(fabricSummary.projection_runs) + " 次投影";
    $("memoryReportTotal").textContent = number(fabricSummary.community_reports);
    $("memoryNarrativeTotal").textContent = number(fabricSummary.event_narratives);
    $("memoryNarrativeState").textContent =
      "正文显式读取 · " + number(fabricSummary.event_candidates) + " 候选";
  }

  function arcPoints() {
    var items = state.data && state.data.memories && state.data.memories.items || [];
    return items.filter(function (item) {
      return item && item.affect && (item.occurred_at || item.updated_at || item.created_at);
    }).map(function (item) {
      var affect = item.affect || {};
      return {
        date: item.occurred_at || item.updated_at || item.created_at,
        label: item.fact || "未命名记忆",
        safety: number(affect.safety),
        attachment: number(affect.attachment),
        arousal: number(affect.arousal),
        somatic: number(affect.somatic_intensity)
      };
    }).sort(function (a, b) {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }).slice(-24);
  }

  function renderArc() {
    var target = $("memoryArc");
    if (state.view !== "arc") {
      target.hidden = true;
      return;
    }
    target.hidden = false;
    var points = arcPoints();
    if (points.length < 2) {
      target.innerHTML = '<div class="memory-arc-empty"><span>⌁</span><strong>还没有足够的跨醒来快照</strong><p>当几次真实会话留下 affect 坐标后，这里会显示一条材料级走势。它只展示变化，不替 Volo 解释变化。</p></div>';
      return;
    }
    var width = 760, height = 260, pad = 34;
    var x = function (index) { return pad + index * (width - pad * 2) / (points.length - 1); };
    var y = function (value) { return height - pad - Math.max(0, Math.min(1, value)) * (height - pad * 2); };
    var series = [
      ["safety", "安全感", "#6f9e8e"],
      ["attachment", "依恋", "#b98294"],
      ["arousal", "唤醒度", "#c58d62"],
      ["somatic", "身体强度", "#7b88ad"]
    ];
    var paths = series.map(function (entry) {
      var path = points.map(function (point, index) {
        return (index ? "L" : "M") + x(index).toFixed(1) + " " + y(point[entry[0]]).toFixed(1);
      }).join(" ");
      return '<path class="memory-arc-line arc-' + entry[0] + '" d="' + path + '"></path>';
    }).join("");
    var dots = points.map(function (point, index) {
      return '<circle class="memory-arc-dot" cx="' + x(index).toFixed(1) + '" cy="' + y(point.attachment).toFixed(1) + '" r="3"><title>' +
        html(dateLabel(point.date, true) + " · " + point.label) + "</title></circle>";
    }).join("");
    target.innerHTML = '<header class="memory-arc-head"><div><p class="memory-list-eyebrow">Across awakenings</p><h2>情绪弧线</h2><p>最近 ' + points.length + ' 个带 affect 坐标的记忆快照。这里是轨迹材料，不是结论。</p></div><span class="memory-arc-readonly">只读 · 不改变召回</span></header>' +
      '<div class="memory-arc-legend">' + series.map(function (entry) {
        return '<span><i class="arc-' + entry[0] + '"></i>' + entry[1] + "</span>";
      }).join("") + "</div>" +
      '<div class="memory-arc-chart"><svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="安全感、依恋、唤醒度和身体强度的时间走势"><line x1="' + pad + '" y1="' + y(0) + '" x2="' + (width - pad) + '" y2="' + y(0) + '"></line><line x1="' + pad + '" y1="' + y(1) + '" x2="' + (width - pad) + '" y2="' + y(1) + '"></line>' + paths + dots + "</svg></div>" +
      '<div class="memory-arc-foot"><span>' + html(dateLabel(points[0].date, false)) + "</span><span>" + html(dateLabel(points[points.length - 1].date, false)) + "</span></div>";
  }

  function render() {
    document.querySelectorAll("[data-view]").forEach(function (button) {
      var active = button.dataset.view === state.view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    $("memoryFilters").hidden = state.view !== "memories";
    $("anchorFilters").hidden = state.view !== "anchors";
    $("memorySearchForm").hidden = state.view === "checkpoints" || state.view === "arc";
    $("memoryWorkspace").hidden = state.view === "arc";
    var placeholders = {
      anchors: "搜索锚点、原话或它通向的记忆…",
      families: "搜索坐标、成员记忆或 domain…",
      communities: "搜索社区成员或报告…",
      events: "搜索事件指针、正文或来源记忆…",
      memories: "搜索事实、解释、人物或触发词…"
    };
    $("memorySearchInput").placeholder = placeholders[state.view] || placeholders.memories;
    renderStats();
    renderArc();
    if (state.view !== "arc") {
      renderList();
      renderDetail();
    }
  }

  async function load() {
    if (state.loading) return;
    if (!window.CCC || !window.CCC.isConfigured()) {
      $("memoryHealth").textContent = "需要连接";
      $("memoryHealth").classList.remove("is-live");
      setNotice("请先回到首页完成服务器配对，再打开 Memory。", "error");
      return;
    }
    state.loading = true;
    $("memoryRefresh").disabled = true;
    $("memoryRefresh").classList.add("is-loading");
    $("memoryHealth").textContent = "同步中";
    setNotice("正在读取 Volo 的记忆结构…", "loading");
    try {
      state.data = await window.CCC.memoryDashboard({
        q: $("memorySearchInput").value.trim(),
        memory_type: $("memoryType").value,
        epistemic_type: $("memoryEpistemic").value,
        epistemic_status: $("memoryStatusFilter").value,
        limit: 80,
        checkpoint_limit: 50,
        anchor_limit: 200,
        trace_limit: 100
      });
      $("memoryHealth").textContent = "已连接 · " +
        (state.data.schema || "epistemic-v2") + " · Leiden";
      $("memoryHealth").classList.add("is-live");
      setNotice("只读 Brain 浏览 · 不会触发召回或改变显著性", "success");
      render();
    } catch (error) {
      $("memoryHealth").textContent = "暂时离线";
      $("memoryHealth").classList.remove("is-live");
      setNotice(error.message || "Memory 暂时打不开", "error");
    } finally {
      state.loading = false;
      $("memoryRefresh").disabled = false;
      $("memoryRefresh").classList.remove("is-loading");
    }
  }

  document.querySelectorAll("[data-view]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.view = ["memories", "anchors", "checkpoints", "families", "communities", "events", "arc"].indexOf(button.dataset.view) >= 0
        ? button.dataset.view : "memories";
      state.selectedId = "";
      render();
    });
  });

  $("memorySearchForm").addEventListener("submit", function (event) {
    event.preventDefault();
    load();
  });

  $("memorySearchInput").addEventListener("input", function () {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(function () {
      if (["families", "communities", "events", "anchors"].indexOf(state.view) >= 0) {
        state.selectedId = "";
        render();
      } else {
        load();
      }
    }, 360);
  });

  ["memoryType", "memoryEpistemic", "memoryStatusFilter"].forEach(function (id) {
    $(id).addEventListener("change", load);
  });
  ["anchorStatusFilter", "anchorOriginFilter"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      state.selectedId = "";
      render();
    });
  });

  $("memoryRefresh").addEventListener("click", load);
  document.addEventListener("ccc:config-changed", load);
  load();
})();
