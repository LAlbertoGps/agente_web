export function createOpenAITts({
    apiKey,
    model = 'gpt-4o-mini-tts',
    voice = 'alloy',
    format = 'mp3'
  }) {
    return {
      async speak(text) {
        const res = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            voice,
            input: text,
            format
          })
        });
  
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`TTS OpenAI error: ${res.status} ${body}`);
        }
  
        const audioBlob = await res.blob();
        return { audioBlob };
      }
    };
  }