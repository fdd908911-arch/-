(function () {
  "use strict";

  var STORAGE_PREFIX = "island-clawd.position.v1.";
  var ASSET_BASE = "assets/clawd-tank/";
  var STATES = {
    idle: "idle.svg",
    happy: "happy.svg",
    sleeping: "sleeping.svg",
    walking: "walking.svg"
  };
  var PAGE_KEY = document.body.classList.contains("home-page") ? "home" : "chat";
  var stateTimer = 0;
  var sleepTimer = 0;
  var bubbleTimer = 0;
  var drag = null;

  var root = document.createElement("div");
  root.className = "clawd-pet-root";
  root.dataset.state = "idle";

  var bubble = document.createElement("div");
  bubble.className = "clawd-pet-bubble";
  bubble.setAttribute("role", "status");
  bubble.setAttribute("aria-live", "polite");

  var button = document.createElement("button");
  button.className = "clawd-pet-button";
  button.type = "button";
  button.setAttribute("aria-label", "Clawd 像素螃蟹，可拖动，点击互动");
  button.title = "拖动我，或者点我一下";

  var art = document.createElement("img");
  art.className = "clawd-pet-art";
  art.src = ASSET_BASE + STATES.idle;
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

  function readPosition() {
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_PREFIX + PAGE_KEY));
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
      localStorage.setItem(
        STORAGE_PREFIX + PAGE_KEY,
        JSON.stringify(position)
      );
    } catch (error) {
      // The pet still works when local storage is unavailable.
    }
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
  }

  function restorePosition() {
    var position = readPosition();
    if (!position) {
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
    window.clearTimeout(bubbleTimer);
    bubble.textContent = message;
    root.classList.add("is-speaking");
    bubbleTimer = window.setTimeout(function () {
      root.classList.remove("is-speaking");
    }, duration || 2200);
  }

  function scheduleSleep() {
    window.clearTimeout(sleepTimer);
    sleepTimer = window.setTimeout(function () {
      setState("sleeping");
    }, 52000);
  }

  function setState(name, duration) {
    if (!STATES[name]) {
      name = "idle";
    }

    window.clearTimeout(stateTimer);
    root.dataset.state = name;
    art.src = ASSET_BASE + STATES[name];

    if (duration) {
      stateTimer = window.setTimeout(function () {
        setState("idle");
        scheduleSleep();
      }, duration);
    }
  }

  function react() {
    var messages = [
      "我也在这里",
      "今天也陪着你",
      "咔哒！",
      "别戳啦，好痒",
      "一起慢慢写下去"
    ];
    setState("happy", 2100);
    speak(messages[Math.floor(Math.random() * messages.length)], 2100);
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
      moved: false
    };

    button.setPointerCapture(event.pointerId);
    root.classList.add("is-dragging");
    setState("walking");
    window.clearTimeout(sleepTimer);
    event.preventDefault();
  });

  button.addEventListener("pointermove", function (event) {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    var deltaX = event.clientX - drag.startX;
    var deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 6) {
      drag.moved = true;
    }

    if (drag.moved) {
      placeAt(drag.left + deltaX, drag.top + deltaY);
    }
  });

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
      setState("idle");
      speak("就待在这里啦", 1700);
      scheduleSleep();
    } else if (!cancelled) {
      react();
    } else {
      setState("idle");
      scheduleSleep();
    }
  }

  button.addEventListener("pointerup", function (event) {
    finishPointer(event, false);
  });

  button.addEventListener("pointercancel", function (event) {
    finishPointer(event, true);
  });

  button.addEventListener("click", function (event) {
    if (event.detail === 0) {
      react();
    }
  });

  window.addEventListener("resize", function () {
    if (root.style.left) {
      restorePosition();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      window.clearTimeout(sleepTimer);
      return;
    }
    setState("idle");
    scheduleSleep();
  });

  window.requestAnimationFrame(function () {
    restorePosition();
    window.setTimeout(function () {
      speak("我也在这里", 2600);
    }, 500);
  });
  scheduleSleep();
})();

