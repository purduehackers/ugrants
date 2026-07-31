import type { ImageQualityPreset, LocalImageService } from "astro";
import { baseService } from "astro/assets";
import {
  parseQuality,
  type BaseServiceTransform,
} from "node_modules/astro/dist/assets/services/service";
import type {
  ImageFit,
  ImageOutputFormat,
} from "node_modules/astro/dist/assets/types";
import type { FitEnum, FormatEnum, SharpOptions } from "sharp";

export interface SharpImageServiceConfig {
  /**
   * The `limitInputPixels` option passed to Sharp. See https://sharp.pixelplumbing.com/api-constructor for more information
   */
  limitInputPixels?: SharpOptions["limitInputPixels"];
}

let sharp: typeof import("sharp") | undefined;

async function loadSharp() {
  let sharpImport: typeof import("sharp");
  try {
    sharpImport = (await import("sharp")).default;
  } catch {
    throw new Error("Sharp is not installed");
  }

  // Disable the `sharp` `libvips` cache as it errors when the file is too small and operations are happening too fast (runs into a race condition) https://github.com/lovell/sharp/issues/3935#issuecomment-1881866341
  sharpImport.cache(false);

  return sharpImport;
}

const qualityTable: Record<ImageQualityPreset, number> = {
  low: 25,
  mid: 50,
  high: 80,
  max: 100,
};

const fitMap: Record<ImageFit, keyof FitEnum> = {
  fill: "fill",
  contain: "inside",
  cover: "cover",
  none: "outside",
  "scale-down": "inside",
  outside: "outside",
  inside: "inside",
};

// The only knob for how loud the dither is. Fewer levels, harder grain.
const LEVELS = 8;

// Floyd-Steinberg, in place, on a single-channel buffer. Serpentine scan:
// one direction piles error against an edge and bands in flat areas.
function dither(gray: Uint8Array, width: number, height: number) {
  const band = 255 / (LEVELS - 1);

  const buf = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) buf[i] = gray[i];

  const diffuse = (i: number, err: number, factor: number) => {
    buf[i] += (err * factor) / 16;
  };

  for (let y = 0; y < height; y++) {
    const leftToRight = y % 2 === 0;
    const start = leftToRight ? 0 : width - 1;
    const end = leftToRight ? width : -1;
    const dir = leftToRight ? 1 : -1;

    for (let x = start; x !== end; x += dir) {
      const i = y * width + x;
      const old = buf[i];
      const next = Math.max(0, Math.min(255, Math.round(old / band) * band));
      gray[i] = next;

      const err = old - next;
      if (err === 0) continue;

      const hasAhead = dir > 0 ? x + 1 < width : x - 1 >= 0;
      const hasBehind = dir > 0 ? x - 1 >= 0 : x + 1 < width;
      const hasBelow = y + 1 < height;

      if (hasAhead) diffuse(i + dir, err, 7);
      if (hasBelow) {
        if (hasBehind) diffuse(i + width - dir, err, 3);
        diffuse(i + width, err, 5);
        if (hasAhead) diffuse(i + width + dir, err, 1);
      }
    }
  }
}

const sharpService: LocalImageService<SharpImageServiceConfig> = {
  parseURL: baseService.parseURL,
  getURL: baseService.getURL,
  // Without these the <img> ships with nothing but src.
  getHTMLAttributes: baseService.getHTMLAttributes,
  getSrcSet: baseService.getSrcSet,
  // Pin the format or filenames claim .webp/.jpg.
  validateOptions(options, config) {
    const validated = baseService.validateOptions?.(options, config) ?? options;
    return { ...validated, format: "png" };
  },
  async transform(inputBuffer, transformOptions, config) {
    if (!sharp) sharp = await loadSharp();
    const transform: BaseServiceTransform =
      transformOptions as BaseServiceTransform;

    // Return SVGs as-is
    // TODO: Sharp has some support for SVGs, we could probably support this once Sharp is the default and only service.
    if (transform.format === "svg") return { data: inputBuffer, format: "svg" };

    const isGifInput =
      inputBuffer[0] === 0x47 && // 'G'
      inputBuffer[1] === 0x49 && // 'I'
      inputBuffer[2] === 0x46 && // 'F'
      inputBuffer[3] === 0x38 && // '8'
      (inputBuffer[4] === 0x39 || inputBuffer[4] === 0x37) && // '9' or '7'
      inputBuffer[5] === 0x61; // 'a'

    const result = sharp(inputBuffer, {
      failOnError: false,
      pages: -1,
      limitInputPixels: config.service.config.limitInputPixels,
    });

    // always call rotate to adjust for EXIF data orientation
    result.rotate();

    // If `fit` isn't set then use old behavior:
    // - Do not use both width and height for resizing, and prioritize width over height
    // - Allow enlarging images

    const withoutEnlargement = Boolean(transform.fit);
    if (transform.width && transform.height && transform.fit) {
      const fit: keyof FitEnum = fitMap[transform.fit] ?? "inside";
      result.resize({
        width: Math.round(transform.width),
        height: Math.round(transform.height),
        fit,
        position: transform.position,
        withoutEnlargement,
      });
    } else if (transform.height && !transform.width) {
      result.resize({
        height: Math.round(transform.height),
        withoutEnlargement,
      });
    } else if (transform.width) {
      result.resize({
        width: Math.round(transform.width),
        withoutEnlargement,
      });
    }

    if (isGifInput) {
      let quality: number | string | undefined = undefined;
      if (transform.quality) {
        const parsedQuality = parseQuality(transform.quality);
        quality =
          typeof parsedQuality === "number"
            ? parsedQuality
            : parsedQuality in qualityTable
              ? qualityTable[parsedQuality as ImageQualityPreset]
              : undefined;
      }
      result.webp({
        quality: typeof quality === "number" ? quality : undefined,
        loop: 0,
      });
      return { data: await result.toBuffer(), format: "webp" };
    }

    const { data, info } = await result
      .flatten({ background: "#ffffff" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Sharp can sometimes return a SharedArrayBuffer when using WebAssembly.
    // SharedArrayBuffers need to be copied into an ArrayBuffer in order to be manipulated.
    const needsCopy =
      "buffer" in data && data.buffer instanceof SharedArrayBuffer;
    const gray = needsCopy ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    dither(gray, info.width, info.height);

    const buffer = await sharp(gray, {
      raw: { width: info.width, height: info.height, channels: 1 },
    })
      // libimagequant merges bands without headroom, and must not re-dither.
      .png({ palette: true, colours: Math.min(256, LEVELS * 2), dither: 0 })
      .toBuffer();

    return {
      data: buffer,
      format: "png" as ImageOutputFormat,
    };
  },
};

export default sharpService;
