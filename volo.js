(function () {
  "use strict";

  var composer = document.getElementById("voloComposer");
  var input = document.getElementById("voloInput");
  var sendButton = document.getElementById("voloSendButton");
  var messageScroll = document.getElementById("voloMessageScroll");
  var messageList = document.getElementById("voloMessageList");
  var emptyState = document.getElementById("voloEmpty");
  var messages = [];
  var isTyping = false;
  var replyTimer = 0;
  var replyIndex = 0;
  var replies = [
    "我在。把你现在最想做的那件事告诉我，我们从第一步慢慢来。",
    "好，我记下来了。你想先整理想法，还是直接开始做？",
    "可以。我们先把它拆成一个很小、现在就能完成的动作。"
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

  function createUserMessage(message) {
    var row = document.createElement("article");
    row.className = "volo-message volo-message-user";
    var bubble = document.createElement("div");
    bubble.className = "volo-user-bubble";
    var text = document.createElement("p");
    text.textContent = message.text;
    bubble.appendChild(text);
    row.appendChild(bubble);
    return row;
  }

  function createAssistantMessage(message) {
    var row = document.createElement("article");
    row.className = "volo-message volo-message-assistant";
    var body = document.createElement("div");
    body.className = "volo-assistant-body";
    var text = document.createElement("p");
    text.textContent = message.text;
    body.appendChild(text);
    var footer = document.createElement("footer");
    footer.className = "volo-assistant-footer";
    var mark = document.createElement("span");
    mark.className = "volo-assistant-mark";
    mark.setAttribute("aria-hidden", "true");
    var note = document.createElement("span");
    note.textContent = "Volo 也可能出错，请核对重要信息";
    footer.append(mark, note);
    row.append(body, footer);
    return row;
  }

  function createTypingMessage() {
    var row = document.createElement("article");
    row.className = "volo-message volo-message-assistant";
    row.setAttribute("aria-label", "Volo 正在回复");
    var typing = document.createElement("div");
    typing.className = "volo-typing";
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

  function queueReply() {
    window.clearTimeout(replyTimer);
    isTyping = true;
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
      messages.push({ role: "assistant", text: reply, time: time });
      renderMessages(document.body.dataset.chatView === "volo");
      updateSidebarPreview(reply, time);
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
    messages.push({ role: "user", text: value, time: time });
    input.value = "";
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

  resizeInput();
  renderMessages(false);
})();

