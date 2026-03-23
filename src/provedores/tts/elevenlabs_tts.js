export function createElevenLabsTts({
    apiKey = "sk_ac9ef6e105c3ab09d6aa8afbdf22470490b43ebd34e32e73",
    voiceId = "EXAVITQu4vr4xnSDxMaL",
    modelId = 'eleven_multilingual_v2',
    outputFormat = 'mp3_44100_128'
  }) {
    return {
      async speak(text) {
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            output_format: outputFormat
          })
        });
  
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`TTS ElevenLabs error: ${res.status} ${body}`);
        }
  
        const audioBlob = await res.blob();
        return { audioBlob };
      }
    };
  }