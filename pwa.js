(function initializePwa() {
  "use strict";

  if (!("serviceWorker" in navigator)) return;

  let installPrompt = null;
  let refreshing = false;
  const installButton = document.getElementById("pwaInstallButton");

  function setInstallButtonVisible(visible) {
    if (installButton) installButton.hidden = !visible;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    setInstallButtonVisible(true);
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    setInstallButtonVisible(false);
  });

  if (installButton) {
    installButton.addEventListener("click", async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      setInstallButtonVisible(false);
    });
  }

  function showUpdateBanner(worker) {
    if (!worker || document.querySelector(".pwa-update-banner")) return;
    const banner = document.createElement("div");
    banner.className = "pwa-update-banner";
    banner.setAttribute("role", "status");

    const message = document.createElement("strong");
    message.textContent = "新版本已准备好";
    const updateButton = document.createElement("button");
    updateButton.type = "button";
    updateButton.textContent = "更新";
    updateButton.addEventListener("click", () => {
      updateButton.disabled = true;
      worker.postMessage({ type: "SKIP_WAITING" });
    });

    banner.append(message, updateButton);
    document.body.appendChild(banner);
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      // Keep the worker URL stable. updateViaCache ensures the browser still
      // checks the script itself instead of relying on an HTTP cache entry.
      const registration = await navigator.serviceWorker.register("./sw.js", {
        scope: "./",
        updateViaCache: "none"
      });
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(registration.waiting);
      }
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBanner(worker);
          }
        });
      });
      await registration.update();
    } catch (error) {
      console.warn("PWA service worker registration failed", error);
    }
  });
})();

(function bindVoloDrawerFallback() {
  "use strict";
  var drawer = document.getElementById("voloDrawer");
  var button = document.getElementById("voloDrawerButton");
  var close = document.getElementById("voloDrawerClose");
  var scrim = document.getElementById("voloDrawerScrim");
  if (!drawer || !button || !close || !scrim) return;

  function setOpen(open, restoreFocus) {
    drawer.classList.toggle("is-open", open);
    scrim.classList.toggle("is-open", open);
    drawer.style.transform = open ? "translateX(0)" : "";
    scrim.style.pointerEvents = open ? "auto" : "";
    drawer.setAttribute("aria-hidden", String(!open));
    if (open) drawer.removeAttribute("inert");
    else drawer.setAttribute("inert", "");
    button.setAttribute("aria-expanded", String(open));
    if (!open && restoreFocus) button.focus();
  }

  function fallback(element, handler) {
    element.addEventListener("click", function () {
      if (typeof element.onclick === "function") return;
      handler();
    });
  }

  fallback(button, function () { setOpen(button.getAttribute("aria-expanded") !== "true", false); });
  fallback(close, function () { setOpen(false, true); });
  fallback(scrim, function () { setOpen(false, true); });
})();
