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
//@ts-expect-error
import RgbQuant from "rgbquant";
import { createCanvas, createImageData } from "canvas";

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

const sharpService: LocalImageService<SharpImageServiceConfig> = {
  parseURL: baseService.parseURL,
  getURL: baseService.getURL,
  async transform(inputBuffer, transformOptions, config) {
    if (!sharp) sharp = await loadSharp();
    const transform: BaseServiceTransform =
      transformOptions as BaseServiceTransform;

    // Return SVGs as-is
    // TODO: Sharp has some support for SVGs, we could probably support this once Sharp is the default and only service.
    if (transform.format === "svg") return { data: inputBuffer, format: "svg" };

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

    const isGifInput =
      inputBuffer[0] === 0x47 && // 'G'
      inputBuffer[1] === 0x49 && // 'I'
      inputBuffer[2] === 0x46 && // 'F'
      inputBuffer[3] === 0x38 && // '8'
      (inputBuffer[4] === 0x39 || inputBuffer[4] === 0x37) && // '9' or '7'
      inputBuffer[5] === 0x61; // 'a'

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

    if (transform.format) {
      let quality: number | string | undefined = undefined;
      if (transform.quality) {
        const parsedQuality = parseQuality(transform.quality);
        if (typeof parsedQuality === "number") {
          quality = parsedQuality;
        } else {
          quality =
            transform.quality in qualityTable
              ? qualityTable[transform.quality]
              : undefined;
        }
      }

      if (transform.format === "webp" && isGifInput) {
        // Convert animated GIF to animated WebP with loop=0 (infinite)
        result.webp({
          quality: typeof quality === "number" ? quality : undefined,
          loop: 0,
        });
      } else {
        result.toFormat(transform.format as keyof FormatEnum, { quality });
      }
    }

    const { data, info } = await result
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Sharp can sometimes return a SharedArrayBuffer when using WebAssembly.
    // SharedArrayBuffers need to be copied into an ArrayBuffer in order to be manipulated.
    const needsCopy =
      "buffer" in data && data.buffer instanceof SharedArrayBuffer;
    const dataCopy = needsCopy ? new Uint8Array(data) : data;

    if (isGifInput) {
      return {
        data: dataCopy,
        format: info.format as ImageOutputFormat,
      };
    }

    const cv = createCanvas(info.width, info.height);
    const ctx = cv.getContext("2d");
    ctx.putImageData(
      createImageData(new Uint8ClampedArray(dataCopy), info.width, info.height),
      0,
      0,
    );

    const q = new RgbQuant({ colors: 12, dithKern: "FalseFloydSteinberg" });
    q.sample(cv, info.width);
    q.palette();
    const dithered = q.reduce(cv);
    ctx.putImageData(
      createImageData(new Uint8ClampedArray(dithered), info.width),
      0,
      0,
    );
    const buffer = cv.toBuffer("image/png");

    return {
      data: buffer,
      format: "png" as ImageOutputFormat,
    };
  },
};

export default sharpService;
