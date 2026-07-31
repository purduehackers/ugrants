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

/**
 * Floyd–Steinberg error diffusion down to pure black and white.
 *
 * Serpentine scan (alternating row direction) rather than always
 * left-to-right: a single direction accumulates error toward one edge and
 * leaves visible diagonal banding in flat areas like skies.
 *
 * Operates on a single-channel 8-bit greyscale buffer, in place.
 */
function dither1Bit(gray: Uint8Array, width: number, height: number) {
  // Error is fractional and routinely runs outside 0–255, so it needs its own
  // float buffer; quantising into the Uint8Array as we go would clip it.
  const buf = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) buf[i] = gray[i];

  const diffuse = (i: number, err: number, factor: number) => {
    buf[i] += (err * factor) / 16;
  };

  for (let y = 0; y < height; y++) {
    const leftToRight = y % 2 === 0;
    const start = leftToRight ? 0 : width - 1;
    const end = leftToRight ? width : -1;
    const step = leftToRight ? 1 : -1;
    // Mirror the kernel when we reverse, so error always travels "ahead" of
    // the scan rather than back into pixels we have already committed.
    const ahead = step;

    for (let x = start; x !== end; x += step) {
      const i = y * width + x;
      const old = buf[i];
      const next = old < 128 ? 0 : 255;
      gray[i] = next;

      const err = old - next;
      if (err === 0) continue;

      const hasAhead = ahead > 0 ? x + 1 < width : x - 1 >= 0;
      const hasBehind = ahead > 0 ? x - 1 >= 0 : x + 1 < width;
      const hasBelow = y + 1 < height;

      if (hasAhead) diffuse(i + ahead, err, 7);
      if (hasBelow) {
        if (hasBehind) diffuse(i + width - ahead, err, 3);
        diffuse(i + width, err, 5);
        if (hasAhead) diffuse(i + width + ahead, err, 1);
      }
    }
  }
}

const sharpService: LocalImageService<SharpImageServiceConfig> = {
  parseURL: baseService.parseURL,
  getURL: baseService.getURL,
  // Everything comes out of transform() as a 1-bit PNG, so pin the format up
  // front or the generated filenames claim .webp/.jpg.
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

    // Animated GIFs can't be dithered frame-wise here without desyncing the
    // palette between frames, so they keep the normal encode path.
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

    // Flatten onto white before desaturating: the page ground is near-white,
    // so transparent regions should dither as paper, not as black.
    const { data, info } = await result
      .flatten({ background: "#ffffff" })
      .greyscale()
      // Stretch to the full range first. Error diffusion thresholds hard at
      // 128, so a low-contrast source would otherwise collapse to a nearly
      // solid field with no texture at all.
      .normalise()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Sharp can sometimes return a SharedArrayBuffer when using WebAssembly.
    // SharedArrayBuffers need to be copied into an ArrayBuffer in order to be manipulated.
    const needsCopy =
      "buffer" in data && data.buffer instanceof SharedArrayBuffer;
    const gray = needsCopy ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    dither1Bit(gray, info.width, info.height);

    const buffer = await sharp(gray, {
      raw: { width: info.width, height: info.height, channels: 1 },
    })
      // Two-colour palette: the output is literally 1-bit, so this keeps the
      // files tiny and stops any encoder-side smoothing.
      .png({ palette: true, colours: 2, effort: 10 })
      .toBuffer();

    return {
      data: buffer,
      format: "png" as ImageOutputFormat,
    };
  },
};

export default sharpService;
