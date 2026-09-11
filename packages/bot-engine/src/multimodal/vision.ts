export async function analyzeImage(imageBuffer: Buffer, prompt = 'What is in this image?'): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (openaiKey) {
    try {
      const base64 = imageBuffer.toString('base64');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
              ],
            },
          ],
        }),
      });
      if (res.ok) {
        const json = await res.json() as { choices: Array<{ message: { content: string } }> };
        return json.choices[0]?.message?.content || 'Image received';
      }
    } catch {
      /* fallback */
    }
  }

  return 'Image document received and stored';
}
