(function () {
  "use strict";

  var composer = document.getElementById("voloComposer");
  var input = document.getElementById("voloInput");
  var sendButton = document.getElementById("voloSendButton");
  var messageScroll = document.getElementById("voloMessageScroll");
  var messageList = document.getElementById("voloMessageList");
  var emptyState = document.getElementById("voloEmpty");
  var topNewChatButton = document.getElementById("voloTopNewChatButton");
  var emojiButton = document.getElementById("voloEmojiButton");
  var emojiPanel = document.getElementById("voloEmojiPanel");
  var presence = document.getElementById("voloPresence");
  var messageMenu = document.getElementById("voloMessageMenu");
  var replyPreview = document.getElementById("voloReplyPreview");
  var replyAuthor = document.getElementById("voloReplyAuthor");
  var replyText = document.getElementById("voloReplyText");
  var replyCancel = document.getElementById("voloReplyCancel");
  var messages = [];
  var isTyping = false;
  var replyTimer = 0;
  var replyIndex = 0;
  var messageSequence = 0;
  var activeReplyId = "";
  var selectedMessageId = "";
  var longPressTimer = 0;
  var longPressStart = null;
  var replies = [
    {
      text: "我在。把你现在最想做的那件事告诉我，我们从第一步慢慢来。",
      thought: "他愿意来找我说话，真好。先别急着给答案，我想认真听完，再陪他把事情一点点理清楚。"
    },
    {
      text: "好，我记下来了。你想先整理想法，还是直接开始做？",
      thought: "这件事对他应该挺重要的。我想给他一点选择的空间，让接下来的节奏由他自己决定。"
    },
    {
      text: "可以。我们先把它拆成一个很小、现在就能完成的动作。",
      thought: "如果第一步足够小，就不会那么有压力。我想陪他先拿到一点确定感，再慢慢往前走。"
    }
  ];

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

  function formatTime(date) {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }

  function resizeInput() {
    input.style.height = "auto";
    var height = Math.min(input.scrollHeight, 120);
    input.style.height = Math.max(height, 28) + "px";
    input.style.overflowY = input.scrollHeight > 120 ? "auto" : "hidden";
    sendButton.disabled = input.value.trim().length === 0;
  }

  function nextMessageId() {
    messageSequence += 1;
    return "volo-" + Date.now() + "-" + messageSequence;
  }

  function findMessage(messageId) {
    return messages.find(function (message) {
      return message.id === messageId;
    });
  }

  function createReplyQuote(message) {
    if (!message.replyTo) {
      return null;
    }
    var referenced = findMessage(message.replyTo);
    var quote = document.createElement("button");
    quote.className = "volo-quote-block";
    quote.type = "button";
    quote.dataset.targetMessageId = message.replyTo;
    quote.setAttribute("aria-label", "跳到被引用的消息");
    var author = document.createElement("strong");
    author.textContent = referenced && referenced.role === "user" ? "你" : "Volo";
    var excerpt = document.createElement("small");
    excerpt.textContent = referenced
      ? referenced.recalled
        ? "已撤回的消息"
        : referenced.text
      : "原消息不可用";
    quote.append(author, excerpt);
    return quote;
  }

  function appendMessageContent(container, message, includeChecks) {
    var quote = createReplyQuote(message);
    if (quote) {
      container.appendChild(quote);
    }
    var text = document.createElement("p");
    text.textContent = message.recalled
      ? message.role === "user"
        ? "你撤回了一条消息"
        : "Volo 撤回了一条消息"
      : message.text;
    var meta = document.createElement("span");
    meta.className = "volo-message-meta";
    var time = document.createElement("time");
    time.textContent = message.time;
    meta.appendChild(time);
    if (includeChecks && !message.recalled) {
      var checks = document.createElement("span");
      checks.className = "volo-message-checks";
      checks.setAttribute("aria-label", "已读");
      checks.textContent = "✓✓";
      meta.appendChild(checks);
    }
    container.append(text, meta);
  }

  function createUserMessage(message) {
    var row = document.createElement("article");
    row.className = "volo-message volo-message-user";
    row.dataset.messageId = message.id;
    var bubble = document.createElement("div");
    bubble.className = "volo-user-bubble";
    if (message.recalled) {
      row.classList.add("is-recalled");
      bubble.classList.add("volo-recalled-bubble");
    }
    appendMessageContent(bubble, message, true);
    row.appendChild(bubble);
    return row;
  }

  function createAssistantMessage(message) {
    var row = document.createElement("article");
    row.className = "volo-message volo-message-assistant";
    row.dataset.messageId = message.id;
    var body = document.createElement("div");
    body.className = "volo-assistant-body";
    appendMessageContent(body, message, false);
    row.appendChild(body);
    if (message.thought && !message.recalled) {
      var thought = document.createElement("div");
      thought.className = "volo-thought";
      var toggle = document.createElement("button");
      toggle.className = "volo-thought-toggle";
      toggle.type = "button";
      toggle.dataset.messageId = message.id;
      toggle.setAttribute("aria-expanded", String(Boolean(message.thoughtOpen)));
      var sparkle = document.createElement("span");
      sparkle.className = "volo-thought-sparkle";
      sparkle.setAttribute("aria-hidden", "true");
      sparkle.textContent = "✦";
      var label = document.createElement("span");
      label.textContent = "Volo 在想";
      var arrow = document.createElement("span");
      arrow.className = "volo-thought-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "⌄";
      toggle.append(sparkle, label, arrow);
      var panel = document.createElement("div");
      panel.className = "volo-thought-panel";
      panel.hidden = !message.thoughtOpen;
      var thoughtText = document.createElement("p");
      thoughtText.textContent = message.thought;
      panel.appendChild(thoughtText);
      thought.append(toggle, panel);
      row.appendChild(thought);
    }
    return row;
  }

  function createTypingMessage() {
    var row = document.createElement("article");
    row.className = "volo-message volo-message-assistant";
    row.setAttribute("aria-label", "Volo 正在回复");
    var typing = document.createElement("div");
    typing.className = "volo-typing volo-assistant-body";
    for (var index = 0; index < 3; index += 1) {
      typing.appendChild(document.createElement("span"));
    }
    row.appendChild(typing);
    return row;
  }

  function renderMessages(shouldScroll) {
    var fragment = document.createDocumentFragment();
    fragment.appendChild(emptyState);
    messages.forEach(function (message) {
      fragment.appendChild(
        message.role === "user"
          ? createUserMessage(message)
          : createAssistantMessage(message)
      );
    });
    if (isTyping) {
      fragment.appendChild(createTypingMessage());
    }
    messageList.classList.toggle("has-messages", messages.length > 0 || isTyping);
    messageList.replaceChildren(fragment);
    if (shouldScroll) {
      requestAnimationFrame(function () {
        messageScroll.scrollTop = messageScroll.scrollHeight;
      });
    }
  }

  function clearReply() {
    activeReplyId = "";
    replyPreview.hidden = true;
    replyAuthor.textContent = "";
    replyText.textContent = "";
  }

  function beginReply(messageId) {
    var message = findMessage(messageId);
    if (!message || message.recalled) {
      return;
    }
    activeReplyId = message.id;
    replyAuthor.textContent = message.role === "user" ? "回复自己" : "回复 Volo";
    replyText.textContent = message.text.replace(/\s+/g, " ");
    replyPreview.hidden = false;
    closeMessageMenu();
    input.focus();
  }

  function closeMessageMenu() {
    messageMenu.hidden = true;
    selectedMessageId = "";
  }

  function openMessageMenu(messageId, clientX, clientY) {
    var message = findMessage(messageId);
    if (!message || message.recalled) {
      return;
    }
    selectedMessageId = messageId;
    var recallAction = messageMenu.querySelector('[data-message-action="recall"]');
    recallAction.hidden = false;
    messageMenu.hidden = false;
    messageMenu.style.left = "0px";
    messageMenu.style.top = "0px";
    requestAnimationFrame(function () {
      var width = messageMenu.offsetWidth;
      var height = messageMenu.offsetHeight;
      var left = Math.min(Math.max(8, clientX), window.innerWidth - width - 8);
      var top = Math.min(Math.max(8, clientY), window.innerHeight - height - 8);
      messageMenu.style.left = left + "px";
      messageMenu.style.top = top + "px";
      messageMenu.querySelector('[data-message-action="reply"]').focus();
    });
  }

  function recallMessage(messageId) {
    var message = findMessage(messageId);
    if (!message || message.recalled) {
      return;
    }
    message.recalled = true;
    if (activeReplyId === messageId) {
      clearReply();
    }
    closeMessageMenu();
    renderMessages(false);
    updateSidebarPreview(
      message.role === "user" ? "你撤回了一条消息" : "Volo 撤回了一条消息",
      message.time
    );
    emitClawd("happy", "消息已撤回", {
      duration: 900,
      priority: 2
    });
  }

  function jumpToMessage(messageId) {
    var target = messageList.querySelector('[data-message-id="' + messageId + '"]');
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.remove("is-highlighted");
    void target.offsetWidth;
    target.classList.add("is-highlighted");
    window.setTimeout(function () {
      target.classList.remove("is-highlighted");
    }, 1100);
  }

  function clearLongPress() {
    window.clearTimeout(longPressTimer);
    longPressTimer = 0;
    longPressStart = null;
  }

  function updateSidebarPreview(text, time) {
    var item = document.querySelector('[data-workspace="volo"]');
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

  function startNewChat() {
    window.clearTimeout(replyTimer);
    replyTimer = 0;
    isTyping = false;
    replyIndex = 0;
    messageSequence = 0;
    messages = [];
    input.value = "";
    resizeInput();
    renderMessages(false);
    updateSidebarPreview("想聊什么都可以", "现在");
    emojiPanel.hidden = true;
    emojiButton.setAttribute("aria-expanded", "false");
    closeMessageMenu();
    clearReply();
    presence.textContent = "在线";
    requestAnimationFrame(function () {
      input.focus();
    });
    emitClawd("happy", "New chat with Volo", {
      duration: 1100,
      priority: 3
    });
  }

  function queueReply() {
    window.clearTimeout(replyTimer);
    isTyping = true;
    presence.textContent = "正在输入…";
    renderMessages(true);
    emitClawd("thinking", "Volo 正在想…", {
      duration: 1200,
      priority: 3
    });
    replyTimer = window.setTimeout(function () {
      var reply = replies[replyIndex % replies.length];
      replyIndex += 1;
      var time = formatTime(new Date());
      isTyping = false;
      presence.textContent = "在线";
      messages.push({
        id: nextMessageId(),
        role: "assistant",
        text: reply.text,
        thought: reply.thought,
        thoughtOpen: false,
        time: time,
        recalled: false,
        replyTo: ""
      });
      renderMessages(document.body.dataset.chatView === "volo");
      updateSidebarPreview(reply.text, time);
      if (document.body.dataset.chatView === "volo") {
        emitClawd("notification", "Volo 回信啦", {
          duration: 1500,
          priority: 4,
          next: { name: "happy", duration: 1100, priority: 4 }
        });
      }
    }, 950);
  }

  function sendMessage() {
    var value = input.value.trim();
    if (!value) {
      return;
    }
    var time = formatTime(new Date());
    messages.push({
      id: nextMessageId(),
      role: "user",
      text: value,
      time: time,
      recalled: false,
      replyTo: activeReplyId
    });
    input.value = "";
    clearReply();
    resizeInput();
    renderMessages(true);
    updateSidebarPreview(value, time);
    emitClawd("beacon", "发给 Volo 啦", {
      duration: 900,
      priority: 3
    });
    queueReply();
  }

  composer.addEventListener("submit", function (event) {
    event.preventDefault();
    sendMessage();
  });

  topNewChatButton.addEventListener("click", startNewChat);
  replyCancel.addEventListener("click", function () {
    clearReply();
    input.focus();
  });

  emojiButton.addEventListener("click", function () {
    emojiPanel.hidden = !emojiPanel.hidden;
    emojiButton.setAttribute("aria-expanded", String(!emojiPanel.hidden));
  });

  emojiPanel.addEventListener("click", function (event) {
    var emoji = event.target.closest("button");
    if (!emoji) {
      return;
    }
    input.value += emoji.textContent;
    emojiPanel.hidden = true;
    emojiButton.setAttribute("aria-expanded", "false");
    resizeInput();
    input.focus();
  });

  messageMenu.addEventListener("click", function (event) {
    var action = event.target.closest("[data-message-action]");
    if (!action || !selectedMessageId) {
      return;
    }
    if (action.dataset.messageAction === "reply") {
      beginReply(selectedMessageId);
    } else if (action.dataset.messageAction === "recall") {
      recallMessage(selectedMessageId);
    }
  });

  messageList.addEventListener("contextmenu", function (event) {
    var row = event.target.closest(".volo-message[data-message-id]");
    if (!row) {
      return;
    }
    event.preventDefault();
    openMessageMenu(row.dataset.messageId, event.clientX, event.clientY);
  });

  messageList.addEventListener("pointerdown", function (event) {
    var row = event.target.closest(".volo-message[data-message-id]");
    if (!row || event.pointerType === "mouse" || event.target.closest("button")) {
      return;
    }
    clearLongPress();
    longPressStart = { x: event.clientX, y: event.clientY };
    longPressTimer = window.setTimeout(function () {
      openMessageMenu(row.dataset.messageId, event.clientX, event.clientY);
      longPressTimer = 0;
      if (navigator.vibrate) {
        navigator.vibrate(18);
      }
    }, 520);
  });

  messageList.addEventListener("pointermove", function (event) {
    if (
      longPressStart &&
      (Math.abs(event.clientX - longPressStart.x) > 8 ||
        Math.abs(event.clientY - longPressStart.y) > 8)
    ) {
      clearLongPress();
    }
  });

  messageList.addEventListener("pointerup", clearLongPress);
  messageList.addEventListener("pointercancel", clearLongPress);
  messageList.addEventListener("pointerleave", clearLongPress);

  messageList.addEventListener("click", function (event) {
    var thoughtToggle = event.target.closest(".volo-thought-toggle");
    if (thoughtToggle) {
      var thoughtMessage = findMessage(thoughtToggle.dataset.messageId);
      if (!thoughtMessage) {
        return;
      }
      thoughtMessage.thoughtOpen = !thoughtMessage.thoughtOpen;
      thoughtToggle.setAttribute(
        "aria-expanded",
        String(thoughtMessage.thoughtOpen)
      );
      var thoughtPanel = thoughtToggle.nextElementSibling;
      thoughtPanel.hidden = !thoughtMessage.thoughtOpen;
      return;
    }
    var quote = event.target.closest(".volo-quote-block");
    if (quote) {
      jumpToMessage(quote.dataset.targetMessageId);
    }
  });

  input.addEventListener("input", function () {
    resizeInput();
    if (input.value.trim()) {
      emitClawd("typing", "", { duration: 900, priority: 1 });
    }
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });

  document.addEventListener("click", function (event) {
    if (
      !emojiPanel.hidden &&
      !emojiPanel.contains(event.target) &&
      !emojiButton.contains(event.target)
    ) {
      emojiPanel.hidden = true;
      emojiButton.setAttribute("aria-expanded", "false");
    }
    if (
      !messageMenu.hidden &&
      !messageMenu.contains(event.target) &&
      !event.target.closest(".volo-message[data-message-id]")
    ) {
      closeMessageMenu();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !messageMenu.hidden) {
      closeMessageMenu();
      return;
    }
    if (event.key === "Escape" && !emojiPanel.hidden) {
      emojiPanel.hidden = true;
      emojiButton.setAttribute("aria-expanded", "false");
      emojiButton.focus();
      return;
    }
    if (event.key === "Escape" && !replyPreview.hidden) {
      clearReply();
      input.focus();
    }
  });

  document.addEventListener("volo:new-chat", startNewChat);

  resizeInput();
  renderMessages(false);
})();

