(function () {
  "use strict";

  var composer = document.getElementById("voloComposer");
  var input = document.getElementById("voloInput");
  var sendButton = document.getElementById("voloSendButton");
  var messageScroll = document.getElementById("voloMessageScroll");
  var messageList = document.getElementById("voloMessageList");
  var emptyState = document.getElementById("voloEmpty");
  var drawer = document.getElementById("voloDrawer");
  var drawerButton = document.getElementById("voloDrawerButton");
  var drawerClose = document.getElementById("voloDrawerClose");
  var drawerScrim = document.getElementById("voloDrawerScrim");
  var newChatButton = document.getElementById("voloNewChatButton");
  var currentChatButton = document.getElementById("voloCurrentChatButton");
  var mainSidebarButton = document.getElementById("voloMainSidebarButton");
  var topNewChatButton = document.getElementById("voloTopNewChatButton");
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

  function setDrawerOpen(open, restoreFocus) {
    drawer.classList.toggle("is-open", open);
    drawerScrim.classList.toggle("is-open", open);
    drawer.setAttribute("aria-hidden", String(!open));
    drawer.toggleAttribute("inert", !open);
    drawerButton.setAttribute("aria-expanded", String(open));
    if (open) {
      window.setTimeout(function () {
        newChatButton.focus();
      }, 80);
    } else if (restoreFocus) {
      drawerButton.focus();
    }
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
    var mark = document.createElement("button");
    mark.className = "volo-assistant-mark volo-flower-button";
    mark.type = "button";
    mark.setAttribute("aria-label", "让 Volo 的小花动起来");
    var note = document.createElement("span");
    note.textContent = "Volo can make mistakes, but please love him anyway.";
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

  function animateFlower(flower) {
    flower.classList.remove("is-blooming");
    void flower.offsetWidth;
    flower.classList.add("is-blooming");
    flower.addEventListener(
      "animationend",
      function () {
        flower.classList.remove("is-blooming");
      },
      { once: true }
    );
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
    messages = [];
    input.value = "";
    resizeInput();
    renderMessages(false);
    updateSidebarPreview("想聊什么都可以", "现在");
    setDrawerOpen(false, false);
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

  drawerButton.addEventListener("click", function () {
    setDrawerOpen(drawerButton.getAttribute("aria-expanded") !== "true", false);
  });

  drawerClose.addEventListener("click", function () {
    setDrawerOpen(false, true);
  });

  drawerScrim.addEventListener("click", function () {
    setDrawerOpen(false, true);
  });

  newChatButton.addEventListener("click", startNewChat);
  topNewChatButton.addEventListener("click", startNewChat);

  currentChatButton.addEventListener("click", function () {
    setDrawerOpen(false, false);
    input.focus();
  });

  mainSidebarButton.addEventListener("click", function () {
    setDrawerOpen(false, false);
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

  messageList.addEventListener("click", function (event) {
    var flower = event.target.closest(".volo-flower-button");
    if (!flower || !messageList.contains(flower)) {
      return;
    }
    animateFlower(flower);
    emitClawd("happy", "Volo 的小花开啦", {
      duration: 1000,
      priority: 2
    });
  });

  document.addEventListener("click", function (event) {
    var workspaceButton = event.target.closest("[data-workspace]");
    if (workspaceButton && workspaceButton.dataset.workspace !== "volo") {
      setDrawerOpen(false, false);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && drawer.classList.contains("is-open")) {
      setDrawerOpen(false, true);
    }
  });

  document.addEventListener("volo:new-chat", startNewChat);

  resizeInput();
  renderMessages(false);
})();

