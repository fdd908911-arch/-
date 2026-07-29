(function () {
  "use strict";

  var MESSAGE_STORAGE_KEY = "island-chat.volo-messages.v1";
  var MAX_SAVED_MESSAGES = 120;
  var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  var MAX_FILE_BYTES = 2 * 1024 * 1024;
  var MAX_IMAGE_EDGE = 1600;
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
  var attachButton = document.getElementById("voloAttachButton");
  var actionPanel = document.getElementById("voloActionPanel");
  var actionClose = document.getElementById("voloActionClose");
  var togetherButton = document.getElementById("voloTogetherButton");
  var attachmentInput = document.getElementById("voloAttachmentInput");
  var fileInput = document.getElementById("voloFileInput");
  var attachmentPreview = document.getElementById("voloAttachmentPreview");
  var attachmentThumb = document.getElementById("voloAttachmentThumb");
  var attachmentKind = document.getElementById("voloAttachmentKind");
  var attachmentLabel = document.getElementById("voloAttachmentLabel");
  var attachmentName = document.getElementById("voloAttachmentName");
  var attachmentCancel = document.getElementById("voloAttachmentCancel");
  var imageLightbox = document.getElementById("voloImageLightbox");
  var imageLightboxImage = document.getElementById("voloImageLightboxImage");
  var imageLightboxClose = document.getElementById("voloImageLightboxClose");
  var messages = [];
  var isTyping = false;
  var replyTimer = 0;
  var replyIndex = 0;
  var messageSequence = 0;
  var activeReplyId = "";
  var selectedMessageId = "";
  var longPressTimer = 0;
  var longPressStart = null;
  var pendingAttachment = null;
  var replies = [
    {
      text: "我在。\n\n把你现在最想做的那件事告诉我，我们从 **第一步** 慢慢来。",
      thought: "他愿意来找我说话，真好。先别急着给答案，我想认真听完，再陪他把事情一点点理清楚。"
    },
    {
      text: "好，我记下来了。\n\n- 先整理想法\n- 直接开始做\n\n你想选哪一个？",
      thought: "这件事对他应该挺重要的。我想给他一点选择的空间，让接下来的节奏由他自己决定。"
    },
    {
      text: "### 可以。\n\n我们先把它拆成一个很小、现在就能完成的动作。\n\n> 先完成，再慢慢变好。",
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

  function showToast(message) {
    document.dispatchEvent(
      new CustomEvent("island:toast", {
        detail: { message: message }
      })
    );
  }

  function normalizeReactions(value) {
    var result = {};
    if (!value || typeof value !== "object") {
      return result;
    }
    Object.keys(value).forEach(function (emoji) {
      var count = Math.max(0, Math.floor(Number(value[emoji]) || 0));
      if (count) {
        result[emoji] = count;
      }
    });
    return result;
  }

  function normalizeAttachment(value) {
    if (
      !value ||
      (value.kind !== "image" && value.kind !== "file") ||
      typeof value.src !== "string" ||
      !value.src.startsWith("data:")
    ) {
      return null;
    }
    if (value.kind === "image" && !value.src.startsWith("data:image/")) {
      return null;
    }
    return {
      kind: value.kind,
      src: value.src,
      name: typeof value.name === "string" ? value.name.slice(0, 120) : "附件",
      size: Math.max(0, Math.floor(Number(value.size) || 0)),
      type: typeof value.type === "string" ? value.type.slice(0, 100) : ""
    };
  }

  function normalizeMessage(value) {
    if (
      !value ||
      (value.role !== "user" && value.role !== "assistant") ||
      typeof value.id !== "string"
    ) {
      return null;
    }
    return {
      id: value.id,
      role: value.role,
      text: typeof value.text === "string" ? value.text.slice(0, 2000) : "",
      thought: typeof value.thought === "string" ? value.thought : "",
      thoughtOpen: false,
      time: typeof value.time === "string" ? value.time : "",
      recalled: Boolean(value.recalled),
      replyTo: typeof value.replyTo === "string" ? value.replyTo : "",
      reactions: normalizeReactions(value.reactions),
      attachment: normalizeAttachment(value.attachment)
    };
  }

  function loadMessages() {
    try {
      var saved = JSON.parse(localStorage.getItem(MESSAGE_STORAGE_KEY) || "{}");
      var rows = Array.isArray(saved) ? saved : saved.messages;
      if (!Array.isArray(rows)) {
        return [];
      }
      return rows
        .map(normalizeMessage)
        .filter(Boolean)
        .slice(-MAX_SAVED_MESSAGES);
    } catch (error) {
      return [];
    }
  }

  function saveMessages(quiet) {
    try {
      localStorage.setItem(
        MESSAGE_STORAGE_KEY,
        JSON.stringify({
          version: 3,
          messages: messages.slice(-MAX_SAVED_MESSAGES)
        })
      );
      return true;
    } catch (error) {
      if (!quiet) {
        showToast("消息已显示，但浏览器空间不足，刷新后可能不会保留");
      }
      return false;
    }
  }

  function markdownPlainText(value) {
    return String(value || "")
      .replace(/^\s{0,3}```[\w.+-]*\s*$/gm, "")
      .replace(/\[([^\]\n]+)\]\([^)\n]+\)/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s{0,3}(?:[-+*]|\d+\.)\s+/gm, "")
      .replace(/^\[([ xX])\]\s+/gm, "")
      .replace(/(\*\*|__|~~|`)/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function messageSummary(message) {
    if (!message) {
      return "";
    }
    if (message.recalled) {
      return message.role === "user" ? "你撤回了一条消息" : "Volo 撤回了一条消息";
    }
    if (message.text) {
      return message.role === "assistant"
        ? markdownPlainText(message.text)
        : message.text;
    }
    if (!message.attachment) {
      return "";
    }
    return (
      (message.attachment.kind === "image" ? "[图片] " : "[文件] ") +
      message.attachment.name
    );
  }

  function appendMarkdownText(container, value) {
    container.appendChild(
      document.createTextNode(
        String(value || "").replace(/\\([\\`*_{}\[\]()#+\-.!>~])/g, "$1")
      )
    );
  }

  function safeMarkdownLink(value) {
    var href = String(value || "").trim();
    if (!/^(https?:|mailto:)/i.test(href)) {
      return "";
    }
    try {
      return new URL(href, window.location.href).href;
    } catch (error) {
      return "";
    }
  }

  function appendInlineMarkdown(container, source) {
    var value = String(source || "");
    var tokenPattern =
      /(?<!\\)(?:`([^`\n]+)`|\[([^\]\n]+)\]\(([^()\s]+(?:\([^()\s]*\)[^()\s]*)?)\)|\*\*([^\n]+?)\*\*|__([^\n]+?)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_)/g;
    var cursor = 0;
    var match;
    while ((match = tokenPattern.exec(value))) {
      if (match.index > cursor) {
        appendMarkdownText(container, value.slice(cursor, match.index));
      }
      var element = null;
      var content;
      if (match[1] !== undefined) {
        element = document.createElement("code");
        element.textContent = match[1];
      } else if (match[2] !== undefined) {
        var href = safeMarkdownLink(match[3]);
        if (href) {
          element = document.createElement("a");
          element.href = href;
          element.target = "_blank";
          element.rel = "noopener noreferrer";
          appendInlineMarkdown(element, match[2]);
        } else {
          appendMarkdownText(container, match[0]);
        }
      } else if (match[4] !== undefined || match[5] !== undefined) {
        element = document.createElement("strong");
        content = match[4] !== undefined ? match[4] : match[5];
        appendInlineMarkdown(element, content);
      } else if (match[6] !== undefined) {
        element = document.createElement("s");
        appendInlineMarkdown(element, match[6]);
      } else {
        element = document.createElement("em");
        content = match[7] !== undefined ? match[7] : match[8];
        appendInlineMarkdown(element, content);
      }
      if (element) {
        container.appendChild(element);
      }
      cursor = tokenPattern.lastIndex;
    }
    if (cursor < value.length) {
      appendMarkdownText(container, value.slice(cursor));
    }
  }

  function splitMarkdownTableRow(line) {
    return String(line || "")
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split(/(?<!\\)\|/)
      .map(function (cell) {
        return cell.trim().replace(/\\\|/g, "|");
      });
  }

  function isMarkdownTableDivider(line) {
    var cells = splitMarkdownTableRow(line);
    return (
      cells.length > 0 &&
      cells.every(function (cell) {
        return /^:?-{3,}:?$/.test(cell);
      })
    );
  }

  function isMarkdownBlockStart(line, nextLine) {
    return (
      /^\s*$/.test(line) ||
      /^\s{0,3}```/.test(line) ||
      /^\s{0,3}#{1,6}\s+/.test(line) ||
      /^\s{0,3}>\s?/.test(line) ||
      /^\s{0,3}(?:[-+*]|\d+\.)\s+/.test(line) ||
      /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
      (nextLine !== undefined &&
        line.includes("|") &&
        isMarkdownTableDivider(nextLine))
    );
  }

  function createMarkdownCodeBlock(language, content) {
    var shell = document.createElement("div");
    shell.className = "volo-markdown-code";
    var header = document.createElement("div");
    header.className = "volo-markdown-code-header";
    var label = document.createElement("span");
    label.textContent = language || "代码";
    var copy = document.createElement("button");
    copy.type = "button";
    copy.dataset.markdownCopy = "";
    copy.textContent = "复制";
    copy.setAttribute("aria-label", "复制代码");
    header.append(label, copy);
    var pre = document.createElement("pre");
    var code = document.createElement("code");
    if (language) {
      code.dataset.language = language;
    }
    code.textContent = content;
    pre.appendChild(code);
    shell.append(header, pre);
    return shell;
  }

  function appendMarkdown(container, source) {
    var root = document.createElement("div");
    root.className = "volo-markdown";
    var lines = String(source || "")
      .replace(/\r\n?/g, "\n")
      .split("\n");
    var index = 0;

    while (index < lines.length) {
      var line = lines[index];
      if (/^\s*$/.test(line)) {
        index += 1;
        continue;
      }

      var fence = line.match(/^\s{0,3}```([\w.+-]*)\s*$/);
      if (fence) {
        var codeLines = [];
        index += 1;
        while (index < lines.length && !/^\s{0,3}```\s*$/.test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) {
          index += 1;
        }
        root.appendChild(
          createMarkdownCodeBlock(fence[1], codeLines.join("\n"))
        );
        continue;
      }

      var heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        var level = Math.min(4, heading[1].length);
        var title = document.createElement("h" + level);
        appendInlineMarkdown(title, heading[2]);
        root.appendChild(title);
        index += 1;
        continue;
      }

      if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        root.appendChild(document.createElement("hr"));
        index += 1;
        continue;
      }

      if (
        index + 1 < lines.length &&
        line.includes("|") &&
        isMarkdownTableDivider(lines[index + 1])
      ) {
        var headers = splitMarkdownTableRow(line);
        var tableWrap = document.createElement("div");
        tableWrap.className = "volo-markdown-table-wrap";
        var table = document.createElement("table");
        var tableHead = document.createElement("thead");
        var headerRow = document.createElement("tr");
        headers.forEach(function (cell) {
          var th = document.createElement("th");
          appendInlineMarkdown(th, cell);
          headerRow.appendChild(th);
        });
        tableHead.appendChild(headerRow);
        table.appendChild(tableHead);
        index += 2;
        var tableBody = document.createElement("tbody");
        while (
          index < lines.length &&
          !/^\s*$/.test(lines[index]) &&
          lines[index].includes("|")
        ) {
          var row = document.createElement("tr");
          splitMarkdownTableRow(lines[index]).forEach(function (cell) {
            var td = document.createElement("td");
            appendInlineMarkdown(td, cell);
            row.appendChild(td);
          });
          tableBody.appendChild(row);
          index += 1;
        }
        table.appendChild(tableBody);
        tableWrap.appendChild(table);
        root.appendChild(tableWrap);
        continue;
      }

      if (/^\s{0,3}>\s?/.test(line)) {
        var quoteLines = [];
        while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index])) {
          quoteLines.push(lines[index].replace(/^\s{0,3}>\s?/, ""));
          index += 1;
        }
        var blockquote = document.createElement("blockquote");
        appendMarkdown(blockquote, quoteLines.join("\n"));
        root.appendChild(blockquote);
        continue;
      }

      var listMatch = line.match(/^\s{0,3}([-+*]|\d+\.)\s+(.+)$/);
      if (listMatch) {
        var ordered = /\d+\./.test(listMatch[1]);
        var list = document.createElement(ordered ? "ol" : "ul");
        while (index < lines.length) {
          var itemMatch = lines[index].match(
            /^\s{0,3}([-+*]|\d+\.)\s+(.+)$/
          );
          if (!itemMatch || /\d+\./.test(itemMatch[1]) !== ordered) {
            break;
          }
          var item = document.createElement("li");
          var itemText = itemMatch[2];
          var task = itemText.match(/^\[([ xX])\]\s+(.+)$/);
          if (task) {
            item.className = "volo-markdown-task";
            var check = document.createElement("span");
            check.setAttribute("aria-hidden", "true");
            check.textContent = task[1].toLowerCase() === "x" ? "✓" : "";
            item.appendChild(check);
            itemText = task[2];
          }
          appendInlineMarkdown(item, itemText);
          list.appendChild(item);
          index += 1;
        }
        root.appendChild(list);
        continue;
      }

      var paragraphLines = [line.trim()];
      index += 1;
      while (
        index < lines.length &&
        !isMarkdownBlockStart(lines[index], lines[index + 1])
      ) {
        paragraphLines.push(lines[index].trim());
        index += 1;
      }
      var paragraph = document.createElement("p");
      appendInlineMarkdown(paragraph, paragraphLines.join(" "));
      root.appendChild(paragraph);
    }

    container.appendChild(root);
  }

  function setPendingAttachment(attachment) {
    pendingAttachment = attachment;
    attachmentPreview.hidden = !attachment;
    if (attachment) {
      var isImage = attachment.kind === "image";
      attachmentPreview.classList.toggle("is-image", isImage);
      attachmentKind.hidden = isImage;
      attachmentThumb.hidden = !isImage;
      if (isImage) {
        attachmentThumb.src = attachment.src;
        attachmentThumb.alt = attachment.name;
      } else {
        attachmentThumb.removeAttribute("src");
        attachmentThumb.alt = "";
      }
      attachmentLabel.textContent = isImage ? "图片附件" : "文件附件";
      attachmentName.textContent = attachment.name;
    } else {
      attachmentPreview.classList.remove("is-image");
      attachmentKind.hidden = false;
      attachmentThumb.hidden = true;
      attachmentThumb.removeAttribute("src");
      attachmentThumb.alt = "";
      attachmentLabel.textContent = "附件";
      attachmentName.textContent = "";
    }
    resizeInput();
  }

  function formatBytes(value) {
    var bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) {
      return bytes + " B";
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + " KB";
    }
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function prepareImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.addEventListener("error", function () {
        reject(new Error("read"));
      });
      reader.addEventListener("load", function () {
        var source = String(reader.result || "");
        var image = new Image();
        image.addEventListener("error", function () {
          reject(new Error("decode"));
        });
        image.addEventListener("load", function () {
          if (
            file.size <= 900 * 1024 &&
            image.naturalWidth <= MAX_IMAGE_EDGE &&
            image.naturalHeight <= MAX_IMAGE_EDGE
          ) {
            resolve({
              kind: "image",
              src: source,
              name: file.name || "图片",
              size: file.size,
              type: file.type
            });
            return;
          }
          var scale = Math.min(
            1,
            MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight)
          );
          var canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          var context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("canvas"));
            return;
          }
          if (file.type !== "image/png") {
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
          }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          var outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
          resolve({
            kind: "image",
            src: canvas.toDataURL(outputType, 0.82),
            name: file.name || "图片",
            size: file.size,
            type: outputType
          });
        });
        image.src = source;
      });
      reader.readAsDataURL(file);
    });
  }

  function prepareFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.addEventListener("error", function () {
        reject(new Error("read"));
      });
      reader.addEventListener("load", function () {
        resolve({
          kind: "file",
          src: String(reader.result || ""),
          name: file.name || "未命名文件",
          size: file.size,
          type: file.type || "application/octet-stream"
        });
      });
      reader.readAsDataURL(file);
    });
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
    sendButton.disabled = input.value.trim().length === 0 && !pendingAttachment;
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
      ? messageSummary(referenced)
      : "原消息不可用";
    quote.append(author, excerpt);
    return quote;
  }

  function appendMessageContent(container, message, includeChecks) {
    var quote = createReplyQuote(message);
    if (quote) {
      container.appendChild(quote);
    }
    if (message.attachment && !message.recalled) {
      if (message.attachment.kind === "image") {
        var imageButton = document.createElement("button");
        imageButton.className = "volo-message-image";
        imageButton.type = "button";
        imageButton.dataset.messageImageId = message.id;
        imageButton.setAttribute("aria-label", "查看图片：" + message.attachment.name);
        var image = document.createElement("img");
        image.src = message.attachment.src;
        image.alt = message.attachment.name;
        image.loading = "lazy";
        imageButton.appendChild(image);
        container.appendChild(imageButton);
      } else {
        var fileLink = document.createElement("a");
        fileLink.className = "volo-message-file";
        fileLink.href = message.attachment.src;
        fileLink.download = message.attachment.name;
        fileLink.setAttribute("aria-label", "下载文件：" + message.attachment.name);
        var fileBadge = document.createElement("span");
        fileBadge.className = "volo-message-file-badge";
        var extension = message.attachment.name.split(".").pop();
        fileBadge.textContent =
          extension && extension !== message.attachment.name
            ? extension.slice(0, 4).toUpperCase()
            : "FILE";
        var fileCopy = document.createElement("span");
        var fileName = document.createElement("strong");
        fileName.textContent = message.attachment.name;
        var fileMeta = document.createElement("small");
        fileMeta.textContent =
          formatBytes(message.attachment.size) + " · 点击下载";
        fileCopy.append(fileName, fileMeta);
        fileLink.append(fileBadge, fileCopy);
        container.appendChild(fileLink);
      }
    }
    if (message.text || message.recalled) {
      if (message.role === "assistant" && !message.recalled) {
        appendMarkdown(container, message.text);
      } else {
        var text = document.createElement("p");
        text.textContent = messageSummary(message);
        container.appendChild(text);
      }
    }
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
    container.appendChild(meta);
  }

  function createReactionTray(message) {
    var entries = Object.keys(message.reactions || {}).filter(function (emoji) {
      return message.reactions[emoji] > 0;
    });
    if (!entries.length || message.recalled) {
      return null;
    }
    var tray = document.createElement("div");
    tray.className = "volo-reaction-tray";
    tray.setAttribute("aria-label", "消息回应");
    entries.forEach(function (emoji) {
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.reactionMessageId = message.id;
      button.dataset.reactionEmoji = emoji;
      button.setAttribute("aria-label", "取消回应 " + emoji);
      button.setAttribute("aria-pressed", "true");
      var icon = document.createElement("span");
      icon.textContent = emoji;
      var count = document.createElement("small");
      count.textContent = String(message.reactions[emoji]);
      button.append(icon, count);
      tray.appendChild(button);
    });
    return tray;
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
    var reactions = createReactionTray(message);
    if (reactions) {
      row.appendChild(reactions);
    }
    return row;
  }

  function createAssistantMessage(message) {
    var row = document.createElement("article");
    row.className = "volo-message volo-message-assistant";
    row.dataset.messageId = message.id;
    var body = document.createElement("div");
    body.className = "volo-assistant-body";
    appendMessageContent(body, message, false);
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
    row.appendChild(body);
    var reactions = createReactionTray(message);
    if (reactions) {
      row.appendChild(reactions);
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

  function closeActionPanel() {
    actionPanel.classList.remove("is-open");
    actionPanel.hidden = true;
    document.body.classList.remove("volo-actions-open");
    attachButton.setAttribute("aria-expanded", "false");
    emojiPanel.hidden = true;
    emojiButton.setAttribute("aria-expanded", "false");
  }

  function toggleActionPanel() {
    var willOpen = actionPanel.hidden;
    if (willOpen) {
      actionPanel.hidden = false;
      attachButton.setAttribute("aria-expanded", "true");
      document.body.classList.add("volo-actions-open");
      requestAnimationFrame(function () {
        actionPanel.classList.add("is-open");
      });
    } else {
      actionPanel.classList.remove("is-open");
      closeActionPanel();
    }
  }

  function beginReply(messageId) {
    var message = findMessage(messageId);
    if (!message || message.recalled) {
      return;
    }
    activeReplyId = message.id;
    replyAuthor.textContent = message.role === "user" ? "回复自己" : "回复 Volo";
    replyText.textContent = messageSummary(message).replace(/\s+/g, " ");
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
    messageMenu
      .querySelectorAll("[data-message-reaction]")
      .forEach(function (button) {
        var active = Boolean(message.reactions && message.reactions[button.dataset.messageReaction]);
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
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
    saveMessages();
    updateSidebarPreview(
      message.role === "user" ? "你撤回了一条消息" : "Volo 撤回了一条消息",
      message.time
    );
    emitClawd("happy", "消息已撤回", {
      duration: 900,
      priority: 2
    });
  }

  function toggleReaction(messageId, emoji) {
    var message = findMessage(messageId);
    if (!message || message.recalled || !emoji) {
      return;
    }
    message.reactions = message.reactions || {};
    if (message.reactions[emoji]) {
      delete message.reactions[emoji];
    } else {
      message.reactions[emoji] = 1;
    }
    closeMessageMenu();
    renderMessages(false);
    saveMessages();
    emitClawd("happy", message.reactions[emoji] ? emoji : "已取消回应", {
      duration: 900,
      priority: 2
    });
  }

  function fallbackCopy(text) {
    var field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    var copied = document.execCommand("copy");
    field.remove();
    return copied;
  }

  function copyMessage(messageId) {
    var message = findMessage(messageId);
    if (!message || message.recalled) {
      return;
    }
    var text = message.text || messageSummary(message);
    var task =
      navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(text).then(function () { return true; })
        : Promise.resolve(fallbackCopy(text));
    task
      .then(function (copied) {
        showToast(copied ? "消息已复制" : "复制失败，请再试一次");
      })
      .catch(function () {
        showToast(fallbackCopy(text) ? "消息已复制" : "复制失败，请再试一次");
      });
    closeMessageMenu();
  }

  function copyMarkdownCode(button) {
    var shell = button.closest(".volo-markdown-code");
    var code = shell && shell.querySelector("pre code");
    if (!code) {
      return;
    }
    var value = code.textContent;
    var task =
      navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(value).then(function () { return true; })
        : Promise.resolve(fallbackCopy(value));
    task
      .then(function (copied) {
        showToast(copied ? "代码已复制" : "复制失败，请再试一次");
      })
      .catch(function () {
        showToast(fallbackCopy(value) ? "代码已复制" : "复制失败，请再试一次");
      });
  }

  function openImage(messageId) {
    var message = findMessage(messageId);
    if (
      !message ||
      !message.attachment ||
      message.attachment.kind !== "image" ||
      message.recalled
    ) {
      return;
    }
    imageLightboxImage.src = message.attachment.src;
    imageLightboxImage.alt = message.attachment.name;
    if (typeof imageLightbox.showModal === "function") {
      imageLightbox.showModal();
    } else {
      imageLightbox.setAttribute("open", "");
    }
  }

  function closeImage() {
    if (imageLightbox.open && typeof imageLightbox.close === "function") {
      imageLightbox.close();
    } else {
      imageLightbox.removeAttribute("open");
    }
    imageLightboxImage.removeAttribute("src");
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
    setPendingAttachment(null);
    closeActionPanel();
    resizeInput();
    renderMessages(false);
    saveMessages(true);
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
        replyTo: "",
        reactions: {},
        attachment: null
      });
      renderMessages(document.body.dataset.chatView === "volo");
      saveMessages();
      updateSidebarPreview(markdownPlainText(reply.text), time);
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
    if (!value && !pendingAttachment) {
      return;
    }
    var time = formatTime(new Date());
    var attachment = pendingAttachment;
    messages.push({
      id: nextMessageId(),
      role: "user",
      text: value,
      time: time,
      recalled: false,
      replyTo: activeReplyId,
      reactions: {},
      attachment: attachment
    });
    input.value = "";
    setPendingAttachment(null);
    closeActionPanel();
    clearReply();
    resizeInput();
    renderMessages(true);
    saveMessages();
    updateSidebarPreview(value || "[图片] " + attachment.name, time);
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

  attachButton.addEventListener("click", function () {
    toggleActionPanel();
  });

  actionClose.addEventListener("click", closeActionPanel);

  actionPanel.addEventListener("click", function (event) {
    var action = event.target.closest("[data-volo-action]");
    if (!action) {
      return;
    }
    if (action.dataset.voloAction === "image") {
      closeActionPanel();
      attachmentInput.click();
    } else if (action.dataset.voloAction === "file") {
      closeActionPanel();
      fileInput.click();
    } else if (action.dataset.voloAction === "together") {
      closeActionPanel();
      togetherButton.click();
    }
  });

  attachmentInput.addEventListener("change", function () {
    var file = attachmentInput.files && attachmentInput.files[0];
    attachmentInput.value = "";
    if (!file) {
      return;
    }
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
      showToast("请选择 JPG、PNG、WebP 或 GIF 图片");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast("图片不能超过 5 MB");
      return;
    }
    attachButton.disabled = true;
    showToast("正在处理图片…");
    prepareImage(file)
      .then(function (attachment) {
        setPendingAttachment(attachment);
        showToast("图片已添加");
        input.focus();
      })
      .catch(function () {
        showToast("图片没有读取成功，请换一张试试");
      })
      .finally(function () {
        attachButton.disabled = false;
      });
  });

  fileInput.addEventListener("change", function () {
    var file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) {
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showToast("本地原型暂时支持 2 MB 以内的文件");
      return;
    }
    attachButton.disabled = true;
    showToast("正在读取文件…");
    prepareFile(file)
      .then(function (attachment) {
        setPendingAttachment(attachment);
        showToast("文件已添加");
        input.focus();
      })
      .catch(function () {
        showToast("文件没有读取成功，请换一个试试");
      })
      .finally(function () {
        attachButton.disabled = false;
      });
  });

  attachmentCancel.addEventListener("click", function () {
    setPendingAttachment(null);
    input.focus();
  });

  imageLightboxClose.addEventListener("click", closeImage);
  imageLightbox.addEventListener("click", function (event) {
    if (event.target === imageLightbox) {
      closeImage();
    }
  });
  imageLightbox.addEventListener("cancel", function (event) {
    event.preventDefault();
    closeImage();
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
    closeActionPanel();
    resizeInput();
    input.focus();
  });

  messageMenu.addEventListener("click", function (event) {
    var reaction = event.target.closest("[data-message-reaction]");
    if (reaction && selectedMessageId) {
      toggleReaction(selectedMessageId, reaction.dataset.messageReaction);
      return;
    }
    var action = event.target.closest("[data-message-action]");
    if (!action || !selectedMessageId) {
      return;
    }
    if (action.dataset.messageAction === "reply") {
      beginReply(selectedMessageId);
    } else if (action.dataset.messageAction === "copy") {
      copyMessage(selectedMessageId);
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
    if (
      !row ||
      event.pointerType === "mouse" ||
      event.target.closest("button, a")
    ) {
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
    var codeCopy = event.target.closest("[data-markdown-copy]");
    if (codeCopy) {
      copyMarkdownCode(codeCopy);
      return;
    }
    var reaction = event.target.closest("[data-reaction-message-id]");
    if (reaction) {
      toggleReaction(
        reaction.dataset.reactionMessageId,
        reaction.dataset.reactionEmoji
      );
      return;
    }
    var image = event.target.closest("[data-message-image-id]");
    if (image) {
      openImage(image.dataset.messageImageId);
      return;
    }
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
      saveMessages(true);
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
      !actionPanel.hidden &&
      !actionPanel.contains(event.target) &&
      !attachButton.contains(event.target)
    ) {
      closeActionPanel();
    }
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
    if (event.key === "Escape" && imageLightbox.open) {
      closeImage();
      return;
    }
    if (event.key === "Escape" && !actionPanel.hidden) {
      closeActionPanel();
      attachButton.focus();
      return;
    }
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

  messages = loadMessages();
  replyIndex = messages.filter(function (message) {
    return message.role === "assistant";
  }).length;
  resizeInput();
  renderMessages(false);
  if (messages.length) {
    var latest = messages[messages.length - 1];
    updateSidebarPreview(messageSummary(latest), latest.time);
  }
})();
