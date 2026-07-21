"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const projectDirectory = path.join(__dirname, "..");
const outputDirectory = path.join(projectDirectory, "assets", "icons");
const css = fs.readFileSync(path.join(projectDirectory, "chat-views.css"), "utf8");
const match = css.match(/--ysclaude-flower-image:\s*url\("data:image\/png;base64,([^"\)]+)"\)/);

if (!match) {
  throw new Error("Could not find the Volo flower in chat-views.css");
}

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "maneo-flower-icons-"));
const flowerPath = path.join(temporaryDirectory, "volo-flower.png");
fs.writeFileSync(flowerPath, Buffer.from(match[1], "base64"));
fs.mkdirSync(outputDirectory, { recursive: true });

function generateIcon(filename, size, maskable) {
  const flowerSize = Math.round(size * (maskable ? 0.6 : 0.72));
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=0xfaf9f5:s=${size}x${size}`,
      "-i",
      flowerPath,
      "-filter_complex",
      `[1:v]scale=${flowerSize}:${flowerSize}:force_original_aspect_ratio=decrease:flags=lanczos[flower];[0:v][flower]overlay=(W-w)/2:(H-h)/2:format=auto,format=rgba`,
      "-frames:v",
      "1",
      path.join(outputDirectory, filename)
    ],
    { encoding: "utf8" }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed while generating ${filename}: ${result.stderr.trim()}`);
  }
}

try {
  for (const [filename, size, maskable] of [
    ["icon-180.png", 180, false],
    ["icon-192.png", 192, false],
    ["icon-512.png", 512, false],
    ["icon-maskable-512.png", 512, true]
  ]) {
    generateIcon(filename, size, maskable);
  }
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log("Generated PWA icons from the Volo flower.");
