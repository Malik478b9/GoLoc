import * as ImagePicker from "expo-image-picker";

import { filePart } from "./api/client";

/**
 * iPhones store photos as HEIC and videos as HEVC. "Compatible" makes iOS hand
 * us JPEG / H.264 instead, which the server can validate and every phone can
 * play. No effect on Android.
 */
export const COMPATIBLE = {
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic",
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", pdf: "application/pdf",
};

/**
 * FormData part for a picked file. The name comes from the actual file on disk
 * (iOS keeps the original "IMG_0042.HEIC" name even after converting to JPEG).
 */
export function assetPart(uri: string, fallbackName: string) {
  const ext = (uri.split("?")[0].split(".").pop() || "").toLowerCase();
  const known = MIME[ext];
  const base = fallbackName.replace(/\.[^.]+$/, "");
  return filePart(uri, known ? `${base}.${ext}` : fallbackName, known ?? "application/octet-stream");
}
