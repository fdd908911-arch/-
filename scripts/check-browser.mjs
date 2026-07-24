#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE_PATH,
    "playwright-core",
    "/home/ubuntu/cyberboss/node_modules/playwright-core"
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      if (candidate === candidates[candidates.length - 1]) throw error;
    }
  }
  throw new Error("playwright-core is unavailable");
}

function browserToken() {
  if (process.env.CCC_TEST_TOKEN) return process.env.CCC_TEST_TOKEN.trim();
  const tokenFile = process.env.CCC_TEST_TOKEN_FILE || "/home/ubuntu/.ots/secret";
  if (existsSync(tokenFile)) return readFileSync(tokenFile, "utf8").trim();
  throw new Error("Set CCC_TEST_TOKEN or CCC_TEST_TOKEN_FILE before running browser checks");
}

const { chromium } = loadPlaywright();
const token = browserToken();
assert(token, "browser access token is empty");
const origin = String(process.env.CCC_TEST_ORIGIN || "https://mcp.canian.top").replace(/\/+$/, "");
const executablePath = process.env.CHROMIUM_PATH ||
  "/home/ubuntu/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome";
assert(existsSync(executablePath), "Chromium executable is unavailable: " + executablePath);

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: process.env.CHROMIUM_USE_PROXY === "1" ? [] : ["--no-proxy-server"]
});

const cases = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  {
    name: "android-chrome",
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2.625,
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
  }
];

