/**
 * Image Modality Processor
 * Produces structured visual context and OCR layout elements.
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrElement {
  text: string;
  confidence: number;
  bbox?: BoundingBox;
}

export interface ImageProcessingResult {
  artifactId: string;
  dimensions?: { width: number; height: number };
  ocrElements: OcrElement[];
  fullOcrText: string;
  visualSummary: string;
}

export class ImageProcessor {
  public async process(
    artifactId: string,
    buffer: Buffer,
    options: { extractOcr?: boolean; visionPrompt?: string } = {}
  ): Promise<ImageProcessingResult> {
    // Simulated/Heuristic OCR parser for screenshots/receipts
    const textPreview = buffer.toString('utf8', 0, Math.min(buffer.length, 500));
    const isTextual = /order|invoice|error|failed|payment|otp|login/i.test(textPreview);

    const ocrElements: OcrElement[] = [];
    if (isTextual) {
      ocrElements.push({
        text: 'Payment status: Pending verification',
        confidence: 0.95,
        bbox: { x: 50, y: 100, width: 300, height: 30 },
      });
    }

    const fullOcrText = ocrElements.map((e) => e.text).join('\n');

    return {
      artifactId,
      dimensions: { width: 1080, height: 1920 },
      ocrElements,
      fullOcrText,
      visualSummary: isTextual ? 'Screenshot of transactional confirmation screen' : 'User uploaded photo/media',
    };
  }
}

export const imageProcessor = new ImageProcessor();
