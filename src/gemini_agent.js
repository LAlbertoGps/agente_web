// ============================================================================
// gemini-agent.js — Chat de texto + Voz con Gemini
//
// Importa de:
//   prompt.js → getSystemPrompt(), herramientasGemini
//   apis.js   → ejecutarHerramienta()
//   ui.js     → addMessage(), updateMessage(), etc.
// ============================================================================

import { GoogleGenAI } from '@google/genai';
import { getSystemPrompt, herramientasGemini } from './prompt.js';
import { ejecutarHerramienta } from './api.js';
import {
    $,
    addMessage, updateMessage,
    showVoiceOverlay, hideVoiceOverlay,
    setMicMuted, updateTokenCounter
} from './ui.js';

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

const MODEL_TEXT = 'gemini-2.5-flash';
const MODEL_LIVE = 'gemini-2.5-flash-native-audio-preview-12-2025';

// ─── Totales acumulados de la sesión ─────────────────────────────────────────
let totalTokensIn = 0;
let totalTokensOut = 0;
let totalCostoIn = 0;
let totalCostoOut = 0;
let totalCostoSesion = 0;

// ─── Chat de texto ───────────────────────────────────────────────────────────
let textChat = null;

function crearTextChat() {
    textChat = ai.chats.create({
        model: MODEL_TEXT,
        config: {
            systemInstruction: getSystemPrompt(),
            tools: herramientasGemini
        }
    });
}

// ─── Estado de voz ───────────────────────────────────────────────────────────
let audioContext, session, stream;
let isConnected = false;
export const isVoiceActive = () => isConnected;
let isMuted = false;
let nextPlayTime = 0;

// Acumuladores para transcripción del turno actual
let userTranscriptId = null;   // id del mensaje de usuario en construcción
let aiMsgId = null;            // id del mensaje de IA en construcción
let aiTextBuffer = '';         // texto de respuesta acumulado

// ============================================================================
// CHAT DE TEXTO
// ============================================================================
export async function handleSendText(text) {
    if (!textChat) crearTextChat();

    addMessage('user', text);
    const idTemporal = Date.now();
    addMessage('ai', '<span style="opacity:0.5;">Analizando datos...</span>', idTemporal);

    try {
        let response = await textChat.sendMessage({ message: text });

        // ── Tool call ────────────────────────────────────────────────────
        if (response.functionCalls?.length > 0) {
            const llamada = response.functionCalls[0];

            updateMessage(idTemporal, `<span style="color:var(--orange);opacity:0.8;">Obteniendo datos...</span>`);

            const resultadoBD = await ejecutarHerramienta(llamada.name, llamada.args);

            response = await textChat.sendMessage({
                message: [{ functionResponse: { name: llamada.name, response: resultadoBD } }]
            });
        }

        // ── Respuesta final ──────────────────────────────────────────────
        updateMessage(idTemporal,response.text);

        // Tokens
        if (response.usageMetadata) {
            // Extracción completa
            const {
                promptTokenCount: tIn,
                candidatesTokenCount: tOut,
                totalTokenCount: tTotal,
                thoughtsTokenCount: tThinking = 0,
                cachedContentTokenCount: tCached = 0
            } = response.usageMetadata;

            // Costos del mensaje actual
            const costoIn     = ((tIn - tCached) * 0.30 / 1e6) + (tCached * 0.03 / 1e6);
            const costoOut    = (tOut + tThinking) * 2.50 / 1e6;
            const costoTotal  = costoIn + costoOut;

            // Actualizar acumulados
            totalTokensIn += tIn;
            totalTokensOut += (tOut + tThinking);
            totalCostoIn += costoIn;
            totalCostoOut += costoOut;
            totalCostoSesion += costoTotal;

            // Actualizar ambos contadores
            updateTokenCounter(tIn, tOut + tThinking, costoIn, costoOut, costoTotal, idTemporal);
            updateTokenCounter(totalTokensIn, totalTokensOut, totalCostoIn, totalCostoOut, totalCostoSesion);
        }

        

    } catch (error) {
        console.error('Error Gemini texto:', error);
        updateMessage(idTemporal, '<span style="color:#ff4a4a;">Error de conexión. Intenta de nuevo.</span>');
    }
}

