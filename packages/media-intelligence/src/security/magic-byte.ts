/**
 * Magic Byte & Binary Signature Detector
 * Validates real binary signatures against declared MIME types.
 * Strictly catches MIME spoofing (e.g. executable or shell script masquerading as image).
 */

export interface MagicByteValidationResult {
  valid: boolean;
  detectedMime: string;
  declaredMime: string;
  extension: string;
  isMimeSpoofed: boolean;
}

export class MagicByteValidator {
  public validate(buffer: Buffer, declaredMime: string): MagicByteValidationResult {
    if (!buffer || buffer.length < 4) {
      return {
        valid: false,
        detectedMime: 'application/octet-stream',
        declaredMime,
        extension: 'bin',
        isMimeSpoofed: true,
      };
    }

    let detectedMime = 'application/octet-stream';
    let extension = 'bin';

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      detectedMime = 'image/jpeg';
      extension = 'jpg';
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    else if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      detectedMime = 'image/png';
      extension = 'png';
    }
    // WebP: RIFF ... WEBP
    else if (
      buffer.length >= 12 &&
      buffer.toString('utf8', 0, 4) === 'RIFF' &&
      buffer.toString('utf8', 8, 12) === 'WEBP'
    ) {
      detectedMime = 'image/webp';
      extension = 'webp';
    }
    // PDF: %PDF-
    else if (buffer.toString('utf8', 0, 4) === '%PDF') {
      detectedMime = 'application/pdf';
      extension = 'pdf';
    }
    // Ogg / Opus audio: OggS
    else if (buffer.toString('utf8', 0, 4) === 'OggS') {
      detectedMime = 'audio/ogg';
      extension = 'ogg';
    }
    // MP4 / Video: ftyp
    else if (buffer.length >= 8 && buffer.toString('utf8', 4, 8) === 'ftyp') {
      detectedMime = 'video/mp4';
      extension = 'mp4';
    }

    // MIME spoofing check: declared says image, but detected says binary or mismatch
    const isMimeSpoofed =
      detectedMime === 'application/octet-stream' ||
      (declaredMime.startsWith('image/') && !detectedMime.startsWith('image/')) ||
      (declaredMime.startsWith('audio/') && !detectedMime.startsWith('audio/'));

    return {
      valid: !isMimeSpoofed,
      detectedMime,
      declaredMime,
      extension,
      isMimeSpoofed,
    };
  }
}

export const magicByteValidator = new MagicByteValidator();
