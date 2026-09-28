export type ValidatedProfileImage = { contentType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp"; width: number; height: number };

const maxBytes = 3 * 1024 * 1024;
const maxPixels = 16_000_000;

export function validateBusinessProfileImage(bytes: Uint8Array): ValidatedProfileImage {
  if (bytes.length === 0 || bytes.length > maxBytes) throw new Error("business_profile_avatar_size_invalid");
  let image: Omit<ValidatedProfileImage, "extension">;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) image = parseJpeg(bytes);
  else if (bytes.length >= 8 && hex(bytes.subarray(0, 8)) === "89504e470d0a1a0a") image = parsePng(bytes);
  else if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") image = parseWebp(bytes);
  else throw new Error("business_profile_avatar_type_invalid");
  if (image.width < 64 || image.height < 64 || image.width > 4096 || image.height > 4096 || image.width * image.height > maxPixels) {
    throw new Error("business_profile_avatar_dimensions_invalid");
  }
  return { ...image, extension: image.contentType === "image/jpeg" ? "jpg" : image.contentType === "image/png" ? "png" : "webp" };
}

function parsePng(bytes: Uint8Array): Omit<ValidatedProfileImage, "extension"> {
  if (bytes.length < 33 || readU32(bytes, 8) !== 13 || ascii(bytes, 12, 16) !== "IHDR") throw new Error("business_profile_avatar_malformed");
  const width = readU32(bytes, 16); const height = readU32(bytes, 20);
  let offset = 8; let foundEnd = false;
  while (offset + 12 <= bytes.length) {
    const size = readU32(bytes, offset); const type = ascii(bytes, offset + 4, offset + 8);
    if (size > bytes.length - offset - 12) throw new Error("business_profile_avatar_malformed");
    if (["tEXt", "zTXt", "iTXt", "eXIf"].includes(type)) throw new Error("business_profile_avatar_metadata_unsupported");
    offset += size + 12;
    if (type === "IEND") { foundEnd = true; break; }
  }
  if (!foundEnd) throw new Error("business_profile_avatar_malformed");
  return { contentType: "image/png", width, height };
}

function parseJpeg(bytes: Uint8Array): Omit<ValidatedProfileImage, "extension"> {
  let offset = 2; let width = 0; let height = 0; let foundScan = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error("business_profile_avatar_malformed");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0xda) { foundScan = true; break; }
    if (marker === undefined) throw new Error("business_profile_avatar_malformed");
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) throw new Error("business_profile_avatar_malformed");
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) throw new Error("business_profile_avatar_malformed");
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) throw new Error("business_profile_avatar_metadata_unsupported");
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) throw new Error("business_profile_avatar_malformed");
      height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
      width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
    }
    offset += length;
  }
  if (!width || !height || !foundScan) throw new Error("business_profile_avatar_malformed");
  return { contentType: "image/jpeg", width, height };
}

function parseWebp(bytes: Uint8Array): Omit<ValidatedProfileImage, "extension"> {
  const declaredSize = readU32(bytes, 4) + 8;
  if (declaredSize > bytes.length || declaredSize < 20) throw new Error("business_profile_avatar_malformed");
  let offset = 12; let width = 0; let height = 0;
  while (offset + 8 <= declaredSize) {
    const type = ascii(bytes, offset, offset + 4); const size = readU32(bytes, offset + 4); const data = offset + 8;
    if (size > declaredSize - data) throw new Error("business_profile_avatar_malformed");
    if (["EXIF", "XMP ", "ICCP"].includes(type)) throw new Error("business_profile_avatar_metadata_unsupported");
    if (type === "VP8X" && size >= 10) {
      width = 1 + readU24(bytes, data + 4); height = 1 + readU24(bytes, data + 7);
    } else if (type === "VP8 " && size >= 10 && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) {
      width = ((bytes[data + 7]! & 0x3f) << 8) | bytes[data + 6]!; height = ((bytes[data + 9]! & 0x3f) << 8) | bytes[data + 8]!;
    } else if (type === "VP8L" && size >= 5 && bytes[data] === 0x2f) {
      width = 1 + bytes[data + 1]! + ((bytes[data + 2]! & 0x3f) << 8);
      height = 1 + (bytes[data + 2]! >> 6) + (bytes[data + 3]! << 2) + ((bytes[data + 4]! & 0x0f) << 10);
    }
    if (width && height) break;
    offset = data + size + (size % 2);
  }
  if (!width || !height) throw new Error("business_profile_avatar_malformed");
  return { contentType: "image/webp", width, height };
}

function readU32(bytes: Uint8Array, offset: number) { return ((bytes[offset]! * 0x1000000) + (bytes[offset + 1]! << 16) + (bytes[offset + 2]! << 8) + bytes[offset + 3]!) >>> 0; }
function readU24(bytes: Uint8Array, offset: number) { return bytes[offset]! + (bytes[offset + 1]! << 8) + (bytes[offset + 2]! << 16); }
function ascii(bytes: Uint8Array, start: number, end: number) { return String.fromCharCode(...bytes.subarray(start, end)); }
function hex(bytes: Uint8Array) { return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(""); }
