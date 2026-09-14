export async function transcribeAudio(audioBuffer: Buffer, mimeType = 'audio/ogg'): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!groqKey && !openaiKey) {
    return 'Voice note received (voice transcription requires GROQ_API_KEY or OPENAI_API_KEY)';
  }

  // 1. Try Groq Whisper (ultra-fast transcription)
  if (groqKey) {
    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
      formData.append('file', blob, 'audio.ogg');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('temperature', '0.2');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        const json = (await res.json()) as { text?: string };
        if (json.text?.trim()) return json.text.trim();
      }
    } catch (err) {
      console.warn('[audio] Groq whisper-large-v3-turbo failed, trying fallback:', err instanceof Error ? err.message : err);
    }
  }

  // 2. Try OpenAI Whisper fallback if configured
  if (openaiKey) {
    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
      formData.append('file', blob, 'audio.ogg');
      formData.append('model', 'whisper-1');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(20_000),
      });

      if (res.ok) {
        const json = (await res.json()) as { text?: string };
        if (json.text?.trim()) return json.text.trim();
      }
    } catch (err) {
      console.warn('[audio] OpenAI Whisper failed:', err instanceof Error ? err.message : err);
    }
  }

  return 'voice message';
}
