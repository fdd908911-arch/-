(function () {
  "use strict";

  var STORAGE_KEY = "island-chat.volo-settings.v1";
  var MAX_AVATAR_BYTES = 4 * 1024 * 1024;
  var DEFAULTS = { carrier: "claude", avatar: "" };
  var openButton = document.getElementById("voloSettingsButton");
  var sheet = document.getElementById("voloSettingsSheet");
  var closeButton = document.getElementById("voloSettingsClose");
  var backdrop = document.getElementById("voloSettingsBackdrop");
  var avatarInput = document.getElementById("voloSettingsAvatarInput");
  var settingsAvatar = document.getElementById("voloSettingsAvatar");
  var headerAvatar = document.getElementById("voloHeaderAvatar");
  var carrierBadge = document.getElementById("voloCarrierBadge");
  var backgroundButton = document.getElementById("voloBackgroundButton");
  var newChatButton = document.getElementById("voloTopNewChatButton");
  var input = document.getElementById("voloInput");
  var error = document.getElementById("voloSettingsError");
  var carrierInputs = document.querySelectorAll('input[name="voloCarrier"]');
  var settings = loadSettings();
  var lastFocused = null;

  if (!openButton || !sheet) {
    return;
  }

  function loadSettings() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        carrier: parsed.carrier === "api" ? "api" : DEFAULTS.carrier,
        avatar: typeof parsed.avatar === "string" ? parsed.avatar : DEFAULTS.avatar
      };
    } catch (storageError) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setError("");
    } catch (storageError) {
      setError("设置已经应用，但浏览器空间不足，刷新后可能不会保留。");
    }
  }

  function setError(message) {
    error.textContent = message || "";
    error.hidden = !message;
  }

  function setAvatarSurface(element, dataUrl) {
    if (!element) {
      return;
    }
    element.classList.toggle("has-photo", Boolean(dataUrl));
    if (dataUrl) {
      element.style.backgroundImage = 'url("' + dataUrl.replace(/"/g, "%22") + '")';
    } else {
      element.style.removeProperty("background-image");
    }
  }

  function applyAvatar() {
    setAvatarSurface(settingsAvatar, settings.avatar);
    setAvatarSurface(headerAvatar, settings.avatar);
  }

  function carrierLabel(value) {
    return value === "api" ? "API" : "当前窗口";
  }

  function applyCarrier(shouldNotify) {
    carrierInputs.forEach(function (radio) {
      radio.checked = radio.value === settings.carrier;
    });
    if (carrierBadge) carrierBadge.textContent = carrierLabel(settings.carrier);
    document.body.dataset.voloCarrier = settings.carrier;
    input.placeholder =
      settings.carrier === "api"
        ? "通过 API 发送消息…"
        : "发送到当前窗口…";
    if (shouldNotify) {
      document.dispatchEvent(
        new CustomEvent("volo:carrier-change", {
          detail: { carrier: settings.carrier }
        })
      );
    }
  }

  function openSettings() {
    lastFocused = document.activeElement;
    sheet.hidden = false;
    document.body.classList.add("volo-settings-open");
    closeButton.focus();
  }

  function closeSettings() {
    sheet.hidden = true;
    document.body.classList.remove("volo-settings-open");
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  function handleAvatar() {
    var file = avatarInput.files && avatarInput.files[0];
    if (!file) {
      return;
    }
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
      setError("请选择 JPG、PNG、WebP 或 GIF 图片。");
      avatarInput.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("头像不能超过 4 MB。");
      avatarInput.value = "";
      return;
    }
    var reader = new FileReader();
    reader.addEventListener("load", function () {
      settings.avatar = String(reader.result || "");
      applyAvatar();
      saveSettings();
    });
    reader.addEventListener("error", function () {
      setError("头像没有读取成功，请换一张试试。");
    });
    reader.readAsDataURL(file);
    avatarInput.value = "";
  }

  openButton.addEventListener("click", openSettings);
  closeButton.addEventListener("click", closeSettings);
  backdrop.addEventListener("click", closeSettings);
  avatarInput.addEventListener("change", handleAvatar);

  carrierInputs.forEach(function (radio) {
    radio.addEventListener("change", function () {
      if (!radio.checked) {
        return;
      }
      settings.carrier = radio.value;
      saveSettings();
      applyCarrier(true);
    });
  });

  backgroundButton.addEventListener("click", closeSettings);
  newChatButton.addEventListener("click", closeSettings);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !sheet.hidden) {
      closeSettings();
    }
  });
  document.addEventListener("volo:carrier-selected", function (event) {
    var carrier = event.detail && event.detail.carrier === "api" ? "api" : "claude";
    if (settings.carrier === carrier) {
      applyCarrier(false);
      return;
    }
    settings.carrier = carrier;
    saveSettings();
    applyCarrier(false);
  });

  applyAvatar();
  applyCarrier(false);
})();

