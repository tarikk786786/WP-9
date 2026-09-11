export async function transcribeAudio(audioBuffer: Buffer, mimeType = 'audio/ogg'): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return 'Voice note received (voice transcription requires GROQ_API_KEY or OPENAI_API_KEY)';
  }

  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append('file', blob, 'audio.ogg');
    formData.append('model', 'whisper-large-v3');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (res.ok) {
      const json = await res.json() as { text?: string };
      return json.text || '';
    }
  } catch (err) {
    console.error('[AUDIO_TRANSCRIBE_ERROR]', err);
  }

  return 'voice message';
}
