(function () {
  "use strict";

  if (window.ClawdPet && window.ClawdPet.ready) {
    return;
  }

  var POSITION_KEY = "island-clawd.position.v2.";
  var ACTION_INDEX_KEY = "island-clawd.action-index.v1";
  var ASSET_BASE = "assets/clawd-tank/";
  var SLEEP_DELAY = 52000;
  var PRIORITY = {
    idle: 0,
    input: 1,
    work: 2,
    event: 3,
    alert: 4,
    click: 5,
    drag: 6,
    system: 7
  };
  var STATES = {
    idle: { file: "idle.svg", label: "生活待机", duration: 0 },
    happy: { file: "happy.svg", label: "开心跳跃", duration: 2100 },
    sleeping: { file: "sleeping.svg", label: "呼呼睡觉", duration: 0 },
    walking: { file: "walking.svg", label: "横着走路", duration: 2200 },
    disconnected: { file: "disconnected.svg", label: "断开连接", duration: 3200 },
    dizzy: { file: "dizzy.svg", label: "晕头转向", duration: 2900 },
    eureka: { file: "eureka.svg", label: "灵光一现", duration: 3100 },
    goingAway: { file: "going-away.svg", label: "挥手离开", duration: 2600 },
    grooving: { file: "grooving.svg", label: "开心跳舞", duration: 3200 },
    hatMishap: { file: "hat-mishap.svg", label: "帽子事故", duration: 3600 },
    lowBattery: { file: "low-battery.svg", label: "低电量", duration: 3600 },
    miniClawd: { file: "mini-clawd.svg", label: "迷你螃蟹", duration: 2800 },
    notification: { file: "notification.svg", label: "收到通知", duration: 1900 },
    static: { file: "static.svg", label: "安静站好", duration: 2300 },
    wake: { file: "wake.svg", label: "醒来啦", duration: 2500 },
    beacon: { file: "beacon.svg", label: "连接信号", duration: 2300 },
    builder: { file: "builder.svg", label: "准备建造", duration: 3000 },
    building: { file: "building.svg", label: "努力建造", duration: 3200 },
    carrying: { file: "carrying.svg", label: "搬运东西", duration: 2900 },
    conducting: { file: "conducting.svg", label: "指挥全场", duration: 3000 },
    confused: { file: "confused.svg", label: "有点困惑", duration: 3000 },
    debugger: { file: "debugger.svg", label: "认真调试", duration: 2800 },
    juggling: { file: "juggling.svg", label: "花式杂耍", duration: 3100 },
    overheated: { file: "overheated.svg", label: "忙到过热", duration: 3200 },
    pushing: { file: "pushing.svg", label: "使劲推动", duration: 2800 },
    sweeping: { file: "sweeping.svg", label: "认真打扫", duration: 3000 },
    thinking: { file: "thinking.svg", label: "正在思考", duration: 2600 },
    typing: { file: "typing.svg", label: "敲字中", duration: 2200 },
    wizard: { file: "wizard.svg", label: "施展魔法", duration: 3100 },
    miniTyping: { file: "mini-typing.svg", label: "迷你打字", duration: 2500 }
  };
  var CLICK_ACTIONS = [
    "happy",
    "eureka",
    "grooving",
    "hatMishap",
    "juggling",
    "dizzy",
    "wake",
    "notification",
    "typing",
    "thinking",
    "debugger",
    "builder",
    "building",
    "carrying",
    "conducting",
    "confused",
    "beacon",
    "pushing",
    "sweeping",
    "wizard",
    "overheated",
    "lowBattery",
    "miniClawd",
    "miniTyping",
    "disconnected",
    "goingAway",
    "walking",
    "sleeping",
    "static",
    "idle"
  ];

  var pageKey = document.body.classList.contains("diary-page")
    ? "diary"
    : document.body.classList.contains("memory-page")
      ? "memory"
      : document.body.classList.contains("home-page")
        ? "home"
        : "chat";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stateTimer = 0;
  var sleepTimer = 0;
  var bubbleTimer = 0;
  var actionToken = 0;
  var currentPriority = PRIORITY.idle;
  var lockedUntil = 0;
  var pendingAction = null;
  var drag = null;
  var sidebarObserver = null;
  var actionIndex = readActionIndex();

  var root = document.createElement("div");
  root.className = "clawd-pet-root";
  root.dataset.state = reduceMotion ? "static" : "idle";
  root.dataset.action = "idle";

  var bubble = document.createElement("div");
  bubble.className = "clawd-pet-bubble";
  bubble.setAttribute("role", "status");
  bubble.setAttribute("aria-live", "polite");
  bubble.setAttribute("aria-atomic", "true");

  var button = document.createElement("button");
  button.className = "clawd-pet-button";
  button.type = "button";
  button.setAttribute("aria-label", "Clawd 像素螃蟹。点击切换动作，拖动或用方向键移动");
  button.title = "点击看下一个动作，拖动我可以换位置";

  var art = document.createElement("img");
  art.className = "clawd-pet-art";
  art.src = ASSET_BASE + STATES[reduceMotion ? "static" : "idle"].file;
  art.alt = "";
  art.draggable = false;
  art.width = 176;
  art.height = 176;

  button.appendChild(art);
  root.appendChild(bubble);
  root.appendChild(button);
  document.body.appendChild(root);

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function readActionIndex() {
    try {
      var stored = Number(sessionStorage.getItem(ACTION_INDEX_KEY));
      return Number.isFinite(stored) && stored >= 0 ? stored : 0;
    } catch (error) {
      return 0;
    }
  }

  function saveActionIndex() {
    try {
      sessionStorage.setItem(ACTION_INDEX_KEY, String(actionIndex));
    } catch (error) {
      // The action carousel still works without session storage.
    }
  }

  function readPosition() {
    try {
      var stored = JSON.parse(localStorage.getItem(POSITION_KEY + pageKey));
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
        return {
          x: clamp(stored.x, 0, 1),
          y: clamp(stored.y, 0, 1)
        };
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function writePosition(position) {
    try {
      localStorage.setItem(POSITION_KEY + pageKey, JSON.stringify(position));
    } catch (error) {
      // The pet still works when local storage is unavailable.
    }
  }

  function syncBubbleEdge() {
    var rect = root.getBoundingClientRect();
    root.classList.toggle("is-near-left", rect.left < 90);
    root.classList.toggle("is-near-right", window.innerWidth - rect.right < 90);
  }

  function placeAt(left, top) {
    var width = root.offsetWidth;
    var height = root.offsetHeight;
    var safeLeft = clamp(left, 6, window.innerWidth - width - 6);
    var safeTop = clamp(top, 6, window.innerHeight - height - 6);

    root.style.right = "auto";
    root.style.bottom = "auto";
    root.style.left = safeLeft + "px";
    root.style.top = safeTop + "px";
    syncBubbleEdge();
  }

  function restorePosition() {
    var position = readPosition();
    if (!position) {
      syncBubbleEdge();
      return;
    }

    var horizontalSpan = Math.max(0, window.innerWidth - root.offsetWidth - 12);
    var verticalSpan = Math.max(0, window.innerHeight - root.offsetHeight - 12);
    placeAt(6 + position.x * horizontalSpan, 6 + position.y * verticalSpan);
  }

  function saveCurrentPosition() {
    var rect = root.getBoundingClientRect();
    var horizontalSpan = Math.max(1, window.innerWidth - rect.width - 12);
    var verticalSpan = Math.max(1, window.innerHeight - rect.height - 12);
    writePosition({
      x: clamp((rect.left - 6) / horizontalSpan, 0, 1),
      y: clamp((rect.top - 6) / verticalSpan, 0, 1)
    });
  }

  function speak(message, duration) {
    if (!message) {
      return;
    }
    window.clearTimeout(bubbleTimer);
    bubble.textContent = message;
    root.classList.add("is-speaking");
    bubbleTimer = window.setTimeout(function () {
      root.classList.remove("is-speaking");
    }, duration || 2200);
  }

  function setVisual(name) {
    var visualName = reduceMotion ? "static" : name;
    var entry = STATES[visualName] || STATES.idle;
    if (root.dataset.state !== visualName) {
      art.src = ASSET_BASE + entry.file;
      root.dataset.state = visualName;
    }
    root.dataset.action = name;
  }

  function clearStateTimer() {
    window.clearTimeout(stateTimer);
    stateTimer = 0;
    actionToken += 1;
  }

  function scheduleSleep() {
    window.clearTimeout(sleepTimer);
    if (document.hidden || navigator.onLine === false) {
      return;
    }
    sleepTimer = window.setTimeout(function () {
      play("sleeping", {
        force: true,
        persist: true,
        priority: PRIORITY.idle
      });
    }, SLEEP_DELAY);
  }

  function deriveBaseState() {
    if (navigator.onLine === false) {
      play("disconnected", {
        force: true,
        persist: true,
        priority: PRIORITY.system,
        message: "网络断开啦"
      });
      return;
    }

    var input = document.getElementById("messageInput");
    if (
      input &&
      document.activeElement === input &&
      input.value.trim().length > 0
    ) {
      play("typing", {
        force: true,
        persist: true,
        priority: PRIORITY.input
      });
      return;
    }

    clearStateTimer();
    currentPriority = PRIORITY.idle;
    lockedUntil = 0;
    setVisual("idle");
    scheduleSleep();
  }

  function play(name, options) {
    options = options || {};
    var entry = STATES[name];
    if (!entry) {
      return false;
    }

    var priority =
      typeof options.priority === "number" ? options.priority : PRIORITY.event;
    var now = Date.now();

    if (
      !options.force &&
      ((drag && priority < PRIORITY.drag) ||
        (now < lockedUntil && priority < currentPriority))
    ) {
      if (priority >= PRIORITY.alert) {
        pendingAction = { name: name, options: options };
      }
      return false;
    }

    clearStateTimer();
    window.clearTimeout(sleepTimer);
    currentPriority = priority;
    var duration =
      typeof options.duration === "number" ? options.duration : entry.duration;
    lockedUntil = options.persist
      ? Number.POSITIVE_INFINITY
      : duration > 0
        ? now + duration
        : now;
    setVisual(name);

    if (options.message) {
      speak(options.message, options.messageDuration || duration || 2200);
    }

    if (!options.persist) {
      scheduleSleep();
    }

    if (duration > 0) {
      var token = actionToken;
      stateTimer = window.setTimeout(function () {
        if (token !== actionToken) {
          return;
        }
        if (options.next) {
          var next =
            typeof options.next === "string"
              ? { name: options.next }
              : options.next;
          play(next.name, {
            force: true,
            priority:
              typeof next.priority === "number" ? next.priority : priority,
            duration: next.duration,
            message: next.message,
            next: next.next
          });
          return;
        }
        deriveBaseState();
      }, duration);
    }
    return true;
  }

  function surprise() {
    var poolIndex = actionIndex % CLICK_ACTIONS.length;
    var name = CLICK_ACTIONS[poolIndex];
    var entry = STATES[name];
    actionIndex += 1;
    saveActionIndex();
    play(name, {
      force: true,
      priority: PRIORITY.click,
      duration: entry.duration || 2800,
      message:
        "动作 " +
        String(poolIndex + 1) +
        "/" +
        String(CLICK_ACTIONS.length) +
        " · " +
        entry.label
    });
  }

  function finishPointer(event, cancelled) {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    var wasMoved = drag.moved;
    drag = null;
    root.classList.remove("is-dragging");

    if (button.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }

    if (wasMoved) {
      saveCurrentPosition();
      if (pendingAction) {
        var pending = pendingAction;
        pendingAction = null;
        play(pending.name, Object.assign({}, pending.options, { force: true }));
      } else {
        play("happy", {
          force: true,
          priority: PRIORITY.click,
          duration: 1500,
          message: "就待在这里啦"
        });
      }
    } else if (!cancelled) {
      surprise();
    } else {
      deriveBaseState();
    }
  }

  function syncSidebarState() {
    var sidebar = document.getElementById("sidebar");
    var isCovered =
      sidebar &&
      sidebar.classList.contains("open") &&
      window.matchMedia("(max-width: 760px)").matches;
    root.classList.toggle("is-suspended", Boolean(isCovered));
  }

  function preloadCoreActions() {
    ["wake", "typing", "thinking", "notification", "wizard"].forEach(
      function (name) {
        var image = new Image();
        image.src = ASSET_BASE + STATES[name].file;
      }
    );
  }

  button.addEventListener("pointerdown", function (event) {
    if (!event.isPrimary || (event.button !== 0 && event.pointerType !== "touch")) {
      return;
    }

    var rect = root.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
      stage: "walking"
    };

    button.setPointerCapture(event.pointerId);
    root.classList.add("is-dragging");
    play("walking", {
      force: true,
      persist: true,
      priority: PRIORITY.drag
    });
    event.preventDefault();
  });

  button.addEventListener("pointermove", function (event) {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    var deltaX = event.clientX - drag.startX;
    var deltaY = event.clientY - drag.startY;
    var distance = Math.abs(deltaX) + Math.abs(deltaY);
    if (distance > 6) {
      drag.moved = true;
    }

    if (!drag.moved) {
      return;
    }

    placeAt(drag.left + deltaX, drag.top + deltaY);
    var stage = distance > 190 ? "pushing" : distance > 85 ? "carrying" : "walking";
    if (stage !== drag.stage) {
      drag.stage = stage;
      play(stage, {
        force: true,
        persist: true,
        priority: PRIORITY.drag
      });
    }
  });

  button.addEventListener("pointerup", function (event) {
    finishPointer(event, false);
  });

  button.addEventListener("pointercancel", function (event) {
    finishPointer(event, true);
  });

  button.addEventListener("lostpointercapture", function (event) {
    if (drag && event.pointerId === drag.pointerId) {
      finishPointer(event, true);
    }
  });

  button.addEventListener("click", function (event) {
    if (event.detail === 0) {
      surprise();
    }
  });

  button.addEventListener("keydown", function (event) {
    var offsets = {
      ArrowLeft: [-14, 0],
      ArrowRight: [14, 0],
      ArrowUp: [0, -14],
      ArrowDown: [0, 14]
    };
    if (!offsets[event.key]) {
      return;
    }
    event.preventDefault();
    var rect = root.getBoundingClientRect();
    placeAt(
      rect.left + offsets[event.key][0],
      rect.top + offsets[event.key][1]
    );
    saveCurrentPosition();
    play("walking", {
      force: true,
      priority: PRIORITY.click,
      duration: 650
    });
  });

  document.addEventListener("clawd:action", function (event) {
    var detail = event.detail || {};
    if (!detail.state) {
      return;
    }
    play(detail.state, {
      priority: detail.priority,
      duration: detail.duration,
      message: detail.phrase || detail.message,
      messageDuration: detail.messageDuration,
      next: detail.next,
      persist: detail.persist,
      force: detail.force
    });
  });

  window.addEventListener("offline", function () {
    play("disconnected", {
      force: true,
      persist: true,
      priority: PRIORITY.system,
      message: "网络断开啦"
    });
  });

  window.addEventListener("online", function () {
    play("beacon", {
      force: true,
      priority: PRIORITY.system,
      duration: 1800,
      message: "重新连上啦",
      next: { name: "wake", duration: 1800, priority: PRIORITY.idle }
    });
  });

  window.addEventListener("resize", function () {
    var active = document.activeElement;
    if (
      active &&
      active.matches &&
      active.matches("input, textarea, select, [contenteditable='true']")
    ) {
      return;
    }
    if (root.style.left) {
      restorePosition();
    } else {
      syncBubbleEdge();
    }
    syncSidebarState();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      window.clearTimeout(stateTimer);
      window.clearTimeout(sleepTimer);
      window.clearTimeout(bubbleTimer);
      if (drag) {
        drag = null;
        root.classList.remove("is-dragging");
      }
      return;
    }
    play("wake", {
      force: true,
      priority: PRIORITY.idle,
      duration: 1800,
      message: "我回来啦"
    });
  });

  var sidebar = document.getElementById("sidebar");
  if (sidebar) {
    sidebarObserver = new MutationObserver(syncSidebarState);
    sidebarObserver.observe(sidebar, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  if (typeof navigator.getBattery === "function") {
    navigator
      .getBattery()
      .then(function (battery) {
        function syncBattery() {
          if (!battery.charging && battery.level < 0.15) {
            play("lowBattery", {
              priority: PRIORITY.alert,
              duration: 4200,
              message: "电量有点低啦"
            });
          }
        }
        battery.addEventListener("levelchange", syncBattery);
        battery.addEventListener("chargingchange", syncBattery);
        syncBattery();
      })
      .catch(function () {
        // Battery information is optional.
      });
  }

  art.addEventListener("error", function () {
    if (!art.src.endsWith("/" + STATES.idle.file)) {
      art.src = ASSET_BASE + STATES.idle.file;
      root.dataset.state = "idle";
    }
  });

  window.ClawdPet = {
    ready: true,
    play: play,
    surprise: surprise,
    idle: deriveBaseState,
    getState: function () {
      return root.dataset.action;
    },
    states: Object.keys(STATES)
  };

  play("wake", {
    force: true,
    priority: PRIORITY.idle,
    duration: 2500,
    message: "30 种动作都到齐啦"
  });

  window.requestAnimationFrame(function () {
    restorePosition();
    syncSidebarState();
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(preloadCoreActions, { timeout: 1800 });
    } else {
      window.setTimeout(preloadCoreActions, 900);
    }
  });
})();

