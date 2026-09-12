/**
 * Unified Multimodal Context Builder
 * Assembles text + media evidence into a single conversational context
 * for the Authoritative Conversation Brain.
 *
 * ABSOLUTE INVARIANT:
 * Media processors NEVER send WhatsApp messages directly.
 * Only ConversationBrain -> ResponsePlanner -> Outbox may create outbound replies.
 */

import { type MediaArtifact } from '../storage/content-address.ts';
import { type ImageProcessingResult } from '../modality/image-processor.ts';
import { type AudioProcessingResult } from '../modality/audio-processor.ts';

export interface UnifiedMessageContext {
  messageId: string;
  chatId: string;
  senderId: string;
  timestamp: number;
  rawText?: string;
  media?: {
    artifact: MediaArtifact;
    modality: 'image' | 'audio' | 'video' | 'document' | 'sticker';
    caption?: string;
    imageResult?: ImageProcessingResult;
    audioResult?: AudioProcessingResult;
  };
  evidenceSpans: Array<{
    source: 'user_text' | 'ocr' | 'asr' | 'vision';
    content: string;
    confidence: number;
  }>;
}

export class MultimodalContextBuilder {
  public build(params: {
    messageId: string;
    chatId: string;
    senderId: string;
    text?: string;
    mediaArtifact?: MediaArtifact;
    modality?: 'image' | 'audio' | 'video' | 'document' | 'sticker';
    caption?: string;
    imageResult?: ImageProcessingResult;
    audioResult?: AudioProcessingResult;
  }): UnifiedMessageContext {
    const evidenceSpans: UnifiedMessageContext['evidenceSpans'] = [];

    if (params.text) {
      evidenceSpans.push({
        source: 'user_text',
        content: params.text,
        confidence: 1.0,
      });
    }

    if (params.imageResult?.fullOcrText) {
      evidenceSpans.push({
        source: 'ocr',
        content: params.imageResult.fullOcrText,
        confidence: 0.95,
      });
    }

    if (params.imageResult?.visualSummary) {
      evidenceSpans.push({
        source: 'vision',
        content: params.imageResult.visualSummary,
        confidence: 0.85,
      });
    }

    if (params.audioResult?.transcript) {
      evidenceSpans.push({
        source: 'asr',
        content: params.audioResult.transcript,
        confidence: 0.9,
      });
    }

    return {
      messageId: params.messageId,
      chatId: params.chatId,
      senderId: params.senderId,
      timestamp: Date.now(),
      rawText: params.text,
      media: params.mediaArtifact && params.modality
        ? {
            artifact: params.mediaArtifact,
            modality: params.modality,
            caption: params.caption,
            imageResult: params.imageResult,
            audioResult: params.audioResult,
          }
        : undefined,
      evidenceSpans,
    };
  }
}

export const multimodalContextBuilder = new MultimodalContextBuilder();