try {
  for (const test of cases) {
    const context = await browser.newContext(test);
    try {
      await context.addInitScript(({ token, origin, legacy }) => {
        localStorage.setItem("island-chat.ccc-connection.v1", JSON.stringify({
          baseUrl: legacy ? origin : origin + "/hui-api",
          token
        }));
      }, { token, origin, legacy: test.name === "android-chrome" });
      const page = await context.newPage();
      const errors = [];
      const failedResponses = [];
      const apiResponses = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        const path = new URL(response.url()).pathname;
        if (response.status() >= 400) failedResponses.push(response.status() + " " + path);
        if (response.status() < 400 && path.startsWith("/hui-api/")) apiResponses.push(path);
      });

      await page.goto(origin + "/hui-v40/chat.html#volo", { waitUntil: "networkidle" });
      await page.waitForFunction(() => [
        "VoloCarrier", "VoloChat", "VoloComposer", "VoloDrawer", "VoloMediaStatus",
        "VoloMusic", "VoloSessions", "VoloUsage", "VoloVoice"
      ].every((name) => Boolean(window[name])));
      await page.waitForFunction(() => document.querySelectorAll(".volo-session-row").length > 0);
      await page.waitForTimeout(400);

      if (await page.evaluate(() => document.getElementById("voloDrawerButton").getAttribute("aria-expanded") === "true")) {
        await page.evaluate(() => document.getElementById("voloDrawerButton").click());
        await page.waitForFunction(() => !document.getElementById("voloDrawer").classList.contains("is-open"));
      }
      await page.evaluate(() => document.getElementById("voloDrawerButton").click());
      await page.waitForFunction(() => document.getElementById("voloDrawer").classList.contains("is-open"));
      const drawerOpen = await page.evaluate(() => ({
        expanded: document.getElementById("voloDrawerButton").getAttribute("aria-expanded"),
        inert: document.getElementById("voloDrawer").hasAttribute("inert")
      }));
      await page.evaluate(() => document.getElementById("voloDrawerClose").click());
      await page.waitForFunction(() => !document.getElementById("voloDrawer").classList.contains("is-open"));
      assert.deepEqual(drawerOpen, { expanded: "true", inert: false }, test.name + ": drawer state failed");

      await page.evaluate(() => document.getElementById("voloTopNewChatButton").click());
      await page.waitForFunction(() => document.getElementById("sessionCreateDialog").open);
      const createDialogFocused = await page.evaluate(() => {
        const focused = document.activeElement === document.getElementById("sessionTitleInput");
        document.getElementById("sessionCreateDialog").close();
        return focused;
      });
      assert(createDialogFocused, test.name + ": create-session dialog failed");

      await page.evaluate(() => {
        document.querySelector("[data-session-action]")
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await page.waitForFunction(() => document.getElementById("sessionActionDialog").open);
      const actionDialog = await page.evaluate(() => {
        const result = {
          title: document.getElementById("sessionActionDialogTitle").textContent.trim(),
          action: document.getElementById("sessionCloseButton").textContent.trim()
        };
        document.getElementById("sessionActionDialog").close();
        return result;
      });
      assert(actionDialog.title, test.name + ": session action title missing");
      assert(["启动窗口", "停止窗口"].includes(actionDialog.action), test.name + ": session action invalid");

      let switchTarget = await page.evaluate(() => {
        const target = [...document.querySelectorAll("[data-session]")]
          .find((item) => item.getAttribute("aria-current") !== "page");
        target.click();
        return target.dataset.session;
      });
      await page.waitForFunction(
        (target) => document.querySelector('[data-session="' + CSS.escape(target) + '"]')
          .getAttribute("aria-current") === "page",
        switchTarget
      );
      await page.waitForTimeout(400);

      const hasThinkingSession = await page.evaluate(() => Boolean(
        document.querySelector("[data-session=\"cc-test3\"]")
      ));
      assert(hasThinkingSession, test.name + ": cc-test3 session missing");
      if (switchTarget !== "cc-test3") {
        await page.evaluate(() => document.querySelector("[data-session=\"cc-test3\"]").click());
        await page.waitForFunction(() =>
          document.querySelector("[data-session=\"cc-test3\"]").getAttribute("aria-current") === "page"
        );
        switchTarget = "cc-test3";
      }
      await page.waitForFunction(() => document.querySelectorAll(".volo-thought-toggle").length > 0);
      const thoughtProbe = await page.evaluate(() => {
        const toggles = [...document.querySelectorAll(".volo-thought-toggle")];
        const toggle = toggles[0];
        toggle.click();
        const panel = toggle.nextElementSibling;
        return {
          count: toggles.length,
          label: toggle.textContent.trim(),
          expanded: toggle.getAttribute("aria-expanded"),
          panelHidden: panel.hidden,
          textChars: panel.textContent.trim().length
        };
      });
      assert(thoughtProbe.count > 0, test.name + ": thinking cards missing");
      assert.match(thoughtProbe.label, /Volo 在想/, test.name + ": thinking card label missing");
      assert.equal(thoughtProbe.expanded, "true", test.name + ": thinking card did not expand");
      assert.equal(thoughtProbe.panelHidden, false, test.name + ": thinking panel stayed hidden");
      assert(thoughtProbe.textChars > 0, test.name + ": thinking text missing");

      const probes = await page.evaluate(() => {
        const music = window.VoloMusic.create({
          sendMessage: async () => true,
          emitClawd() {},
          getSelectedSession: () => "probe",
          isVoiceBusy: () => false,
          isSending: () => false
        });
        const parsedMusic = music.contentForMessage({ text: "晚安 [music:16:Moon:Volo::给你]" });
        const chat = window.VoloChat.create({
          emitClawd() {},
          getSelectedSession: () => "probe",
          getSessionCount: () => 1,
          music,
          renderSessions() {},
          setConnectionState() {}
        });
        const merged = chat.mergeMessages(
          [
            { ts: "2026-07-21T00:00:02Z", role: "user", text: "第二条" },
            { ts: "2026-07-21T00:00:01Z", role: "assistant", text: "第一条", version: 1 }
          ],
          [
            { ts: "2026-07-21T00:00:01Z", role: "assistant", text: "第一条", version: 2 },
            { ts: "2026-07-21T00:00:03Z", role: "system", text: "忽略" }
          ]
        );

        var composerSession = "probe-a";
        const composer = window.VoloComposer.create({
          emitClawd() {},
          getSelectedSession: () => composerSession,
          isSending: () => false,
          onSubmit() {}
        });
        composer.bind();
        const input = document.getElementById("voloInput");
        composer.selectSession("probe-a");
        input.value = "第一份草稿";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        composerSession = "probe-b";
        composer.selectSession("probe-b");
        input.value = "第二份草稿";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        composerSession = "probe-a";
        composer.selectSession("probe-a");
        const firstDraft = input.value;
        const attempt = composer.prepareSend();
        input.value = "后来补的";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        composerSession = "probe-b";
        composer.selectSession("probe-b");
        const secondDraft = input.value;
        composer.finishSend(attempt, false);
        composerSession = "probe-a";
        composer.selectSession("probe-a");

        const voice = window.VoloVoice.create({
          sendMessage: async () => true,
          emitClawd() {},
          isMusicBusy: () => false,
          isSending: () => false
        });
        const voiceMessage = voice.formatMessage({
          text: "你好",
          emotion: "平静",
          tone: "温柔",
          baseline_progress: "2/5",
          baseline_ready: false
        });

        var placeholder = "";
        var usageGateway = null;
        const carrier = window.VoloCarrier.create({
          composer: { setPlaceholder(value) { placeholder = value; } },
          usage: { updateCarrier(value) { usageGateway = value; } }
        });
        carrier.update("gateway");
        const gatewayCarrier = {
          label: document.getElementById("voloCarrierPill").textContent,
          placeholder,
          usageGateway
        };
        carrier.update("claude_code");

        window.VoloMediaStatus.set("分析中", "processing", 0, "music");
        const musicOwnsStatus = document.getElementById("voloMusicButton").classList.contains("is-processing") &&
          !document.getElementById("voloVoiceButton").classList.contains("is-processing");
        window.VoloMediaStatus.set("录音中", "recording", 0, "voice");
        const voiceOwnsStatus = document.getElementById("voloVoiceButton").classList.contains("is-recording") &&
          !document.getElementById("voloMusicButton").classList.contains("is-processing");
        const recordingVoiceLabel = document.querySelector(".volo-voice-hold-label").textContent.trim();
        window.VoloMediaStatus.set("正在识别", "processing", 0, "voice");
        const processingVoiceLabel = document.querySelector(".volo-voice-hold-label").textContent.trim();
        window.VoloMediaStatus.set("", "", 0, "");
        const idleVoiceLabel = document.querySelector(".volo-voice-hold-label").textContent.trim();
        const voiceButton = document.getElementById("voloVoiceButton");
        const voiceRect = voiceButton.getBoundingClientRect();

        const stored = JSON.parse(localStorage.getItem("island-chat.ccc-connection.v1"));
        return {
          apiBase: stored.baseUrl,
          merged: merged.map((message) => message.role + ":" + message.text + ":" + (message.version || "")),
          composer: { firstDraft, secondDraft, failedDraft: input.value },
          voiceMessage,
          music: parsedMusic,
          gatewayCarrier,
          musicOwnsStatus,
          voiceOwnsStatus,
          voiceInput: {
            recordingVoiceLabel,
            processingVoiceLabel,
            idleVoiceLabel,
            visible: voiceRect.width > 0 && voiceRect.height > 0,
            width: voiceRect.width
          },
          emojiElements: document.querySelectorAll("#voloEmojiButton, #voloEmojiPanel").length,
          callElements: document.querySelectorAll("#voloVoiceCallButton, #voloCallScreen").length,
          sessions: document.querySelectorAll(".volo-session-row").length,
          selected: document.querySelector('[data-session][aria-current="page"]')?.dataset.session || "",
          bodyWidth: document.body.scrollWidth,
          viewportWidth: innerWidth,
          visibleClaudeCode: document.body.innerText.includes("Claude Code"),
          flowerElements: document.querySelectorAll(".volo-drawer-flower, .volo-current-chat-flower, .volo-flower-button").length
        };
      });

      assert.equal(probes.apiBase, origin + "/hui-api", test.name + ": API base migration failed");
      assert.deepEqual(probes.merged, ["assistant:第一条:2", "user:第二条:"], test.name + ": merge failed");
      assert.deepEqual(probes.composer, {
        firstDraft: "第一份草稿",
        secondDraft: "第二份草稿",
        failedDraft: "第一份草稿\n后来补的"
      }, test.name + ": composer draft lifecycle failed");
      assert.match(probes.voiceMessage, /内容：你好/, test.name + ": voice formatting failed");
      assert.match(probes.voiceMessage, /情绪：平静 · 温柔/, test.name + ": voice emotion failed");
      assert.equal(probes.music.text, "晚安", test.name + ": music text failed");
      assert.equal(probes.music.music.title, "Moon", test.name + ": music marker failed");
      assert.deepEqual(probes.gatewayCarrier, {
        label: "Volo · 陪我聊聊",
        placeholder: "和 Volo 聊聊...",
        usageGateway: true
      }, test.name + ": carrier presentation failed");
      assert(probes.musicOwnsStatus && probes.voiceOwnsStatus, test.name + ": media ownership failed");
      assert.deepEqual(probes.voiceInput, {
        recordingVoiceLabel: "松开发送",
        processingVoiceLabel: "正在识别",
        idleVoiceLabel: "按住说话",
        visible: true,
        width: probes.voiceInput.width
      }, test.name + ": voice input states failed");
      assert(probes.voiceInput.width >= 80, test.name + ": voice input is too narrow");
      assert.equal(probes.emojiElements, 0, test.name + ": emoji controls are still rendered");
      assert.equal(probes.callElements, 0, test.name + ": call preview is still rendered");
      assert(probes.sessions > 0 && probes.selected === switchTarget, test.name + ": session switch failed");
      assert(probes.bodyWidth <= probes.viewportWidth + 1, test.name + ": chat horizontal overflow");
      assert.equal(probes.visibleClaudeCode, false, test.name + ": Claude Code label is still visible");
      assert.equal(probes.flowerElements, 0, test.name + ": flower decoration is still rendered");
      assert(apiResponses.includes("/hui-api/chat/history"), test.name + ": history was not loaded");
      assert(apiResponses.includes("/hui-api/chat/poll"), test.name + ": polling did not start");
      assert(apiResponses.includes("/hui-api/v1/thinking"), test.name + ": thinking history was not loaded");

      await page.evaluate(() => document.getElementById("voloSettingsButton").click());
      await page.waitForFunction(() => !document.getElementById("voloSettingsSheet").hidden);
      const terminalSettingsLabel = await page.evaluate(() =>
        document.getElementById("voloTerminalLink").textContent.replace(/\s+/g, " ").trim()
      );
      await page.evaluate(() => document.getElementById("voloTerminalLink").click());
      await page.waitForFunction(() => document.body.dataset.chatView === "terminal");
      await page.waitForFunction(() => document.getElementById("terminalSessionSelect").options.length > 0);
      await page.waitForFunction(() => document.getElementById("terminalConnectionState").classList.contains("online"));
      const terminalProbe = await page.evaluate(() => {
        const terminal = document.getElementById("terminalView");
        const composer = document.getElementById("terminalComposer");
        return {
          options: document.getElementById("terminalSessionSelect").options.length,
          selected: document.getElementById("terminalSessionSelect").value,
          state: document.getElementById("terminalConnectionState").textContent.trim(),
          outputChars: document.getElementById("terminalOutput").textContent.length,
          keyButtons: document.querySelectorAll("[data-terminal-key]").length,
          composerVisible: composer.getBoundingClientRect().height > 0,
          viewVisible: !terminal.hidden,
          settingsHidden: document.getElementById("voloSettingsSheet").hidden,
          bodyWidth: document.body.scrollWidth,
          viewportWidth: innerWidth
        };
      });
      assert.match(terminalSettingsLabel, /终端.*打开/, test.name + ": terminal settings entry missing");
      assert(terminalProbe.options > 0 && terminalProbe.selected, test.name + ": terminal sessions missing");
      assert.match(terminalProbe.state, /在线/, test.name + ": terminal did not connect");
      assert(terminalProbe.outputChars > 0, test.name + ": terminal output missing");
      assert.equal(terminalProbe.keyButtons, 6, test.name + ": terminal key row incomplete");
      assert(terminalProbe.composerVisible && terminalProbe.viewVisible, test.name + ": terminal controls hidden");
      assert.equal(terminalProbe.settingsHidden, true, test.name + ": settings stayed open over terminal");
      assert(terminalProbe.bodyWidth <= terminalProbe.viewportWidth + 1, test.name + ": terminal horizontal overflow");
      assert(apiResponses.includes("/hui-api/tmux/capture"), test.name + ": terminal output was not loaded");

      await page.goto(origin + "/hui-v40/volo-status.html", { waitUntil: "networkidle" });
      await page.waitForFunction(() => {
        const dashboard = document.getElementById("drivesDashboard");
        return dashboard && !dashboard.classList.contains("is-loading");
      });
      const status = await page.evaluate(() => ({
        dimensions: document.querySelectorAll("#drivesDimensions .drives-dim-row").length,
        empty: document.querySelector("#drivesDimensions .drives-empty")?.textContent.trim() || "",
        bodyWidth: document.body.scrollWidth,
        viewportWidth: innerWidth
      }));
      assert(
        status.dimensions === 16 || (status.dimensions === 0 && status.empty === "等待下一次状态快照。"),
        test.name + ": Drivesoid state failed"
      );
      assert(status.bodyWidth <= status.viewportWidth + 1, test.name + ": status horizontal overflow");
      assert.deepEqual(errors, [], test.name + ": browser errors: " + errors.join(" | "));
      assert.deepEqual(failedResponses, [], test.name + ": failed responses: " + failedResponses.join(" | "));

      const workerCache = await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        return (await caches.keys()).find((key) => key.includes("v83-terminal-route")) || "";
      });
      assert(workerCache, test.name + ": service-worker cache missing");
      process.stderr.write("Browser check passed: " + JSON.stringify({
        case: test.name,
        sessions: probes.sessions,
        thoughtCards: thoughtProbe.count,
        terminalSessions: terminalProbe.options,
        drivesDimensions: status.dimensions,
        workerCache,
        errors: errors.length,
        failedResponses: failedResponses.length
      }) + "\n");
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
