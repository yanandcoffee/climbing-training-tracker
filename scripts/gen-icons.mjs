// Generates maskable PNG app icons without any image dependencies.
// Draws a dark rounded-square background with a cyan route line and two orange holds.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  // pixels: Uint8Array RGBA length size*size*4
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy
      ? pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
      : Buffer.from(pixels.subarray(y * stride, y * stride + stride)).copy(
          raw,
          y * (stride + 1) + 1,
        );
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function hex(h) {
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const bg = hex("#0f172a");
  const line = hex("#38bdf8");
  const hold = hex("#f97316");
  const s = size;
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= s || y >= s) return;
    const i = (y * s + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };
  // background fills whole canvas (maskable safe — no transparent corners)
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) set(x, y, bg);

  // route polyline points (relative 0..1), scaled
  const pts = [
    [0.18, 0.72],
    [0.4, 0.34],
    [0.56, 0.6],
    [0.69, 0.4],
    [0.82, 0.72],
  ].map(([x, y]) => [x * s, y * s]);
  const lw = Math.max(2, Math.round(s * 0.06));
  const plot = (x, y, col) => {
    for (let dy = -lw; dy <= lw; dy++)
      for (let dx = -lw; dx <= lw; dx++)
        if (dx * dx + dy * dy <= lw * lw)
          set(Math.round(x + dx), Math.round(y + dy), col);
  };
  for (let p = 0; p < pts.length - 1; p++) {
    const [x0, y0] = pts[p];
    const [x1, y1] = pts[p + 1];
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let t = 0; t <= steps; t++) {
      plot(x0 + ((x1 - x0) * t) / steps, y0 + ((y1 - y0) * t) / steps, line);
    }
  }
  // holds at two peaks
  const hr = Math.max(3, Math.round(s * 0.055));
  for (const [hx, hy] of [pts[1], pts[3]]) {
    for (let dy = -hr; dy <= hr; dy++)
      for (let dx = -hr; dx <= hr; dx++)
        if (dx * dx + dy * dy <= hr * hr)
          set(Math.round(hx + dx), Math.round(hy + dy), hold);
  }
  return px;
}

for (const size of [192, 512]) {
  const png = encodePng(size, draw(size));
  const out = new URL(`../public/icon-${size}.png`, import.meta.url);
  writeFileSync(out, png);
  console.log(`wrote icon-${size}.png (${png.length} bytes)`);
}
