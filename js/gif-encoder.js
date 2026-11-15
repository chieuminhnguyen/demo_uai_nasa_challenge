/**
 * COSMIC MOTION ANIMATION — PURE JS GIF89a ENCODER
 * Self-contained animated GIF89a encoder (LZW compression + 15-bit LUT 256-color palette).
 * Captures HTML5 Canvas ImageData frames directly with zero external dependencies.
 */

(function () {
  function buildGlobalPalette() {
    const palette = new Uint8Array(256 * 3);
    let idx = 0;

    // 0..215: Uniform 6x6x6 RGB cube
    const levels = [0, 51, 102, 153, 204, 255];
    for (let r = 0; r < 6; r++) {
      for (let g = 0; g < 6; g++) {
        for (let b = 0; b < 6; b++) {
          palette[idx * 3] = levels[r];
          palette[idx * 3 + 1] = levels[g];
          palette[idx * 3 + 2] = levels[b];
          idx++;
        }
      }
    }

    // 216..239: 24 fine grayscale steps for crisp star cores & dark backgrounds
    for (let i = 0; i < 24; i++) {
      const v = Math.round((i / 23) * 255);
      palette[idx * 3] = v;
      palette[idx * 3 + 1] = v;
      palette[idx * 3 + 2] = v;
      idx++;
    }

    // 240..255: 16 SPHEREx infrared & HUD telemetry accent colors
    const accents = [
      [4, 8, 20],      // Deep space bg
      [10, 18, 36],    // HUD bar bg
      [56, 189, 248],  // Cyan HUD
      [0, 229, 255],   // Bright cyan
      [245, 158, 11],  // Amber warning
      [251, 191, 36],  // Gold text
      [239, 68, 68],   // Red alert
      [34, 197, 94],   // Green verified
      [134, 239, 172], // Mint text
      [186, 230, 253], // Ice blue text
      [255, 123, 84],  // IR orange
      [255, 195, 130], // Warm IR
      [148, 163, 184], // Muted slate
      [226, 232, 240], // Bright slate
      [253, 224, 71],  // Yellow warning
      [125, 211, 252]  // Sky blue
    ];
    for (let i = 0; i < accents.length; i++) {
      palette[idx * 3] = accents[i][0];
      palette[idx * 3 + 1] = accents[i][1];
      palette[idx * 3 + 2] = accents[i][2];
      idx++;
    }

    return palette;
  }

  function buildRgb15Lut(palette) {
    // 32 x 32 x 32 = 32768 entries mapping 5-bit RGB -> nearest palette index
    const lut = new Uint8Array(32768);
    for (let r5 = 0; r5 < 32; r5++) {
      const r = (r5 << 3) | (r5 >> 2);
      for (let g5 = 0; g5 < 32; g5++) {
        const g = (g5 << 3) | (g5 >> 2);
        for (let b5 = 0; b5 < 32; b5++) {
          const b = (b5 << 3) | (b5 >> 2);
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let p = 0; p < 256; p++) {
            const pr = palette[p * 3];
            const pg = palette[p * 3 + 1];
            const pb = palette[p * 3 + 2];
            const dr = r - pr;
            const dg = g - pg;
            const db = b - pb;
            const dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = p;
              if (dist === 0) break;
            }
          }
          lut[(r5 << 10) | (g5 << 5) | b5] = bestIdx;
        }
      }
    }
    return lut;
  }

  let cachedPalette = null;
  let cachedLut = null;

  function ensureTables() {
    if (!cachedPalette) {
      cachedPalette = buildGlobalPalette();
      cachedLut = buildRgb15Lut(cachedPalette);
    }
  }

  function quantizeRgba(rgba, pixelCount) {
    ensureTables();
    const indices = new Uint8Array(pixelCount);
    const lut = cachedLut;
    for (let i = 0; i < pixelCount; i++) {
      const off = i * 4;
      const r5 = rgba[off] >> 3;
      const g5 = rgba[off + 1] >> 3;
      const b5 = rgba[off + 2] >> 3;
      indices[i] = lut[(r5 << 10) | (g5 << 5) | b5];
    }
    return indices;
  }

  function lzwEncode(indices, minCodeSize = 8) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    const maxTableSize = 4096;

    // Int32 hash table for (prefix << 8 | suffix) -> code
    const hashSize = 5003;
    const hashKeys = new Int32Array(hashSize);
    const hashVals = new Int16Array(hashSize);

    function resetTable() {
      hashKeys.fill(-1);
      return {
        nextCode: eoiCode + 1,
        codeBits: minCodeSize + 1,
        maxCodeForBits: (1 << (minCodeSize + 1)) - 1
      };
    }

    const outChunks = [];
    let currentSubBlock = new Uint8Array(256);
    let subLen = 0;

    let bitBuffer = 0;
    let bitCount = 0;

    function pushByte(b) {
      currentSubBlock[++subLen] = b;
      if (subLen === 255) {
        currentSubBlock[0] = 255;
        outChunks.push(currentSubBlock);
        currentSubBlock = new Uint8Array(256);
        subLen = 0;
      }
    }

    function writeBits(code, bits) {
      bitBuffer |= code << bitCount;
      bitCount += bits;
      while (bitCount >= 8) {
        pushByte(bitBuffer & 0xff);
        bitBuffer >>= 8;
        bitCount -= 8;
      }
    }

    let state = resetTable();
    writeBits(clearCode, state.codeBits);

    if (indices.length > 0) {
      let prefix = indices[0];
      for (let i = 1; i < indices.length; i++) {
        const suffix = indices[i];
        const key = (prefix << 8) | suffix;
        let h = ((prefix << 4) ^ suffix) % hashSize;
        if (h < 0) h += hashSize;
        const step = h === 0 ? 1 : hashSize - h;

        let found = -1;
        while (hashKeys[h] !== -1) {
          if (hashKeys[h] === key) {
            found = hashVals[h];
            break;
          }
          h -= step;
          if (h < 0) h += hashSize;
        }

        if (found !== -1) {
          prefix = found;
        } else {
          writeBits(prefix, state.codeBits);

          if (state.nextCode < maxTableSize) {
            hashKeys[h] = key;
            hashVals[h] = state.nextCode;
            if (state.nextCode > state.maxCodeForBits && state.codeBits < 12) {
              state.codeBits++;
              state.maxCodeForBits = (1 << state.codeBits) - 1;
            }
            state.nextCode++;
          } else {
            writeBits(clearCode, state.codeBits);
            state = resetTable();
          }
          prefix = suffix;
        }
      }
      writeBits(prefix, state.codeBits);
    }

    writeBits(eoiCode, state.codeBits);
    if (bitCount > 0) {
      pushByte(bitBuffer & 0xff);
    }
    if (subLen > 0) {
      currentSubBlock[0] = subLen;
      outChunks.push(currentSubBlock.subarray(0, subLen + 1));
    }
    // Block terminator
    outChunks.push(new Uint8Array([0]));
    return outChunks;
  }

  /**
   * Encode an array of { rgba: Uint8ClampedArray, width: number, height: number, delayMs: number }
   * into an animated GIF89a Blob.
   */
  function encodeFrames(frames, options = {}) {
    if (!frames || !frames.length) {
      throw new Error("No frames supplied to GIF encoder.");
    }
    ensureTables();

    const width = frames[0].width;
    const height = frames[0].height;
    const loopCount = options.loop === false ? -1 : 0; // 0 = infinite loop
    const parts = [];

    // 1. GIF89a Header
    parts.push(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));

    // 2. Logical Screen Descriptor (Global Color Table 256 colors)
    parts.push(
      new Uint8Array([
        width & 0xff,
        (width >> 8) & 0xff,
        height & 0xff,
        (height >> 8) & 0xff,
        0xf7, // GCT present, 8-bit color res, 256 colors
        0x00,
        0x00
      ])
    );

    // 3. Global Color Table (768 bytes)
    parts.push(cachedPalette);

    // 4. Netscape 2.0 Loop Extension
    if (loopCount >= 0) {
      parts.push(
        new Uint8Array([
          0x21, 0xff, 0x0b,
          0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
          0x03, 0x01,
          loopCount & 0xff,
          (loopCount >> 8) & 0xff,
          0x00
        ])
      );
    }

    // 5. Image Frames
    for (let f = 0; f < frames.length; f++) {
      const fr = frames[f];
      const delayCs = Math.max(2, Math.round((fr.delayMs || 500) / 10));

      // Graphic Control Extension
      parts.push(
        new Uint8Array([
          0x21, 0xf9, 0x04,
          0x04, // Disposal method 1 (do not dispose)
          delayCs & 0xff,
          (delayCs >> 8) & 0xff,
          0x00,
          0x00
        ])
      );

      // Image Descriptor
      parts.push(
        new Uint8Array([
          0x2c,
          0x00, 0x00, 0x00, 0x00,
          width & 0xff,
          (width >> 8) & 0xff,
          height & 0xff,
          (height >> 8) & 0xff,
          0x00
        ])
      );

      // LZW Min Code Size
      parts.push(new Uint8Array([8]));

      const indices = quantizeRgba(fr.rgba, width * height);
      const lzwChunks = lzwEncode(indices, 8);
      for (let c = 0; c < lzwChunks.length; c++) {
        parts.push(lzwChunks[c]);
      }
    }

    // 6. GIF Trailer
    parts.push(new Uint8Array([0x3b]));

    return new Blob(parts, { type: "image/gif" });
  }

  window.CosmicGifEncoder = {
    encodeFrames
  };
})();
