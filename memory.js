(function () {
  "use strict";

  var PAGE_SIZE = 30;
  var state = {
    query: "",
    sort: "newest",
    offset: 0,
    total: 0,
    memories: [],
    loading: false
  };

  var list = document.getElementById("memoryList");
  var notice = document.getElementById("memoryNotice");
  var searchForm = document.getElementById("memorySearchForm");
  var searchInput = document.getElementById("memorySearchInput");
  var sortSelect = document.getElementById("memorySort");
  var addButton = document.getElementById("memoryAddButton");
  var moreButton = document.getElementById("memoryMoreButton");
  var dialog = document.getElementById("memoryEditor");
  var editorForm = document.getElementById("memoryEditorForm");
  var editorId = document.getElementById("memoryEditorId");
  var editorHeading = document.getElementById("memoryEditorTitle");
  var titleInput = document.getElementById("memoryTitleInput");
  var contentInput = document.getElementById("memoryContentInput");
  var importanceInput = document.getElementById("memoryImportanceInput");
  var importanceOutput = document.getElementById("memoryImportanceOutput");
  var editorError = document.getElementById("memoryEditorError");
  var editorSave = document.getElementById("memoryEditorSave");

  function setNotice(text, kind) {
    notice.textContent = text || "";
    notice.dataset.kind = kind || "";
  }

  function setLoading(value) {
    state.loading = value;
    searchInput.disabled = value;
    sortSelect.disabled = value;
    moreButton.disabled = value;
    addButton.disabled = value;
  }

  function formatDate(value) {
    if (!value) return "时间未记下";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date);
  }

  function sourceLabel(value) {
    var labels = {
      user_explicit: "亲手写下",
      ai_extracted: "对话里记住",
      ai_digest: "日常整理",
      seed_import: "旧时光迁入",
      ombre_original: "Ombre 原文",
      claude_memory_original: "Claude Memory 原文"
    };
    return labels[value] || "共同记忆";
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function actionButton(action, label, memory) {
    var button = element("button", "memory-card-action", label);
    button.type = "button";
    button.dataset.action = action;
    button.dataset.id = String(memory.id);
    return button;
  }

  function renderMemory(memory) {
    var card = element("details", "memory-card");
    card.dataset.id = String(memory.id);
    if (memory.is_permanent) card.classList.add("is-locked");

    var summary = element("summary", "memory-card-summary");
    var summaryMain = element("div", "memory-card-summary-main");
    var titleWrap = element("div", "memory-card-title-wrap");
    var title = element("h2", "memory-card-title", memory.title || "无题记忆");
    var meta = element("div", "memory-card-badges");
    meta.appendChild(element("span", "memory-badge memory-badge-importance", "重要度 " + (memory.importance || 5)));
    if (memory.is_permanent) {
      meta.appendChild(element("span", "memory-badge memory-badge-locked", "锁定"));
    }
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    summaryMain.appendChild(titleWrap);
    var previewText = String(memory.content || "").replace(/\s+/g, " ").trim();
    if (previewText.length > 150) previewText = previewText.slice(0, 150) + "…";
    summaryMain.appendChild(element("p", "memory-card-preview", previewText || "展开查看原文"));
    summary.appendChild(summaryMain);
    var toggle = element("span", "memory-card-toggle");
    var toggleLabel = element("span", "memory-card-toggle-label", "展开原文");
    toggle.appendChild(toggleLabel);
    toggle.appendChild(element("span", "memory-card-chevron", "⌄"));
    summary.appendChild(toggle);
    card.appendChild(summary);
    card.addEventListener("toggle", function () {
      toggleLabel.textContent = card.open ? "收起原文" : "展开原文";
    });

    var body = element("div", "memory-card-body");
    body.appendChild(element("p", "memory-card-content", memory.content || ""));
    var foot = element("footer", "memory-card-foot");
    var provenance = element(
      "span",
      "memory-card-provenance",
      sourceLabel(memory.source) + " · " + formatDate(memory.created_at)
    );
    var actions = element("div", "memory-card-actions");
    actions.appendChild(actionButton("toggle", memory.is_permanent ? "解锁" : "锁定", memory));
    actions.appendChild(actionButton("edit", "编辑", memory));
    actions.appendChild(actionButton("delete", "删除", memory));
    foot.appendChild(provenance);
    foot.appendChild(actions);
    body.appendChild(foot);
    card.appendChild(body);
    return card;
  }

  function renderList() {
    list.replaceChildren();
    if (!state.memories.length) {
      var empty = element("div", "memory-empty");
      empty.appendChild(element("strong", "", state.query ? "没有想起相近的事" : "共同记忆还是空的"));
      empty.appendChild(element("p", "", state.query ? "换一种说法再找找看。" : "写下第一条只属于你们的记忆吧。"));
      list.appendChild(empty);
    } else {
      state.memories.forEach(function (memory) {
        list.appendChild(renderMemory(memory));
      });
    }
    moreButton.hidden = state.memories.length >= state.total || !state.memories.length;
  }

  function renderStats(stats) {
    document.getElementById("memoryTotal").textContent = String(stats.total_memories ?? state.total ?? "—");
    document.getElementById("memoryLocked").textContent = String(stats.permanent_memories ?? "—");
    document.getElementById("memoryCoverage").textContent = stats.coverage || "—";
    document.getElementById("memoryModel").textContent = stats.embedding_model || "—";
  }

  async function loadStats() {
    try {
      renderStats(await window.CCC.memoryStats());
    } catch (error) {
      document.getElementById("memoryModel").textContent = "暂时离线";
    }
  }

  async function loadMemories(reset) {
    if (state.loading) return;
    if (!window.CCC || !window.CCC.isConfigured()) {
      setNotice("请先回到首页配置服务器连接，Memory 才能读取共同记忆。", "error");
      renderList();
      return;
    }
    if (reset) {
      state.offset = 0;
      state.memories = [];
    }
    setLoading(true);
    setNotice(state.query ? "正在沿着语义寻找……" : "正在翻开共同记忆……", "loading");
    try {
      var payload = await window.CCC.memories(state.query, state.sort, state.offset, PAGE_SIZE);
      var incoming = Array.isArray(payload.memories) ? payload.memories : [];
      state.total = Number(payload.total_memories || 0);
      state.memories = reset ? incoming : state.memories.concat(incoming);
      state.offset = state.memories.length;
      renderList();
      setNotice(
        state.query
          ? "找到 " + state.total + " 段有关的回忆"
          : "我们已经一起记住 " + state.total + " 件事",
        "success"
      );
    } catch (error) {
      renderList();
      setNotice(error.message || "共同记忆暂时打不开", "error");
    } finally {
      setLoading(false);
    }
  }

  function openEditor(memory) {
    var editing = Boolean(memory);
    editorId.value = editing ? String(memory.id) : "";
    titleInput.value = editing ? memory.title || "" : "";
    contentInput.value = editing ? memory.content || "" : "";
    importanceInput.value = String(editing ? memory.importance || 5 : 7);
    importanceOutput.value = importanceInput.value;
    importanceOutput.textContent = importanceInput.value;
    editorHeading.textContent = editing ? "整理这段记忆" : "写一条记忆";
    editorSave.textContent = editing ? "保存变化" : "存进共同记忆";
    editorError.textContent = "";
    dialog.showModal();
    window.setTimeout(function () {
      (editing ? contentInput : titleInput).focus();
    }, 40);
  }

  function closeEditor() {
    if (dialog.open) dialog.close();
  }

  async function saveEditor(event) {
    event.preventDefault();
    var id = Number(editorId.value || 0);
    var content = contentInput.value.trim();
    if (!content) {
      editorError.textContent = "记忆正文还没有写。";
      contentInput.focus();
      return;
    }
    editorSave.disabled = true;
    editorError.textContent = "";
    try {
      await window.CCC.memoryAction(id ? "update" : "add", {
        id: id || undefined,
        title: titleInput.value.trim(),
        content: content,
        importance: Number(importanceInput.value || 5)
      });
      closeEditor();
      await Promise.all([loadMemories(true), loadStats()]);
    } catch (error) {
      editorError.textContent = error.message || "这段记忆暂时存不进去";
    } finally {
      editorSave.disabled = false;
    }
  }

  async function handleCardAction(event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    var id = Number(button.dataset.id || 0);
    var memory = state.memories.find(function (item) { return Number(item.id) === id; });
    if (!memory) return;
    var action = button.dataset.action;
    if (action === "edit") {
      openEditor(memory);
      return;
    }
    if (action === "delete" && !window.confirm("真的要忘掉这段记忆吗？这一步不能撤销。")) return;
    button.disabled = true;
    try {
      await window.CCC.memoryAction(action, { id: id });
      await Promise.all([loadMemories(true), loadStats()]);
    } catch (error) {
      setNotice(error.message || "操作没有完成", "error");
    } finally {
      button.disabled = false;
    }
  }

  searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    state.query = searchInput.value.trim();
    loadMemories(true);
  });
  sortSelect.addEventListener("change", function () {
    state.sort = sortSelect.value;
    loadMemories(true);
  });
  addButton.addEventListener("click", function () { openEditor(null); });
  moreButton.addEventListener("click", function () { loadMemories(false); });
  list.addEventListener("click", handleCardAction);
  editorForm.addEventListener("submit", saveEditor);
  importanceInput.addEventListener("input", function () {
    importanceOutput.value = importanceInput.value;
    importanceOutput.textContent = importanceInput.value;
  });
  document.getElementById("memoryEditorClose").addEventListener("click", closeEditor);
  document.getElementById("memoryEditorCancel").addEventListener("click", closeEditor);
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) closeEditor();
  });

  loadStats();
  loadMemories(true);
})();
