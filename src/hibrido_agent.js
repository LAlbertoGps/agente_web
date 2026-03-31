// ============================================================================
// hybrid_agent.js — STT + LLM + TTS agnóstico por adaptadores
// ============================================================================

import { getSystemPrompt, herramientas } from './prompt.js';
import { ejecutarHerramienta } from './api.js';
import { getCredentials } from './auth.js';
import {
  $,
  addMessage,
  updateMessage,
  showVoiceOverlay,
  hideVoiceOverlay,
  setMicMuted,
  updateTokenCounter
} from './ui.js';

// Adaptadores
import { createOpenAIStt } from './provedores/stt/openai_stt.js';
import { createOpenAILlm } from './provedores/llm/openai_llm.js';
import { createOpenAITts } from './provedores/tts/openai_tts.js';
import { createElevenLabsTts } from './provedores/tts/elevenlabs_tts.js';

let mediaRecorder = null;
let stream = null;
let audioChunks = [];
let isRecording = false;
let isMicMuted = false;
let currentAudio = null;

let stt = null;
let llm = null;
let tts = null;

let isConnected = false;

let conversation = [];
export const isVoiceActive = () => isConnected;
// ----------------------------------------------------------------------------
// Inicialización
// ----------------------------------------------------------------------------
export function inicializarHybridAgent() {
  const creds = getCredentials();

  stt = createOpenAIStt({
    apiKey: creds?.openaiKey,
    model: 'gpt-4o-mini-transcribe'
  });

  llm = createOpenAILlm({
    apiKey: creds?.openaiKey,
    model: 'gpt-4o-mini',
    systemPrompt: getSystemPrompt(),
    tools: herramientas,
    toolExecutor: ejecutarHerramienta
  });

  tts = createOpenAITts({
    apiKey: creds?.openaiKey,
    model: 'gpt-4o-mini-tts',
    voice: normalizeOpenAIVoice($.voiceSelect?.value || 'alloy')
  });
}

// ----------------------------------------------------------------------------
// Configuración dinámica
// ----------------------------------------------------------------------------
export function setHybridProviders({
  sttProvider,
  llmProvider,
  ttsProvider
} = {}) {
  if (sttProvider) stt = sttProvider;
  if (llmProvider) llm = llmProvider;
  if (ttsProvider) tts = ttsProvider;
}

export function setTtsEngine(engineName) {
  const creds = getCredentials();

  if (engineName === 'elevenlabs') {
    tts = createElevenLabsTts({
      apiKey: creds?.elevenlabsKey,
      voiceId: creds?.elevenlabsVoiceId,
      modelId: creds?.elevenlabsModelId || 'eleven_multilingual_v2'
    });
    return;
  }

  tts = createOpenAITts({
    apiKey: creds?.openaiKey,
    model: 'gpt-4o-mini-tts',
    voice: normalizeOpenAIVoice($.voiceSelect?.value || 'alloy')
  });
}

// ----------------------------------------------------------------------------
// Texto
// ----------------------------------------------------------------------------
export async function handleSendText(text) {
  const clean = String(text || '').trim();
  if (!clean) return;

  addMessage('user', clean);
  conversation.push({ role: 'user', content: clean });

  const tempId = Date.now();
  addMessage('ai', '<span style="opacity:0.5;">Procesando...</span>', tempId);

  try {
    const result = await llm.generate({
      messages: conversation
    });

    console.log(result);

    updateMessageSafe(tempId, result.text || '');
    conversation.push({ role: 'assistant', content: result.text || '' });

    if (result.usage && typeof updateTokenCounter === 'function') {
    //   updateTokenCounter(result.usage);
    }

    if (result.text) {
      const audioResult = await tts.speak(result.text);
      await playAudioResult(audioResult);
    }
  } catch (err) {
    console.error('Error handleSendText:', err);
    updateMessageSafe(tempId, 'Ocurrió un error al procesar la solicitud.');
  }
}

// ----------------------------------------------------------------------------
// Voz
// ----------------------------------------------------------------------------
export async function iniciarAgenteVoz() {
  showVoiceOverlay();

  if (stream) return;

  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  mediaRecorder = new MediaRecorder(stream, {
    mimeType: pickSupportedMimeType()
  });
  
  isConnected = true;

  audioChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      audioChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = async () => {
    try {
      const mimeType = mediaRecorder?.mimeType || 'audio/webm';
      const blob = new Blob(audioChunks, { type: mimeType });
      audioChunks = [];

      const sttResult = await stt.transcribe(blob);
      const userText = (sttResult?.text || '').trim();

      if (!userText) return;

      addMessage('user', userText);
      conversation.push({ role: 'user', content: userText });

      const tempId = Date.now();
      addMessage('ai', '<span style="opacity:0.5;">Respondiendo...</span>', tempId);

      const llmResult = await llm.generate({
        messages: conversation
      });

      updateMessageSafe(tempId, llmResult.text || '');
      conversation.push({ role: 'assistant', content: llmResult.text || '' });

      if (llmResult.usage && typeof updateTokenCounter === 'function') {
        // updateTokenCounter(llmResult.usage);
      }

      if (llmResult.text) {
        const audioResult = await tts.speak(llmResult.text);
        await playAudioResult(audioResult);
      }
    } catch (err) {
      console.error('Error flujo voz híbrido:', err);
      addMessage('ai', 'Ocurrió un error al procesar el audio.');
    }
  };

  comenzarGrabacion();
}

export function comenzarGrabacion() {
  if (!mediaRecorder || isRecording) return;
  audioChunks = [];
  mediaRecorder.start();
  isRecording = true;
}

export function terminarGrabacion() {
  if (!mediaRecorder || !isRecording) return;
  mediaRecorder.stop();
  isRecording = false;
}

export function cerrarAgenteVoz() {
  console.log('cerrarAgenteVoz');
  
  if (isRecording) {
    terminarGrabacion();
  }

  if (stream) {
    stream.getTracks().forEach(t => {
      try { t.stop(); } catch {}
    });
  }

  stream = null;
  mediaRecorder = null;
  audioChunks = [];
  isRecording = false;
  isConnected = false;
  
  stopCurrentAudio();
  hideVoiceOverlay();
}

export function toggleSilenciar() {
  isMicMuted = !isMicMuted;
  setMicMuted(isMicMuted);

  if (stream) {
    stream.getAudioTracks().forEach(track => {
      track.enabled = !isMicMuted;
    });
  }

  return isMicMuted;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function updateMessageSafe(id, html) {
  try {
    updateMessage(id, html);
  } catch {
    addMessage('ai', html);
  }
}

async function playAudioResult(audioResult) {
  stopCurrentAudio();

  if (!audioResult) return;

  if (audioResult.audioUrl) {
    currentAudio = new Audio(audioResult.audioUrl);
    await currentAudio.play();
    return;
  }

  if (audioResult.audioBlob) {
    const url = URL.createObjectURL(audioResult.audioBlob);
    currentAudio = new Audio(url);
    currentAudio.onended = () => URL.revokeObjectURL(url);
    await currentAudio.play();
  }
}

function stopCurrentAudio() {
  if (!currentAudio) return;
  try {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  } catch {}
  currentAudio = null;
}

function pickSupportedMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];

  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }

  return '';
}

function normalizeOpenAIVoice(value) {
  const allowed = new Set([
    'alloy', 'ash', 'ballad', 'coral', 'echo',
    'sage', 'shimmer', 'verse', 'marin', 'cedar'
  ]);

  const v = String(value || '').trim().toLowerCase();
  return allowed.has(v) ? v : 'coral';
}