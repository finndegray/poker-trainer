import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePng, renderChipIcon } from './make-icons';

describe('make-icons', () => {
  it('encodes a valid PNG with the right size', () => {
    const png = encodePng(2, 1, Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]));
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(2);
    expect(png.readUInt32BE(20)).toBe(1);
    const idatStart = png.indexOf(Buffer.from('IDAT')) + 4;
    const idatLength = png.readUInt32BE(idatStart - 8);
    const raw = inflateSync(png.subarray(idatStart, idatStart + idatLength));
    expect([...raw]).toEqual([0, 255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it('renders a felt background and a gold centre', () => {
    const size = 64;
    const px = renderChipIcon(size);
    expect(px).toHaveLength(size * size * 4);
    expect([...px.subarray(0, 4)]).toEqual([0x0e, 0x4d, 0x2e, 255]);
    const c = ((size / 2) * size + size / 2) * 4;
    expect([...px.subarray(c, c + 4)]).toEqual([0xe8, 0xc1, 0x5a, 255]);
  });
});
