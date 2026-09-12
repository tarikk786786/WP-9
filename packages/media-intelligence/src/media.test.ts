import test from 'node:test';
import assert from 'node:assert/strict';
import {
  magicByteValidator,
  antivirusScanner,
  contentAddressedRegistry,
  imageProcessor,
  multimodalContextBuilder,
} from './index.ts';

test('Media Intelligence: magic byte detector validates JPEG and catches MIME spoofing', () => {
  // Valid JPEG header: FF D8 FF E0
  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const jpegResult = magicByteValidator.validate(validJpeg, 'image/jpeg');
  assert.equal(jpegResult.valid, true);
  assert.equal(jpegResult.detectedMime, 'image/jpeg');
  assert.equal(jpegResult.isMimeSpoofed, false);

  // Spoofed file: declared image/jpeg, but starts with shell script/executable bytes
  const spoofedExecutable = Buffer.from('#!/bin/bash\nrm -rf /');
  const spoofResult = magicByteValidator.validate(spoofedExecutable, 'image/jpeg');
  assert.equal(spoofResult.isMimeSpoofed, true);
  assert.equal(spoofResult.valid, false);
});

test('Media Intelligence: antivirus scanner quarantines test malware signatures', async () => {
  const eicarBuffer = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
  const scan = await antivirusScanner.scan('art_test_1', eicarBuffer);
  assert.equal(scan.status, 'QUARANTINED');
  assert.equal(scan.threatName, 'EICAR_TEST_VIRUS');

  const cleanBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const cleanScan = await antivirusScanner.scan('art_test_2', cleanBuffer);
  assert.equal(cleanScan.status, 'CLEAN');
});

test('Media Intelligence: ContentAddressedRegistry deduplicates identical media uploads', () => {
  const fileBytes = Buffer.from('identical photo payload content 12345');
  const reg1 = contentAddressedRegistry.register(fileBytes, { detectedMime: 'image/jpeg', extension: 'jpg' });
  assert.equal(reg1.isDuplicate, false);

  const reg2 = contentAddressedRegistry.register(fileBytes, { detectedMime: 'image/jpeg', extension: 'jpg' });
  assert.equal(reg2.isDuplicate, true);
  assert.equal(reg1.artifact.artifactId, reg2.artifact.artifactId);
  assert.equal(reg1.artifact.sha256, reg2.artifact.sha256);
});

test('Media Intelligence: MultimodalContextBuilder creates unified evidence without sending replies', async () => {
  const dummyImage = Buffer.from('Payment status invoice failed error');
  const imgRes = await imageProcessor.process('art_img_1', dummyImage);

  const unifiedContext = multimodalContextBuilder.build({
    messageId: 'msg_media_101',
    chatId: '919876543210@s.whatsapp.net',
    senderId: '919876543210',
    text: 'yeh dekho payment nahi hui',
    modality: 'image',
    imageResult: imgRes,
  });

  assert.equal(unifiedContext.messageId, 'msg_media_101');
  assert.equal(unifiedContext.rawText, 'yeh dekho payment nahi hui');
  assert.ok(unifiedContext.evidenceSpans.some((e) => e.source === 'ocr'));
  assert.ok(unifiedContext.evidenceSpans.some((e) => e.source === 'vision'));
});
