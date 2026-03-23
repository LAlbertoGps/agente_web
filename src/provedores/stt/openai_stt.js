export function createOpenAIStt({ apiKey, model = 'gpt-4o-mini-transcribe' }) {
    return {
      async transcribe(audioBlob) {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', model);
  
        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`
          },
          body: formData
        });
  
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`STT OpenAI error: ${res.status} ${text}`);
        }
  
        const data = await res.json();
        return { text: data.text || '' };
      }
    };
  }