// ============================================================================
// VOZ — Gemini Live
// ============================================================================
export async function iniciarAgenteVoz() {
    showVoiceOverlay();
    if (isConnected) return;

    try {

        isMuted = false;
        nextPlayTime = 0;

        stream = await navigator.mediaDevices.getUserMedia({
            audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(stream);


        const baseUrl = import.meta.env.BASE_URL || '/';
        await audioContext.audioWorklet.addModule(`${baseUrl}audio-processor.js`);
        const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');

        const silenceGain = audioContext.createGain();
        silenceGain.gain.value = 0;
        source.connect(workletNode);
        workletNode.connect(silenceGain);
        silenceGain.connect(audioContext.destination);



        const selectedVoice = $.voiceSelect?.value || 'Kore';

        session = await ai.live.connect({
            model: MODEL_LIVE,
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } },
                systemInstruction: { parts: [{ text: getSystemPrompt() }] },
                tools: herramientasGemini,
                inputAudioTranscription: {},   // ← activa transcripción del usuario
                outputAudioTranscription: {}   // ← activa transcripción de la IA
            },
            callbacks: {
                onmessage: async (response) => {

                    // ── Transcripción del USUARIO (lo que dijo) ────────────────
                    const inputTranscript = response.serverContent?.inputTranscription?.text;
                    if (inputTranscript) {
                        if (!userTranscriptId) {
                            userTranscriptId = Date.now();
                            addMessage('user', inputTranscript, userTranscriptId);
                        } else {
                            updateMessage(userTranscriptId, inputTranscript);
                        }
                    }

                    // ── Audio de la IA ───────────────────────────────────────────
                    if (response.serverContent?.modelTurn?.parts) {
                        for (const part of response.serverContent.modelTurn.parts) {
                            if (part.inlineData) playPCM16(part.inlineData.data);
                        }
                    }

                    // ── Transcripción de la RESPUESTA de la IA ─────────────────
                    const outputTranscript = response.serverContent?.outputTranscription?.text;
                    if (outputTranscript) {
                        // Al iniciar la respuesta de la IA, el turno de usuario terminó
                        userTranscriptId = null;

                        if (!aiMsgId) {
                            aiMsgId = Date.now() + 1;
                            aiTextBuffer = outputTranscript;
                            addMessage('ai', aiTextBuffer, aiMsgId);
                        } else {
                            aiTextBuffer += outputTranscript;
                            updateMessage(aiMsgId, aiTextBuffer);
                        }
                    }

                    // ── Tool call ────────────────────────────────────────────────
                    if (response.toolCall) {
                        for (const llamada of response.toolCall.functionCalls) {
                            const resultadoBD = await ejecutarHerramienta(llamada.name, llamada.args);
                            session.sendToolResponse({
                                functionResponses: [{ id: llamada.id, name: llamada.name, response: resultadoBD }]
                            });
                        }
                    }

                    // ── Turn complete: cerrar burbuja de IA ─────────────────────
                    if (response.serverContent?.turnComplete) {
                        aiMsgId = null;
                        aiTextBuffer = '';
                    }

                    if (response.serverContent?.interrupted) {
                        nextPlayTime = 0;
                        aiMsgId = null;
                        aiTextBuffer = '';
                    }

                    // ── Tokens ───────────────────────────────────────────────────
                    const usage = response.usageMetadata;
                    if (usage) {
                        let tIn = 0, tOut = 0, costoIn = 0, costoOut = 0;
                        usage.promptTokensDetails?.forEach(d => {
                            tIn += d.tokenCount;
                            costoIn += d.modality === 'TEXT' ? d.tokenCount * 0.50 / 1e6 : d.tokenCount * 3.00 / 1e6;
                        });
                        usage.responseTokensDetails?.forEach(d => {
                            tOut += d.tokenCount;
                            costoOut += d.modality === 'TEXT' ? d.tokenCount * 2.00 / 1e6 : d.tokenCount * 12.00 / 1e6;
                        });

                        const costoTotal = costoIn + costoOut;

                        // Actualizar acumulados
                        totalTokensIn += tIn;
                        totalTokensOut += tOut;
                        totalCostoIn += costoIn;
                        totalCostoOut += costoOut;
                        totalCostoSesion += costoTotal;

                        // Actualizar ambos contadores
                        if (aiMsgId) {
                            updateTokenCounter(tIn, tOut, costoIn, costoOut, costoTotal, aiMsgId);
                        }
                        updateTokenCounter(totalTokensIn, totalTokensOut, totalCostoIn, totalCostoOut, totalCostoSesion);
                    }
                },
                onerror: (err) => console.error('Gemini Live error:', err),
                onclose: () => cerrarAgenteVoz()
            }
        });


        isConnected = true;

        workletNode.port.onmessage = (event) => {
            if (!isConnected || !session) return;
            try {
                const pcmData = floatTo16BitPCM(event.data);
                const base64Audio = arrayBufferToBase64(pcmData);
                session.sendRealtimeInput({ audio: { data: base64Audio, mimeType: 'audio/pcm;rate=16000' } });
            } catch (err) {
                console.error('Error enviando audio:', err);
                isConnected = false;
            }
        };

    } catch (error) {
        console.error('Error Gemini voz:', error);

        cerrarAgenteVoz();
    }
}

export function toggleSilenciar() {
    if (!isConnected) return;
    isMuted = !isMuted;
    setMicMuted(isMuted);

}

export function cerrarAgenteVoz() {
    isConnected = false;
    isMuted = false;
    nextPlayTime = 0;
    userTranscriptId = null;
    aiMsgId = null;
    aiTextBuffer = '';
    hideVoiceOverlay();

    if (stream) stream.getTracks().forEach(t => t.stop());
    if (audioContext) audioContext.close();
    stream = null;
    audioContext = null;

    setMicMuted(false);

}

// ─── Auxiliares de audio (igual que en tu main.js original) ──────────────────
function floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function playPCM16(base64Data) {
    if (!audioContext) return;
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) float32Array[i] = int16Array[i] / 0x8000;

    const buffer = audioContext.createBuffer(1, float32Array.length, 24000);
    buffer.getChannelData(0).set(float32Array);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    if (nextPlayTime < audioContext.currentTime) nextPlayTime = audioContext.currentTime;
    source.start(nextPlayTime);
    nextPlayTime += buffer.duration;
}