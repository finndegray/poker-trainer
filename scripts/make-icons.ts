import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

type Rgb = readonly [number, number, number];
const FELT: Rgb = [0x0e, 0x4d, 0x2e];
const GOLD: Rgb = [0xe8, 0xc1, 0x5a];
const CREAM: Rgb = [0xf3, 0xe9, 0xc6];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Colour of a point in unit coordinates (centre 0,0; edge ±1).
function chipColour(x: number, y: number): Rgb {
  const r = Math.hypot(x, y);
  if (r > 0.72) return FELT;
  if (r > 0.56) {
    const angle = Math.atan2(y, x);
    const notch = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 16) % 2 === 0;
    return notch ? CREAM : GOLD;
  }
  if (r > 0.5) return CREAM;
  return GOLD;
}

export function renderChipIcon(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const samples = 4;
  for (let py = 0; py < size; py++) {
    for (let pxX = 0; pxX < size; pxX++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = ((pxX + (sx + 0.5) / samples) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / samples) / size) * 2 - 1;
          const [cr, cg, cb] = chipColour(x, y);
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const n = samples * samples;
      const i = (py * size + pxX) * 4;
      px[i] = Math.round(r / n);
      px[i + 1] = Math.round(g / n);
      px[i + 2] = Math.round(b / n);
      px[i + 3] = 255;
    }
  }
  return px;
}

function main(): void {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
  mkdirSync(outDir, { recursive: true });
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
    writeFileSync(join(outDir, name), encodePng(size, size, renderChipIcon(size)));
    console.log(`public/icons/${name}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
