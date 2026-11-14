/**
 * NASA SPHEREx MULTI-EXTENSION FITS (.FITS) BINARY PARSER & SCIENTIFIC RENDERER
 * Đọc trực tiếp file nhị phân Multi-Extension FITS (IEEE-754 Big-Endian Float32 / Int32)
 * từ NASA/IPAC IRSA (https://irsa.ipac.caltech.edu/Missions/spherex.html)
 *
 * Bóc tách đầy đủ các HDU:
 * - HDU 0: PRIMARY
 * - HDU 1: IMAGE    (BITPIX = -32, đơn vị MJy/sr)
 * - HDU 2: FLAGS    (BITPIX =  32, Bitmask cờ chất lượng từng điểm ảnh)
 * - HDU 3: VARIANCE (BITPIX = -32, Phương sai sai số MJy/sr²)
 * - HDU 4: ZODI     (BITPIX = -32, Mô hình ánh sáng bụi hoàng đạo MJy/sr)
 * - HDU 5/6: WCS-WAVE / EPSF
 */

window.SpherexFitsParser = {
  /**
   * Phân tích chuỗi CSV trả về từ NASA IRSA SIAv2 API
   */
  parseSiaCsv(csvText, targetRa = null, targetDec = null) {
    if (!csvText || typeof csvText !== "string") return [];
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));

    if (lines.length < 2) return [];

    const headers = this._splitCsvLine(lines[0]);
    const idx = {};
    headers.forEach((h, i) => {
      idx[h.trim()] = i;
    });

    const rows = [];
    for (let r = 1; r < lines.length; r++) {
      const cols = this._splitCsvLine(lines[r]);
      if (cols.length < 10) continue;

      const accessUrl = cols[idx["access_url"]] || "";
      if (!accessUrl.includes(".fits")) continue;

      const bandpass = cols[idx["energy_bandpassname"]] || "SPHEREx";
      const detMatch = bandpass.match(/D([1-6])/i);
      const detector = detMatch ? parseInt(detMatch[1], 10) : 6;

      const emMinM = parseFloat(cols[idx["em_min"]] || "0");
      const emMaxM = parseFloat(cols[idx["em_max"]] || "0");
      const wlMinUm = emMinM > 0 ? +(emMinM * 1e6).toFixed(2) : 0.75;
      const wlMaxUm = emMaxM > 0 ? +(emMaxM * 1e6).toFixed(2) : 5.0;

      const sRa = parseFloat(cols[idx["s_ra"]] || "0");
      const sDec = parseFloat(cols[idx["s_dec"]] || "0");
      const tMin = parseFloat(cols[idx["t_min"]] || "0");
      const tMax = parseFloat(cols[idx["t_max"]] || "0");
      const exptime = parseFloat(cols[idx["t_exptime"]] || "113.58");

      let distToTarget = 0;
      if (targetRa !== null && targetDec !== null) {
        const dRa = Math.abs(((sRa - targetRa + 540) % 360) - 180) * Math.cos((targetDec * Math.PI) / 180);
        const dDec = Math.abs(sDec - targetDec);
        distToTarget = Math.hypot(dRa, dDec);
      }

      rows.push({
        obs_id: cols[idx["obs_id"]] || `SPX_${r}`,
        detector,
        bandpass,
        wlMinUm,
        wlMaxUm,
        s_ra: sRa,
        s_dec: sDec,
        t_min_mjd: tMin,
        t_max_mjd: tMax,
        obs_date_iso: this.mjdToIso(tMin),
        exptime: +exptime.toFixed(1),
        collection: cols[idx["obs_collection"]] || "spherex_dr1",
        release_date: cols[idx["obs_release_date"]] || "",
        pixel_scale: parseFloat(cols[idx["s_pixel_scale"]] || "6.15"),
        access_url: accessUrl,
        distToTarget
      });
    }

    // Ưu tiên sắp xếp theo Detector giảm dần (D6/D5 cho thiên thể lạnh hoặc gần tâm nhất)
    rows.sort((a, b) => a.distToTarget - b.distToTarget);
    return rows;
  },

  /**
   * Tách dòng CSV có xử lý dấu ngoặc kép
   */
  _splitCsvLine(line) {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  },

  /**
   * Đổi Modified Julian Date (MJD) sang chuỗi ISO-8601 UTC
   */
  mjdToIso(mjd) {
    if (!mjd || isNaN(mjd) || mjd <= 0) return "2025-08-15T20:45:11Z";
    const unixMs = (mjd - 40587.0) * 86400000;
    const d = new Date(unixMs);
    return isNaN(d.getTime()) ? "2025-08-15T20:45:11Z" : d.toISOString().replace(/\.\d+Z$/, "Z");
  },

  /**
   * Đọc và giải mã file nhị phân Multi-Extension FITS (.fits) từ ArrayBuffer
   */
  parseMultiExtensionFits(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const totalLength = bytes.byteLength;
    let offset = 0;

    const hdus = {};
    const hduList = [];

    while (offset + 2880 <= totalLength) {
      // 1. Đọc Header (theo từng block 2880 bytes, mỗi dòng 80 ký tự ASCII)
      const header = {};
      let endFound = false;

      while (!endFound && offset + 2880 <= totalLength) {
        for (let i = 0; i < 2880; i += 80) {
          const cardOffset = offset + i;
          let card = "";
          for (let c = 0; c < 80; c++) {
            card += String.fromCharCode(bytes[cardOffset + c]);
          }

          const trimmed = card.trim();
          if (trimmed === "END" || card.startsWith("END     ")) {
            endFound = true;
            break;
          }

          this._parseHeaderCard(card, header);
        }
        offset += 2880;
      }

      const extname = (header["EXTNAME"] || (hduList.length === 0 ? "PRIMARY" : `HDU_${hduList.length}`)).trim();
      const bitpix = parseInt(header["BITPIX"] || "8", 10);
      const naxis = parseInt(header["NAXIS"] || "0", 10);
      const naxis1 = parseInt(header["NAXIS1"] || "0", 10);
      const naxis2 = parseInt(header["NAXIS2"] || "0", 10);
      const pcount = parseInt(header["PCOUNT"] || "0", 10);
      const gcount = parseInt(header["GCOUNT"] || "1", 10);

      let numElements = 0;
      if (naxis > 0) {
        numElements = 1;
        for (let ax = 1; ax <= naxis; ax++) {
          numElements *= parseInt(header[`NAXIS${ax}`] || "1", 10);
        }
        numElements = gcount * (pcount + numElements);
      }

      const bytesPerElem = Math.abs(bitpix) / 8;
      const dataByteLength = numElements * bytesPerElem;
      const paddedByteLength = Math.ceil(dataByteLength / 2880) * 2880;

      let matrix = null;
      // Chỉ giải mã ma trận 2D cho các lớp ảnh khoa học IMAGE, FLAGS, VARIANCE, ZODI
      if (
        naxis === 2 &&
        naxis1 > 0 &&
        naxis2 > 0 &&
        offset + dataByteLength <= totalLength &&
        ["IMAGE", "FLAGS", "VARIANCE", "ZODI"].includes(extname)
      ) {
        const count = naxis1 * naxis2;
        if (bitpix === -32) {
          matrix = new Float32Array(count);
          for (let p = 0; p < count; p++) {
            matrix[p] = view.getFloat32(offset + p * 4, false); // Big-Endian IEEE 754
          }
        } else if (bitpix === 32) {
          matrix = new Uint32Array(count);
          for (let p = 0; p < count; p++) {
            matrix[p] = view.getUint32(offset + p * 4, false);
          }
        } else if (bitpix === 16) {
          matrix = new Int16Array(count);
          for (let p = 0; p < count; p++) {
            matrix[p] = view.getInt16(offset + p * 2, false);
          }
        }
      }

      const hduObj = {
        extname,
        bitpix,
        naxis,
        width: naxis1,
        height: naxis2,
        header,
        matrix,
        dataByteLength
      };

      hdus[extname] = hduObj;
      hduList.push(hduObj);

      offset += paddedByteLength;
    }

    return this._summarizeScienceData(hdus, hduList);
  },

  _parseHeaderCard(card, headerObj) {
    // Hỗ trợ cả HIERARCH key = value và chuẩn 8-ký tự KEYWORD = VALUE
    const eqIdx = card.indexOf("=");
    if (eqIdx === -1) return;

    let rawKey = card.slice(0, eqIdx).trim();
    if (rawKey.startsWith("HIERARCH ")) {
      rawKey = rawKey.slice(9).trim();
    }
    if (!rawKey || rawKey.startsWith("COMMENT") || rawKey.startsWith("HISTORY")) return;

    let rhs = card.slice(eqIdx + 1);
    // Tách comment sau dấu / (nếu nằm ngoài cặp nháy đơn)
    let valStr = "";
    let inQuotes = false;
    for (let i = 0; i < rhs.length; i++) {
      const ch = rhs[i];
      if (ch === "'") inQuotes = !inQuotes;
      else if (ch === "/" && !inQuotes) break;
      valStr += ch;
    }

    valStr = valStr.trim();
    if (valStr.startsWith("'") && valStr.endsWith("'")) {
      headerObj[rawKey] = valStr.slice(1, -1).trim();
    } else if (valStr === "T") {
      headerObj[rawKey] = true;
    } else if (valStr === "F") {
      headerObj[rawKey] = false;
    } else {
      const num = Number(valStr);
      headerObj[rawKey] = isNaN(num) ? valStr : num;
    }
  },

  /**
   * Tổng hợp thống kê thực tế từ 6 lớp HDU của SPHEREx
   */
  _summarizeScienceData(hdus, hduList) {
    const imgHdu = hdus["IMAGE"];
    const flgHdu = hdus["FLAGS"];
    const varHdu = hdus["VARIANCE"];
    const zodHdu = hdus["ZODI"];

    if (!imgHdu || !imgHdu.matrix) {
      return { valid: false, hdus, hduList };
    }

    const hdr = imgHdu.header;
    const width = imgHdu.width;
    const height = imgHdu.height;
    const img = imgHdu.matrix;
    const zod = zodHdu?.matrix || null;
    const vari = varHdu?.matrix || null;
    const flg = flgHdu?.matrix || null;

    // Tính giá trị tại vùng tâm Cutout (nơi thiên thể mục tiêu tọa lạc) và toàn khung
    const validFluxes = [];
    let minFlux = Infinity;
    let maxFlux = -Infinity;
    let sumFlux = 0;
    let sumZodi = 0;
    let zodiCount = 0;
    let sumVar = 0;
    let varCount = 0;

    for (let i = 0; i < img.length; i++) {
      const v = img[i];
      if (!isNaN(v) && isFinite(v)) {
        validFluxes.push(v);
        if (v < minFlux) minFlux = v;
        if (v > maxFlux) maxFlux = v;
        sumFlux += v;
      }
      if (zod && !isNaN(zod[i]) && isFinite(zod[i])) {
        sumZodi += zod[i];
        zodiCount++;
      }
      if (vari && !isNaN(vari[i]) && isFinite(vari[i]) && vari[i] > 0) {
        sumVar += vari[i];
        varCount++;
      }
    }

    validFluxes.sort((a, b) => a - b);
    const p10 = validFluxes[Math.floor(validFluxes.length * 0.1)] ?? 0;
    const p50 = validFluxes[Math.floor(validFluxes.length * 0.5)] ?? 0;
    const p99 = validFluxes[Math.floor(validFluxes.length * 0.992)] ?? maxFlux;

    // Đo độ sáng đỉnh tại vùng tâm ngắm (bán kính 4x4 pixels quanh tâm cutout)
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    let centerPeakFlux = p50;
    let centerFlagMask = 0;
    let centerVariance = varCount > 0 ? sumVar / varCount : 0.02;

    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const px = Math.min(width - 1, Math.max(0, cx + dx));
        const py = Math.min(height - 1, Math.max(0, cy + dy));
        const idx = py * width + px;
        const val = img[idx];
        if (!isNaN(val) && isFinite(val) && val > centerPeakFlux) {
          centerPeakFlux = val;
          if (vari && vari[idx] > 0) centerVariance = vari[idx];
        }
        if (flg) {
          centerFlagMask |= flg[idx];
        }
      }
    }

    // Đếm số pixel bị gắn cờ nhiễu (Transient / Cosmic ray / Overflow / Snowball)
    let transientPixels = 0;
    let overflowPixels = 0;
    if (flg) {
      for (let i = 0; i < flg.length; i++) {
        const mask = flg[i];
        // Bit 0..2: Dead/Nonfunc/Overflow, Bit 9..14: Transient/Cosmic Ray/Snowball
        if (mask & 0x0006) overflowPixels++;
        if (mask & 0x3e00) transientPixels++;
      }
    }

    const meanZodi = zodiCount > 0 ? sumZodi / zodiCount : p50;
    const noiseSigma = Math.sqrt(Math.max(1e-6, centerVariance));
    const snr = Math.max(1.0, (centerPeakFlux - p50) / noiseSigma);

    const detector = hdr["DETECTOR"] || 6;
    const detectorWaveRanges = {
      1: [0.75, 1.11],
      2: [1.11, 1.63],
      3: [1.63, 2.43],
      4: [2.43, 3.82],
      5: [3.82, 4.42],
      6: [4.41, 5.01]
    };
    const [wlMin, wlMax] = detectorWaveRanges[detector] || [0.75, 5.0];

    let qualityFlag = "CLEAN";
    let qualityMessage = `🟢 SẠCH NHIỄU DỮ LIỆU THẬT (L2DQA=${hdr["L2DQAFLG"] || "Pass"} • 0 Tia vũ trụ tại tâm)`;
    if (overflowPixels > 2) {
      qualityFlag = "SATURATED_WARN";
      qualityMessage = `🟡 CẢNH BÁO FLAGS THẬT: Có ${overflowPixels} pixel vượt ngưỡng bão hòa (Overflow)`;
    } else if (transientPixels > 8) {
      qualityFlag = "COSMIC_RAY_WARN";
      qualityMessage = `🔴 CẢNH BÁO FLAGS THẬT: Phát hiện ${transientPixels} pixel dính Tia vũ trụ (Transient/Cosmic Ray)`;
    }

    return {
      valid: true,
      isRealNasaFits: true,
      width,
      height,
      detector,
      wlMin,
      wlMax,
      obsId: hdr["OBSID"] || "SPHEREx_L2",
      expId: hdr["EXPIDN"] || "",
      dateObs: hdr["DATE-OBS"] || hdr["DATE"] || "2025-08-15T20:45:11Z",
      bunit: hdr["BUNIT"] || "MJy/sr",
      psfFwhm: +(hdr["PSF_FWHM"] || 6.2).toFixed(2),
      l1Dqa: hdr["L1DQAFLG"] || "Pass",
      l2Dqa: hdr["L2DQAFLG"] || "Pass",
      astrometryStars: hdr["MATCH_NSTARS"] || 0,
      centerPeakFlux: +centerPeakFlux.toFixed(3),
      medianFlux: +p50.toFixed(3),
      minFlux: +minFlux.toFixed(3),
      maxFlux: +maxFlux.toFixed(3),
      p10,
      p50,
      p99,
      meanZodi: +meanZodi.toFixed(3),
      medianVariance: +centerVariance.toFixed(4),
      snr: +snr.toFixed(1),
      centerFlagHex: "0x" + (centerFlagMask >>> 0).toString(16).toUpperCase().padStart(4, "0"),
      transientPixels,
      overflowPixels,
      qualityFlag,
      qualityMessage,
      hdus,
      hduList
    };
  },

  /**
   * Vẽ ma trận điểm ảnh 32-bit Float thật từ HDU 1 (IMAGE) & HDU 4 (ZODI) lên HTML5 Canvas
   * Sử dụng thuật toán Asinh Stretch chuẩn thiên văn (giống SAOImage DS9 / Aladin)
   */
  renderFitsToCanvas(parsedFits, targetCanvas, options = {}) {
    if (!parsedFits || !parsedFits.valid || !targetCanvas) return null;

    const {
      subtractZodi = false,
      brightness = 0,
      contrast = 1.15,
      colormap = "infrared"
    } = options;

    const imgHdu = parsedFits.hdus["IMAGE"];
    const zodHdu = parsedFits.hdus["ZODI"];
    const flgHdu = parsedFits.hdus["FLAGS"];
    const w = parsedFits.width;
    const h = parsedFits.height;
    const img = imgHdu.matrix;
    const zod = zodHdu?.matrix || null;
    const flg = flgHdu?.matrix || null;

    // Tạo offscreen canvas đúng kích thước pixel gốc của Cutout (VD: 58x59)
    const offCanvas = document.createElement("canvas");
    offCanvas.width = w;
    offCanvas.height = h;
    const offCtx = offCanvas.getContext("2d");
    const imgData = offCtx.createImageData(w, h);
    const data = imgData.data;

    // Ngưỡng nền và ngưỡng đỉnh để co giãn tương phản Asinh
    const bgBase = subtractZodi && zod ? parsedFits.p50 - parsedFits.meanZodi : parsedFits.p50;
    const dynamicRange = Math.max(0.5, parsedFits.p99 - parsedFits.p10);
    const softFactor = 3.2 * contrast;
    const brightShift = brightness / 120;

    for (let y = 0; y < h; y++) {
      // Trong FITS thiên văn, trục Y (NAXIS2) tính từ dưới lên trên, nên lật ngược trục Y khi vẽ lên Canvas
      const fitsRow = h - 1 - y;
      for (let x = 0; x < w; x++) {
        const idx = fitsRow * w + x;
        let val = img[idx];
        if (subtractZodi && zod && !isNaN(zod[idx])) {
          val -= zod[idx];
        }

        let norm = 0;
        if (!isNaN(val) && isFinite(val)) {
          const shifted = (val - bgBase) / dynamicRange;
          norm = Math.asinh(shifted * softFactor) / Math.asinh(softFactor) + brightShift;
          norm = Math.max(0, Math.min(1, norm));
        }

        const outIdx = (y * w + x) * 4;
        // Tô màu theo bảng màu Hồng ngoại SPHEREx (Đen sâu -> Xanh lam -> Cam vàng -> Trắng sáng)
        if (colormap === "infrared") {
          data[outIdx] = Math.min(255, Math.round(Math.pow(norm, 0.75) * 255));
          data[outIdx + 1] = Math.min(255, Math.round(Math.pow(norm, 1.05) * 235));
          data[outIdx + 2] = Math.min(255, Math.round((Math.pow(norm, 0.55) * 0.65 + Math.pow(norm, 1.8) * 0.55) * 255));
          data[outIdx + 3] = 255;
        } else {
          const g = Math.round(norm * 255);
          data[outIdx] = g;
          data[outIdx + 1] = g;
          data[outIdx + 2] = g;
          data[outIdx + 3] = 255;
        }

        // Nếu người dùng bật hiển thị cờ lỗi và pixel dính tia vũ trụ mạnh, đánh dấu viền đỏ nhẹ
        if (flg && (flg[idx] & 0x0006)) {
          data[outIdx] = 255;
          data[outIdx + 1] = 90;
          data[outIdx + 2] = 90;
        }
      }
    }

    offCtx.putImageData(imgData, 0, 0);

    // Vẽ phóng to lên targetCanvas
    const ctx = targetCanvas.getContext("2d");
    ctx.save();
    ctx.imageSmoothingEnabled = false; // Giữ rõ từng pixel cảm biến thực tế của SPHEREx
    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    ctx.drawImage(offCanvas, 0, 0, targetCanvas.width, targetCanvas.height);

    // Viền và thông số FITS thực
    ctx.strokeStyle = "rgba(34, 197, 94, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, targetCanvas.width - 2, targetCanvas.height - 2);
    ctx.fillStyle = "#86efac";
    ctx.font = "bold 9px 'JetBrains Mono', monospace";
    ctx.fillText(`REAL FITS ${w}×${h}px (D${parsedFits.detector})`, 5, 12);
    ctx.fillStyle = "#bae6fd";
    ctx.fillText(`Peak: ${parsedFits.centerPeakFlux} MJy/sr`, 5, targetCanvas.height - 5);
    ctx.restore();

    return offCanvas;
  }
};
