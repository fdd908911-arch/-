(function () {
  "use strict";

  var STORAGE_KEY = "island-chat.preferences.v1";
  var DATABASE_NAME = "island-chat-local";
  var DATABASE_STORE = "wallpapers";
  var CUSTOM_WALLPAPER_KEY = "custom-wallpaper";
  var MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  var DEFAULT_SETTINGS = { id: "mist", theme: "mist", dim: 8, blur: 0 };

  var PRESETS = {
    mist:
      "radial-gradient(ellipse at 14% 42%, rgba(173, 196, 212, 0.96) 0%, transparent 46%), radial-gradient(ellipse at 78% 12%, rgba(219, 202, 181, 0.9) 0%, transparent 43%), radial-gradient(ellipse at 82% 72%, rgba(223, 214, 216, 0.95) 0%, transparent 46%), radial-gradient(ellipse at 24% 92%, rgba(193, 210, 193, 0.88) 0%, transparent 42%), linear-gradient(135deg, #edf1ed 0%, #e9e5e2 100%)",
    zen:
      "radial-gradient(ellipse at 22% 18%, rgba(226, 215, 200, 0.9) 0%, transparent 42%), radial-gradient(ellipse at 84% 30%, rgba(201, 184, 174, 0.58) 0%, transparent 45%), radial-gradient(ellipse at 32% 88%, rgba(184, 171, 163, 0.5) 0%, transparent 38%), radial-gradient(ellipse at 76% 82%, rgba(207, 195, 208, 0.48) 0%, transparent 42%), linear-gradient(145deg, #f4f1ea 0%, #e9e3d9 100%)",
    sage:
      "radial-gradient(ellipse at 18% 36%, rgba(148, 159, 151, 0.92) 0%, transparent 44%), radial-gradient(ellipse at 82% 48%, rgba(235, 226, 170, 0.96) 0%, transparent 46%), radial-gradient(ellipse at 56% 8%, rgba(200, 213, 197, 0.92) 0%, transparent 40%), radial-gradient(ellipse at 44% 92%, rgba(238, 233, 208, 0.96) 0%, transparent 45%), linear-gradient(140deg, #e6e9dc 0%, #eee9d0 100%)",
    blush:
      "radial-gradient(ellipse at 20% 12%, rgba(111, 138, 167, 0.94) 0%, transparent 45%), radial-gradient(ellipse at 38% 54%, rgba(215, 179, 190, 0.98) 0%, transparent 48%), radial-gradient(ellipse at 82% 20%, rgba(229, 207, 199, 0.96) 0%, transparent 46%), radial-gradient(ellipse at 82% 82%, rgba(168, 181, 192, 0.95) 0%, transparent 45%), linear-gradient(145deg, #e8dfe2 0%, #dce3e6 100%)"
  };

  var LEGACY_PRESET_IDS = {
    coast: "zen",
    dusk: "sage",
    paper: "blush"
  };

  var THEME_COLORS = {
    mist: "#eef2f1",
    zen: "#f4f1ea",
    sage: "#e9eadf",
    blush: "#ebe3e5"
  };

  var THEME_NAMES = {
    mist: "雾蓝杏粉",
    zen: "禅意米棕",
    sage: "灰绿鹅黄",
    blush: "烟粉雾蓝"
  };

  var workspaces = {
    volo: { name: "Volo", view: "volo" },
    group: { name: "群聊", view: "group", chatId: "design" },
    terminal: { name: "终端", view: "terminal" }
  };

  var chats = {
    design: {
      name: "群聊",
      status: "8 位成员，3 人在线",
      avatarClass: "avatar-design",
      initial: "群",
      reply: "收到，我会把这条也放进下一轮评审里。",
      messages: [
        { type: "date", text: "今天" },
        {
          direction: "incoming",
          text: "周屿：新版原型发群里了，大家有空帮忙看看交互。",
          time: "09:16"
        },
        {
          direction: "incoming",
          text: "许遥：移动端的输入区可以再收一点，背景入口保留就很好。",
          time: "09:18"
        },
        {
          direction: "outgoing",
          text: "我来整理反馈，下午再发一版。",
          time: "09:22",
          read: true
        }
      ]
    }
  };

  var root = document.documentElement;
  var messageList = document.getElementById("messageList");
  var messageScroll = document.getElementById("messageScroll");
  var messageInput = document.getElementById("messageInput");
  var sendButton = document.getElementById("sendButton");
  var composer = document.getElementById("composer");
  var emojiButton = document.getElementById("emojiButton");
  var emojiPanel = document.getElementById("emojiPanel");
  var scrollBottomButton = document.getElementById("scrollBottomButton");
  var scrollUnread = document.getElementById("scrollUnread");
  var conversationList = document.getElementById("conversationList");
  var conversationSearch = document.getElementById("conversationSearch");
  var headerName = document.getElementById("headerName");
  var headerStatus = document.getElementById("headerStatus");
  var headerAvatar = document.getElementById("headerAvatar");
  var sidebar = document.getElementById("sidebar");
  var sidebarScrim = document.getElementById("sidebarScrim");
  var sidebarCloseButton = document.getElementById("sidebarCloseButton");
  var globalNewChatButton = document.getElementById("globalNewChatButton");
  var conversationEmpty = document.getElementById("conversationEmpty");
  var mobileMenuButtons = document.querySelectorAll("[data-open-sidebar]");
  var workspaceViews = document.querySelectorAll("[data-workspace-view]");
  var backgroundDialog = document.getElementById("backgroundDialog");
  var backgroundFile = document.getElementById("backgroundFile");
  var uploadDropzone = document.getElementById("uploadDropzone");
  var uploadError = document.getElementById("uploadError");
  var customWallpaperOption = document.getElementById("customWallpaperOption");
  var customWallpaperSwatch = document.getElementById("customWallpaperSwatch");
  var dimRange = document.getElementById("dimRange");
  var blurRange = document.getElementById("blurRange");
  var dimOutput = document.getElementById("dimOutput");
  var blurOutput = document.getElementById("blurOutput");
  var toast = document.getElementById("toast");
  var toastText = document.getElementById("toastText");
  var themeColorMeta = document.getElementById("themeColorMeta");
  var currentThemeName = document.getElementById("currentThemeName");

  var activeViewId = "volo";
  var activeChatId = "design";
  var toastTimer = null;
  var appliedSettings = readSettings();
  var draftSettings = copySettings(appliedSettings);
  var customBlob = null;
  var customUrl = null;
  var draftBlob = null;
  var draftUrl = null;

  function emitClawd(state, phrase, options) {
    var detail = Object.assign(
      {
        state: state,
        phrase: phrase || ""
      },
      options || {}
    );
    document.dispatchEvent(new CustomEvent("clawd:action", { detail: detail }));
  }

  function copySettings(settings) {
    var presetId = normalizePresetId(settings.id);
    var themeId = normalizePresetId(
      settings.theme || (presetId !== "custom" ? presetId : "mist")
    );
    return {
      id: presetId,
      theme: Object.prototype.hasOwnProperty.call(PRESETS, themeId) ? themeId : "mist",
      dim: Number(settings.dim),
      blur: Number(settings.blur)
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function readStoredNumber(value, fallback, minimum, maximum) {
    var number = Number(value);
    return Number.isFinite(number) ? clamp(number, minimum, maximum) : fallback;
  }

  function normalizePresetId(id) {
    return LEGACY_PRESET_IDS[id] || id;
  }

  function isKnownWallpaper(id) {
    var normalizedId = normalizePresetId(id);
    return Object.prototype.hasOwnProperty.call(PRESETS, normalizedId) || normalizedId === "custom";
  }

  function readSettings() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (
        !parsed ||
        (parsed.version !== 1 && parsed.version !== 2) ||
        !isKnownWallpaper(parsed.id)
      ) {
        return copySettings(DEFAULT_SETTINGS);
      }
      var presetId = normalizePresetId(parsed.id);
      var themeId = normalizePresetId(
        parsed.theme || (presetId !== "custom" ? presetId : "mist")
      );
      var migratedSettings = {
        id: presetId,
        theme: Object.prototype.hasOwnProperty.call(PRESETS, themeId) ? themeId : "mist",
        dim: readStoredNumber(parsed.dim, DEFAULT_SETTINGS.dim, 0, 48),
        blur: readStoredNumber(parsed.blur, DEFAULT_SETTINGS.blur, 0, 12)
      };
      if (
        parsed.version !== 2 ||
        parsed.id !== migratedSettings.id ||
        parsed.theme !== migratedSettings.theme
      ) {
        writeSettings(migratedSettings);
      }
      return migratedSettings;
    } catch (error) {
      return copySettings(DEFAULT_SETTINGS);
    }
  }

  function writeSettings(settings) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 2,
          id: settings.id,
          theme: settings.theme,
          dim: settings.dim,
          blur: settings.blur
        })
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  function formatTime(date) {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }

  function createMessageElement(message) {
    if (message.type === "date") {
      var separator = document.createElement("div");
      separator.className = "date-separator";
      separator.textContent = message.text;
      return separator;
    }

    var row = document.createElement("div");
    row.className = "message-row " + message.direction;
    var bubble = document.createElement("div");
    bubble.className = "message-bubble";
    var body = document.createElement("p");
    body.textContent = message.text;
    bubble.appendChild(body);

    var meta = document.createElement("span");
    meta.className = "message-meta";
    var time = document.createElement("time");
    time.textContent = message.time;
    meta.appendChild(time);
    if (message.direction === "outgoing") {
      var checks = document.createElement("span");
      checks.className = "message-checks";
      checks.setAttribute("aria-label", message.read ? "已读" : "已发送");
      checks.textContent = message.read ? "✓✓" : "✓";
      meta.appendChild(checks);
    }
    bubble.appendChild(meta);
    row.appendChild(bubble);
    return row;
  }

  function createTypingElement() {
    var row = document.createElement("div");
    row.className = "typing-row";
    row.setAttribute("aria-label", "对方正在输入");
    var bubble = document.createElement("div");
    bubble.className = "typing-bubble";
    for (var index = 0; index < 3; index += 1) {
      bubble.appendChild(document.createElement("span"));
    }
    row.appendChild(bubble);
    return row;
  }

  function renderMessages(shouldScroll) {
    var chat = chats[activeChatId];
    var fragment = document.createDocumentFragment();
    chat.messages.forEach(function (message) {
      fragment.appendChild(createMessageElement(message));
    });
    if (chat.isTyping) {
      fragment.appendChild(createTypingElement());
    }
    messageList.replaceChildren(fragment);
    if (shouldScroll) {
      requestAnimationFrame(scrollToBottom);
    }
  }

  function scrollToBottom() {
    messageScroll.scrollTop = messageScroll.scrollHeight;
    scrollBottomButton.classList.remove("visible");
    scrollUnread.hidden = true;
  }

  function distanceFromBottom() {
    return messageScroll.scrollHeight - messageScroll.scrollTop - messageScroll.clientHeight;
  }

  function updateScrollButton() {
    scrollBottomButton.classList.toggle("visible", distanceFromBottom() > 110);
  }

  function resizeMessageInput() {
    messageInput.style.height = "auto";
    var nextHeight = Math.min(messageInput.scrollHeight, 118);
    messageInput.style.height = Math.max(nextHeight, 40) + "px";
    messageInput.style.overflowY = messageInput.scrollHeight > 118 ? "auto" : "hidden";
    sendButton.disabled = messageInput.value.trim().length === 0;
  }

  function updateConversationPreview(chatId, text, time) {
    var item = conversationList.querySelector('[data-chat="' + chatId + '"]');
    if (!item) {
      return;
    }
    var preview = item.querySelector(".message-preview");
    var timeElement = item.querySelector("time");
    if (preview) {
      preview.textContent = text.replace(/\s+/g, " ");
    }
    if (timeElement) {
      timeElement.textContent = time;
    }
  }

  function simulateReply(chatId) {
    var chat = chats[chatId];
    if (!chat.reply || chat.replyTimer) {
      return;
    }
    chat.isTyping = true;
    if (activeViewId === "group" && activeChatId === chatId) {
      renderMessages(true);
    }
    window.setTimeout(function () {
      if (chat.isTyping && activeViewId === "group" && activeChatId === chatId) {
        emitClawd("thinking", "等回复中…", {
          duration: 1700,
          priority: 3,
          force: true
        });
      }
    }, 420);
    chat.replyTimer = window.setTimeout(function () {
      var replyTime = formatTime(new Date());
      chat.isTyping = false;
      chat.messages.push({ direction: "incoming", text: chat.reply, time: replyTime });
      chat.replyTimer = null;
      updateConversationPreview(chatId, chat.reply, replyTime);
      if (activeViewId === "group" && activeChatId === chatId) {
        var wasNearBottom = distanceFromBottom() < 160;
        renderMessages(wasNearBottom);
        if (!wasNearBottom) {
          scrollUnread.hidden = false;
          scrollBottomButton.classList.add("visible");
        }
        emitClawd("notification", "收到新消息啦", {
          duration: 1450,
          priority: 4,
          next: {
            name: "happy",
            duration: 1250,
            priority: 4
          }
        });
      }
    }, 1150);
  }

  function sendMessage() {
    if (activeViewId !== "group") {
      return;
    }
    var value = messageInput.value.trim();
    if (!value) {
      return;
    }
    var time = formatTime(new Date());
    chats[activeChatId].messages.push({
      direction: "outgoing",
      text: value,
      time: time,
      read: true
    });
    updateConversationPreview(activeChatId, value, time);
    messageInput.value = "";
    resizeMessageInput();
    renderMessages(true);
    emitClawd("beacon", "消息送出去啦", {
      duration: 900,
      priority: 3
    });
    simulateReply(activeChatId);
  }

  function switchWorkspace(viewId, silent) {
    var workspace = workspaces[viewId];
    if (!workspace) {
      return;
    }
    activeViewId = viewId;
    document.body.dataset.chatView = workspace.view;
    workspaceViews.forEach(function (view) {
      view.hidden = view.dataset.workspaceView !== workspace.view;
    });
    conversationList.querySelectorAll(".conversation-item").forEach(function (item) {
      var isActive = item.dataset.workspace === viewId;
      item.classList.toggle("active", isActive);
      if (isActive) {
        item.setAttribute("aria-current", "page");
        var badge = item.querySelector(".unread-badge");
        if (badge) {
          badge.remove();
        }
      } else {
        item.removeAttribute("aria-current");
      }
    });
    emojiPanel.hidden = true;
    emojiButton.setAttribute("aria-expanded", "false");
    scrollBottomButton.classList.remove("visible");
    scrollUnread.hidden = true;
    if (workspace.view === "group") {
      activeChatId = workspace.chatId;
      var chat = chats[activeChatId];
      headerName.textContent = chat.name;
      headerStatus.textContent = chat.status;
      headerAvatar.className = "avatar " + chat.avatarClass;
      headerAvatar.textContent = chat.initial;
      renderMessages(true);
    }
    closeSidebar();
    if (!silent) {
      emitClawd("conducting", "切换到“" + workspace.name + "”", {
        duration: 1900,
        priority: 3
      });
    }
  }

  function openSidebar() {
    sidebar.classList.add("open");
    sidebarScrim.classList.add("visible");
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarScrim.classList.remove("visible");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toastText.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(function () {
      toast.classList.add("visible");
    });
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("visible");
      window.setTimeout(function () {
        if (!toast.classList.contains("visible")) {
          toast.hidden = true;
        }
      }, 190);
    }, 2400);
  }

  function applyWallpaper(settings, imageUrl) {
    var backgroundImage = PRESETS[settings.id];
    if (settings.id === "custom" && imageUrl) {
      backgroundImage = 'url("' + imageUrl.replace(/"/g, "%22") + '")';
    }
    if (!backgroundImage) {
      backgroundImage = PRESETS.mist;
    }
    root.dataset.theme = settings.theme;
    themeColorMeta.setAttribute("content", THEME_COLORS[settings.theme] || THEME_COLORS.mist);
    root.style.setProperty("--wallpaper-image", backgroundImage);
    root.style.setProperty("--wallpaper-dim", String(settings.dim / 100));
    root.style.setProperty("--wallpaper-blur", String(settings.blur) + "px");
    updateQuickThemeSwitcher(settings.theme);
  }

  function updateQuickThemeSwitcher(themeId) {
    currentThemeName.textContent = THEME_NAMES[themeId] || THEME_NAMES.mist;
    document.querySelectorAll("[data-quick-theme]").forEach(function (button) {
      var isActive = button.dataset.quickTheme === themeId;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function commitThemeImmediately(themeId, preserveCustomWallpaper) {
    if (!Object.prototype.hasOwnProperty.call(PRESETS, themeId)) {
      return;
    }

    var sourceSettings = backgroundDialog.open ? draftSettings : appliedSettings;
    var nextSettings = copySettings(sourceSettings);
    nextSettings.theme = themeId;
    if (!(preserveCustomWallpaper && appliedSettings.id === "custom")) {
      nextSettings.id = themeId;
    }

    if (nextSettings.id !== "custom" && draftUrl && draftUrl !== customUrl) {
      URL.revokeObjectURL(draftUrl);
    }

    appliedSettings = copySettings(nextSettings);
    draftSettings = copySettings(nextSettings);
    draftBlob = null;
    draftUrl = null;
    writeSettings(appliedSettings);
    applyWallpaper(appliedSettings, customUrl);
    updateRangeOutputs();
    updateWallpaperOptions();

    if (backgroundDialog.open) {
      closeBackgroundDialog(true);
    }
    showToast("已切换为“" + THEME_NAMES[themeId] + "”");
    emitClawd("wizard", "换上新配色啦", {
      duration: 1900,
      priority: 3,
      next: {
        name: "eureka",
        duration: 1200,
        priority: 3
      }
    });
  }

  function updateRangeOutputs() {
    dimOutput.textContent = String(draftSettings.dim) + "%";
    blurOutput.textContent = String(draftSettings.blur) + "px";
    dimRange.value = String(draftSettings.dim);
    blurRange.value = String(draftSettings.blur);
    dimRange.style.setProperty(
      "--range-progress",
      String((draftSettings.dim / Number(dimRange.max)) * 100) + "%"
    );
    blurRange.style.setProperty(
      "--range-progress",
      String((draftSettings.blur / Number(blurRange.max)) * 100) + "%"
    );
  }

  function updateWallpaperOptions() {
    document.querySelectorAll(".wallpaper-option").forEach(function (option) {
      var isSelected = option.dataset.wallpaper === draftSettings.id;
      option.classList.toggle("selected", isSelected);
      option.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function refreshCustomOption(imageUrl) {
    if (imageUrl) {
      customWallpaperOption.hidden = false;
      customWallpaperSwatch.style.backgroundImage =
        'linear-gradient(rgba(5, 14, 20, 0.08), rgba(5, 14, 20, 0.08)), url("' +
        imageUrl.replace(/"/g, "%22") +
        '")';
    } else {
      customWallpaperOption.hidden = true;
      customWallpaperSwatch.style.backgroundImage = "";
    }
  }

  function clearUploadError() {
    uploadError.hidden = true;
    uploadError.textContent = "";
  }

  function showUploadError(message) {
    uploadError.textContent = message;
    uploadError.hidden = false;
    emitClawd("confused", "这张图片好像不行", {
      duration: 2800,
      priority: 4
    });
  }

  function openBackgroundDialog() {
    draftSettings = copySettings(appliedSettings);
    draftBlob = customBlob;
    draftUrl = customUrl;
    clearUploadError();
    backgroundFile.value = "";
    uploadDropzone.querySelector(".upload-copy strong").textContent = "选择图片或拖放到这里";
    updateRangeOutputs();
    refreshCustomOption(draftUrl);
    updateWallpaperOptions();
    applyWallpaper(draftSettings, draftUrl);
    if (typeof backgroundDialog.showModal === "function") {
      backgroundDialog.showModal();
    } else {
      backgroundDialog.setAttribute("open", "");
    }
    emitClawd("builder", "准备布置新背景", {
      duration: 2600,
      priority: 3
    });
  }

  function discardDraftUrl() {
    if (draftUrl && draftUrl !== customUrl) {
      URL.revokeObjectURL(draftUrl);
    }
    draftUrl = null;
    draftBlob = null;
  }

  function closeBackgroundDialog(keepPreview) {
    if (!keepPreview) {
      discardDraftUrl();
      applyWallpaper(appliedSettings, customUrl);
    }
    if (backgroundDialog.open) {
      backgroundDialog.close();
    } else {
      backgroundDialog.removeAttribute("open");
    }
  }

  function verifyImage(file) {
    return new Promise(function (resolve, reject) {
      var verificationUrl = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(verificationUrl);
        if (image.naturalWidth < 1 || image.naturalHeight < 1) {
          reject(new Error("empty-image"));
          return;
        }
        resolve();
      };
      image.onerror = function () {
        URL.revokeObjectURL(verificationUrl);
        reject(new Error("invalid-image"));
      };
      image.src = verificationUrl;
    });
  }

  async function useUploadedFile(file) {
    clearUploadError();
    if (!file) {
      return;
    }
    var supportedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (supportedTypes.indexOf(file.type) === -1) {
      showUploadError("请选择 JPG、PNG、WebP 或 GIF 图片。");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      showUploadError("图片超过 10 MB，请压缩后再试。");
      return;
    }
    try {
      await verifyImage(file);
    } catch (error) {
      showUploadError("这张图片无法读取，请换一张再试。");
      return;
    }

    if (draftUrl && draftUrl !== customUrl) {
      URL.revokeObjectURL(draftUrl);
    }
    draftBlob = file;
    draftUrl = URL.createObjectURL(file);
    draftSettings.id = "custom";
    refreshCustomOption(draftUrl);
    updateWallpaperOptions();
    applyWallpaper(draftSettings, draftUrl);
    uploadDropzone.querySelector(".upload-copy strong").textContent = "已选择：" + file.name;
    showToast("图片已载入，点击“应用背景”保存");
    emitClawd("carrying", "图片搬来啦", {
      duration: 1600,
      priority: 3,
      next: {
        name: "building",
        duration: 1700,
        priority: 3
      }
    });
  }

  function openDatabase() {
    return new Promise(function (resolve, reject) {
      if (!("indexedDB" in window)) {
        reject(new Error("indexeddb-unavailable"));
        return;
      }
      var request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = function () {
        var database = request.result;
        if (!database.objectStoreNames.contains(DATABASE_STORE)) {
          database.createObjectStore(DATABASE_STORE);
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error("indexeddb-open-failed"));
      };
    });
  }

  async function readCustomWallpaper() {
    var database = await openDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = database.transaction(DATABASE_STORE, "readonly");
      var request = transaction.objectStore(DATABASE_STORE).get(CUSTOM_WALLPAPER_KEY);
      request.onsuccess = function () {
        resolve(request.result || null);
      };
      request.onerror = function () {
        reject(request.error || new Error("indexeddb-read-failed"));
      };
      transaction.oncomplete = function () {
        database.close();
      };
    });
  }

  async function saveCustomWallpaper(blob) {
    var database = await openDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = database.transaction(DATABASE_STORE, "readwrite");
      transaction.objectStore(DATABASE_STORE).put(blob, CUSTOM_WALLPAPER_KEY);
      transaction.oncomplete = function () {
        database.close();
        resolve();
      };
      transaction.onerror = function () {
        database.close();
        reject(transaction.error || new Error("indexeddb-write-failed"));
      };
      transaction.onabort = function () {
        database.close();
        reject(transaction.error || new Error("indexeddb-write-aborted"));
      };
    });
  }

  async function deleteCustomWallpaper() {
    var database = await openDatabase();
    return new Promise(function (resolve, reject) {
      var transaction = database.transaction(DATABASE_STORE, "readwrite");
      transaction.objectStore(DATABASE_STORE).delete(CUSTOM_WALLPAPER_KEY);
      transaction.oncomplete = function () {
        database.close();
        resolve();
      };
      transaction.onerror = function () {
        database.close();
        reject(transaction.error || new Error("indexeddb-delete-failed"));
      };
    });
  }

  async function applyDraftBackground() {
    var savedToDevice = true;
    if (draftSettings.id === "custom") {
      if (!draftBlob || !draftUrl) {
        showUploadError("请先选择一张图片。");
        return;
      }
      try {
        await saveCustomWallpaper(draftBlob);
      } catch (error) {
        savedToDevice = false;
      }
      if (customUrl && customUrl !== draftUrl) {
        URL.revokeObjectURL(customUrl);
      }
      customBlob = draftBlob;
      customUrl = draftUrl;
    }

    if (draftSettings.id !== "custom" && draftUrl && draftUrl !== customUrl) {
      URL.revokeObjectURL(draftUrl);
    }
    appliedSettings = copySettings(draftSettings);
    if (appliedSettings.id !== "custom" || savedToDevice) {
      writeSettings(appliedSettings);
    }
    draftBlob = null;
    draftUrl = null;
    applyWallpaper(appliedSettings, customUrl);
    closeBackgroundDialog(true);
    showToast(
      savedToDevice
        ? "聊天背景已更新"
        : "背景已应用，但浏览器未允许长期保存"
    );
    emitClawd(savedToDevice ? "happy" : "confused", savedToDevice ? "背景布置好啦" : "背景已用上，但没有保存", {
      duration: 2400,
      priority: savedToDevice ? 3 : 4
    });
  }

  async function resetBackground() {
    try {
      await deleteCustomWallpaper();
    } catch (error) {
      // The visual reset still succeeds if private storage is unavailable.
    }
    discardDraftUrl();
    if (customUrl) {
      URL.revokeObjectURL(customUrl);
    }
    customUrl = null;
    customBlob = null;
    appliedSettings = copySettings(DEFAULT_SETTINGS);
    draftSettings = copySettings(DEFAULT_SETTINGS);
    writeSettings(appliedSettings);
    refreshCustomOption(null);
    updateRangeOutputs();
    updateWallpaperOptions();
    applyWallpaper(appliedSettings, null);
    closeBackgroundDialog(true);
    showToast("已恢复默认背景并清除本地图片");
    emitClawd("sweeping", "恢复得干干净净", {
      duration: 2800,
      priority: 3
    });
  }

  async function initializeWallpaper() {
    try {
      customBlob = await readCustomWallpaper();
      if (customBlob) {
        customUrl = URL.createObjectURL(customBlob);
      }
    } catch (error) {
      customBlob = null;
      customUrl = null;
    }
    if (appliedSettings.id === "custom" && !customUrl) {
      appliedSettings = copySettings(DEFAULT_SETTINGS);
      writeSettings(appliedSettings);
    }
    applyWallpaper(appliedSettings, customUrl);
    refreshCustomOption(customUrl);
  }

  composer.addEventListener("submit", function (event) {
    event.preventDefault();
    sendMessage();
  });

  messageInput.addEventListener("input", function () {
    resizeMessageInput();
    var length = messageInput.value.length;
    if (length > 1800) {
      emitClawd("overheated", "写了好多好多字", {
        duration: 2500,
        priority: 4
      });
    } else if (messageInput.value.trim()) {
      emitClawd("typing", "", {
        duration: 950,
        priority: 1
      });
    } else {
      emitClawd("idle", "", {
        duration: 0,
        priority: 0,
        force: true
      });
    }
  });
  messageInput.addEventListener("focus", function () {
    if (messageInput.value.trim()) {
      emitClawd("typing", "", {
        duration: 950,
        priority: 1
      });
    }
  });
  messageInput.addEventListener("blur", function () {
    emitClawd("idle", "", {
      duration: 0,
      priority: 0,
      force: true
    });
  });
  messageInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });

  emojiButton.addEventListener("click", function () {
    var willOpen = emojiPanel.hidden;
    emojiPanel.hidden = !willOpen;
    emojiButton.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) {
      emitClawd("grooving", "挑一个表情吧", {
        duration: 1900,
        priority: 3
      });
    }
  });

  emojiPanel.addEventListener("click", function (event) {
    var target = event.target.closest("button");
    if (!target) {
      return;
    }
    var start = messageInput.selectionStart;
    var end = messageInput.selectionEnd;
    var value = messageInput.value;
    messageInput.value = value.slice(0, start) + target.textContent + value.slice(end);
    messageInput.selectionStart = messageInput.selectionEnd = start + target.textContent.length;
    messageInput.focus();
    emojiPanel.hidden = true;
    emojiButton.setAttribute("aria-expanded", "false");
    resizeMessageInput();
    emitClawd("miniTyping", "小螃蟹也来打字", {
      duration: 1700,
      priority: 3
    });
  });

  document.addEventListener("click", function (event) {
    if (!emojiPanel.hidden && !emojiPanel.contains(event.target) && !emojiButton.contains(event.target)) {
      emojiPanel.hidden = true;
      emojiButton.setAttribute("aria-expanded", "false");
    }
  });

  conversationList.addEventListener("click", function (event) {
    var item = event.target.closest(".conversation-item");
    if (item) {
      switchWorkspace(item.dataset.workspace);
    }
  });

  conversationSearch.addEventListener("input", function () {
    var query = conversationSearch.value.trim().toLocaleLowerCase("zh-CN");
    var items = Array.from(conversationList.querySelectorAll(".conversation-item"));
    items.forEach(function (item) {
      item.hidden = query.length > 0 && !item.textContent.toLocaleLowerCase("zh-CN").includes(query);
    });
    conversationList.querySelectorAll("[data-nav-section]").forEach(function (section) {
      section.hidden = !section.querySelector(".conversation-item:not([hidden])");
    });
    var hasResult = items.some(function (item) {
      return !item.hidden;
    });
    conversationEmpty.hidden = hasResult;
    if (!query) {
      emitClawd("idle", "", {
        duration: 0,
        priority: 0,
        force: true
      });
      return;
    }
    emitClawd(hasResult ? "debugger" : "confused", hasResult ? "正在认真搜索" : "什么都没找到", {
      duration: 1600,
      priority: hasResult ? 2 : 4
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      if (document.activeElement === conversationSearch && conversationSearch.value) {
        conversationSearch.value = "";
        conversationSearch.dispatchEvent(new Event("input"));
        return;
      }
      if (sidebar.classList.contains("open")) {
        closeSidebar();
        return;
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
      event.preventDefault();
      if (window.matchMedia("(max-width: 760px)").matches) {
        openSidebar();
      }
      conversationSearch.focus();
    }
  });

  messageScroll.addEventListener("scroll", updateScrollButton, { passive: true });
  scrollBottomButton.addEventListener("click", function () {
    scrollToBottom();
    emitClawd("pushing", "回到最新消息", {
      duration: 1500,
      priority: 3
    });
  });
  mobileMenuButtons.forEach(function (button) {
    button.addEventListener("click", openSidebar);
  });
  sidebarScrim.addEventListener("click", closeSidebar);
  sidebarCloseButton.addEventListener("click", closeSidebar);

  globalNewChatButton.addEventListener("click", function () {
    conversationSearch.value = "";
    conversationSearch.dispatchEvent(new Event("input"));
    switchWorkspace("volo", true);
    document.dispatchEvent(new CustomEvent("volo:new-chat"));
    closeSidebar();
  });

  var quickThemeOptions = document.querySelector(".quick-theme-options");
  if (quickThemeOptions) {
    quickThemeOptions.addEventListener("click", function (event) {
      var button = event.target.closest("[data-quick-theme]");
      if (!button) {
        return;
      }
      commitThemeImmediately(button.dataset.quickTheme, true);
      closeSidebar();
    });
  }

  document.querySelectorAll("[data-toast]").forEach(function (button) {
    button.addEventListener("click", function () {
      showToast(button.dataset.toast);
    });
  });

  document.getElementById("sidebarBackgroundButton").addEventListener("click", function () {
    closeSidebar();
    openBackgroundDialog();
  });
  document.getElementById("headerBackgroundButton").addEventListener("click", openBackgroundDialog);
  document.getElementById("backgroundCloseButton").addEventListener("click", function () {
    closeBackgroundDialog(false);
  });
  document.getElementById("backgroundCancelButton").addEventListener("click", function () {
    closeBackgroundDialog(false);
  });
  document.getElementById("backgroundApplyButton").addEventListener("click", applyDraftBackground);
  document.getElementById("resetBackgroundButton").addEventListener("click", resetBackground);

  backgroundDialog.addEventListener("cancel", function (event) {
    event.preventDefault();
    closeBackgroundDialog(false);
  });

  backgroundDialog.addEventListener("click", function (event) {
    if (event.target === backgroundDialog) {
      closeBackgroundDialog(false);
    }
  });

  document.getElementById("wallpaperGrid").addEventListener("click", function (event) {
    var option = event.target.closest(".wallpaper-option");
    if (!option) {
      return;
    }
    var wallpaperId = option.dataset.wallpaper;
    if (wallpaperId === "custom" && !draftUrl) {
      return;
    }
    if (wallpaperId !== "custom") {
      commitThemeImmediately(wallpaperId, false);
      return;
    }
    draftSettings.id = wallpaperId;
    updateWallpaperOptions();
    applyWallpaper(draftSettings, draftUrl);
  });

  dimRange.addEventListener("input", function () {
    draftSettings.dim = Number(dimRange.value);
    updateRangeOutputs();
    applyWallpaper(draftSettings, draftUrl);
    emitClawd("pushing", "", {
      duration: 850,
      priority: 2
    });
  });

  blurRange.addEventListener("input", function () {
    draftSettings.blur = Number(blurRange.value);
    updateRangeOutputs();
    applyWallpaper(draftSettings, draftUrl);
    emitClawd("pushing", "", {
      duration: 850,
      priority: 2
    });
  });

  backgroundFile.addEventListener("change", function () {
    useUploadedFile(backgroundFile.files && backgroundFile.files[0]);
  });

  ["dragenter", "dragover"].forEach(function (eventName) {
    uploadDropzone.addEventListener(eventName, function (event) {
      event.preventDefault();
      uploadDropzone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach(function (eventName) {
    uploadDropzone.addEventListener(eventName, function (event) {
      event.preventDefault();
      uploadDropzone.classList.remove("dragging");
    });
  });

  uploadDropzone.addEventListener("drop", function (event) {
    var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    useUploadedFile(file);
  });

  window.addEventListener("beforeunload", function () {
    if (draftUrl && draftUrl !== customUrl) {
      URL.revokeObjectURL(draftUrl);
    }
    if (customUrl) {
      URL.revokeObjectURL(customUrl);
    }
  });

  switchWorkspace("volo", true);
  resizeMessageInput();
  applyWallpaper(appliedSettings, null);
  initializeWallpaper();
})();

