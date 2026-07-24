"use strict";

// Keep the original entry point while using the flower shared by the UI.
require("./generate-flower-icons.js");
process.exit(0);

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const outputDirectory = path.join(__dirname, "..", "assets", "icons");

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function containsPoint(points, x, y) {
  let inside = false;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current, current += 1) {
    const [currentX, currentY] = points[current];
    const [previousX, previousY] = points[previous];
    const crosses = currentY > y !== previousY > y && x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function insideRoundedSquare(x, y, size, maskable) {
  if (maskable) return true;
  const margin = size * 0.03;
  const radius = size * 0.22;
  const left = margin;
  const right = size - margin;
  const top = margin;
  const bottom = size - margin;
  if (x >= left + radius && x <= right - radius && y >= top && y <= bottom) return true;
  if (y >= top + radius && y <= bottom - radius && x >= left && x <= right) return true;
  const centerX = x < left + radius ? left + radius : right - radius;
  const centerY = y < top + radius ? top + radius : bottom - radius;
  return (x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2;
}

function createIcon(size, maskable) {
  const stride = size * 4 + 1;
  const pixels = Buffer.alloc(stride * size);
  const scale = size / 512;
  const plane = [[112, 246], [405, 122], [310, 390], [239, 310], [182, 369], [191, 267], [361, 160], [151, 248]].map(([x, y]) => [x * scale, y * scale]);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = y * stride + 1 + x * 4;
      if (!insideRoundedSquare(x + 0.5, y + 0.5, size, maskable)) continue;
      const isPlane = containsPoint(plane, x + 0.5, y + 0.5);
      pixels[offset] = isPlane ? 255 : 126;
      pixels[offset + 1] = isPlane ? 255 : 164;
      pixels[offset + 2] = isPlane ? 255 : 186;
      pixels[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(pixels, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

fs.mkdirSync(outputDirectory, { recursive: true });
for (const [filename, size, maskable] of [
  ["icon-180.png", 180, false],
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true]
]) {
  fs.writeFileSync(path.join(outputDirectory, filename), createIcon(size, maskable));
}
