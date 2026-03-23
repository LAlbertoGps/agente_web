// ============================================================================
// openai_agent.js — Chat de texto + Voz con OpenAI Realtime
// ============================================================================

import { getSystemPrompt, herramientas } from './prompt.js';
import { ejecutarHerramienta } from './api.js';
import { getCredentials } from './auth.js';
import {
    $,
    addMessage, updateMessage,
    showVoiceOverlay, hideVoiceOverlay,
    setMicMuted, updateTokenCounter
} from './ui.js';

// ============================================================================
// ESTADO GLOBAL
// ============================================================================
let socket = null;
let audioContext = null;
let stream = null;
let micSourceNode = null;
let micProcessorNode = null;
let silentGainNode = null;

let isConnected = false;
let isConnecting = false;
let isMicMuted = false;

let aiMsgId = null;
let aiTextBuffer = '';

let nextPlayTime = 0;
let audioSources = [];

let currentResponseId = null;
let connectionPromise = null;

export const isVoiceActive = () => isConnected;

// ============================================================================
// CONFIG
// ============================================================================
const REALTIME_MODEL = 'gpt-realtime-mini';
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;

// Si el browser no respeta exactamente 24kHz, esta es la frecuencia objetivo
const TARGET_SAMPLE_RATE = 24000;

// ============================================================================
// INICIALIZACIÓN
// ============================================================================
export function inicializarIA() {
    const creds = getCredentials();
    if (!creds || !creds.openaiKey) {
        console.warn('OpenAI API Key no encontrada.');
    }
}

// ============================================================================
// CHAT DE TEXTO
// ============================================================================
export async function handleSendText(text) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return;

    await iniciarConexion();

    addMessage('user', cleanText);

    const tempId = Date.now();
    addMessage('ai', '<span style="opacity:0.5;">Analizando datos...</span>', tempId);

    aiMsgId = tempId;
    aiTextBuffer = '';

    socket.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
            type: 'message',
            role: 'user',
            content: [
                { type: 'input_text', text: cleanText }
            ]
        }
    }));

    socket.send(JSON.stringify({
        type: 'response.create'
    }));
}

// ============================================================================
// CONEXIÓN REALTIME
// ============================================================================
async function iniciarConexion() {
    if (isConnected) return;
    if (connectionPromise) return connectionPromise;

    isConnecting = true;

    connectionPromise = new Promise((resolve, reject) => {
        try {
            const creds = getCredentials();
            const apiKey = creds?.openaiKey;

            if (!apiKey) {
                throw new Error('No se encontró openaiKey en credenciales.');
            }

            // -----------------------------------------------------------------
            // IMPORTANTE:
            // En producción frontend usa token efímero desde backend.
            // Este bloque con API key directa solo es útil para pruebas locales.
            //
            // Si tu backend te devuelve un token efímero, sustituye apiKey por ese
            // valor y conserva los subprotocols.
            // -----------------------------------------------------------------
            socket = new WebSocket(REALTIME_URL, [
                'realtime',
                `openai-insecure-api-key.${apiKey}`,
                'openai-beta.realtime-v1'
            ]);

            socket.binaryType = 'arraybuffer';

            socket.onopen = () => {
                console.log('OpenAI Realtime conectado');
                isConnected = true;
                isConnecting = false;

                const setupEvent = {
                    type: 'session.update',
                    session: {
                        modalities: ['text', 'audio'],
                        instructions: getSystemPrompt(),
                        tools: herramientas.map(h => ({
                            type: 'function',
                            name: h.function.name,
                            description: h.function.description,
                            parameters: h.function.parameters
                        })),
                        tool_choice: 'auto',
                        input_audio_format: 'pcm16',
                        output_audio_format: 'pcm16',
                        voice: normalizeVoice($.voiceSelect?.value),
                        turn_detection: {
                            type: 'server_vad',
                            threshold: 0.5,
                            prefix_padding_ms: 300,
                            silence_duration_ms: 500,
                            create_response: true
                        },
                        input_audio_transcription: {
                            model: 'gpt-4o-mini-transcribe',
                            language: 'es'
                        }
                    }
                };
                socket.send(JSON.stringify(setupEvent));
                resolve();
            };

            socket.onmessage = async (e) => {
                try {
                    const serverEvent = JSON.parse(e.data);
                    await handleServerEvent(serverEvent);
                } catch (err) {
                    console.error('Error procesando evento Realtime:', err, e.data);
                }
            };

            socket.onerror = (err) => {
                console.error('WebSocket Error:', err);
                cleanupSocketState();
                reject(err);
            };

            socket.onclose = () => {
                console.log('OpenAI Realtime cerrado');
                cleanupSocketState();
                cleanupAudioCapture();
                stopAllAudioPlayback();
                hideVoiceOverlay();
            };
        } catch (err) {
            cleanupSocketState();
            reject(err);
        }
    });

    try {
        await connectionPromise;
    } finally {
        connectionPromise = null;
    }
}

function cleanupSocketState() {
    isConnected = false;
    isConnecting = false;
    socket = null;
    currentResponseId = null;
}

// ============================================================================
// EVENTOS DEL SERVIDOR
// ============================================================================
async function handleServerEvent(event) {
    switch (event.type) {
        // -------------------------------------------------------------
        // Texto de respuesta
        // -------------------------------------------------------------
        case 'response.created':
            currentResponseId = event.response?.id || null;
            break;

        case 'response.text.delta':
            ensureAiMessage();
            aiTextBuffer += event.delta || '';
            updateMessage(aiMsgId, aiTextBuffer);
            break;

        case 'response.text.done':
            // no limpiamos aquí si todavía puede venir transcript de audio
            break;

        // -------------------------------------------------------------
        // Transcript del audio de salida del asistente
        // -------------------------------------------------------------
        case 'response.audio_transcript.delta':
            ensureAiMessage();
            aiTextBuffer += event.delta || '';
            updateMessage(aiMsgId, aiTextBuffer);
            break;

        case 'response.audio_transcript.done':
            break;

        // -------------------------------------------------------------
        // Audio de salida
        // -------------------------------------------------------------
        case 'response.audio.delta':
            playAudioDelta(event.delta);
            break;

        // -------------------------------------------------------------
        // Transcripción del usuario desde audio de entrada
        // -------------------------------------------------------------
        case 'conversation.item.input_audio_transcription.completed':
            if (event.transcript?.trim()) {
                addMessage('user', event.transcript.trim());
            }
            break;

        // -------------------------------------------------------------
        // Function calling
        // -------------------------------------------------------------
        case 'response.function_call_arguments.done': {
            try {
                const { name, arguments: args, call_id } = event;
                const parsedArgs = safeJsonParse(args, {});
                const result = await ejecutarHerramienta(name, parsedArgs);

                socket?.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'function_call_output',
                        call_id,
                        output: JSON.stringify(result ?? {})
                    }
                }));

                socket?.send(JSON.stringify({
                    type: 'response.create'
                }));
            } catch (err) {
                console.error('Error ejecutando herramienta:', err);

                if (socket) {
                    socket.send(JSON.stringify({
                        type: 'conversation.item.create',
                        item: {
                            type: 'function_call_output',
                            call_id: event.call_id,
                            output: JSON.stringify({
                                ok: false,
                                error: err?.message || 'Error al ejecutar herramienta'
                            })
                        }
                    }));

                    socket.send(JSON.stringify({
                        type: 'response.create'
                    }));
                }
            }
            break;
        }

        // -------------------------------------------------------------
        // Uso / tokens
        // -------------------------------------------------------------
        case 'response.done': {
            currentResponseId = null;
        
            const usage = event.response?.usage;
            if (usage && typeof updateTokenCounter === 'function') {
                updateTokenCounter({
                    total: usage.total_tokens ?? 0,
                    input: usage.input_tokens ?? 0,
                    output: usage.output_tokens ?? 0,
                    inputText: usage.input_token_details?.text_tokens ?? 0,
                    inputAudio: usage.input_token_details?.audio_tokens ?? 0,
                    outputText: usage.output_token_details?.text_tokens ?? 0,
                    outputAudio: usage.output_token_details?.audio_tokens ?? 0
                });
            }
        
            aiMsgId = null;
            aiTextBuffer = '';
            break;
        }

        // -------------------------------------------------------------
        // Errores
        // -------------------------------------------------------------
        case 'error':
            console.error('OpenAI Error:', event.error);
            break;

        default:
            // Descomenta para debug fino:
            // console.log('Evento no manejado:', event.type, event);
            break;
    }
}

function ensureAiMessage() {
    if (!aiMsgId) {
        aiMsgId = Date.now();
        aiTextBuffer = '';
        addMessage('ai', '', aiMsgId);
    }
}

// ============================================================================
// VOZ
// ============================================================================
export async function iniciarAgenteVoz() {
    showVoiceOverlay();

    await iniciarConexion();

    if (!audioContext) {
        audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
        nextPlayTime = audioContext.currentTime;
    }

    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    if (stream) return; // ya está capturando

    stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    });

    micSourceNode = audioContext.createMediaStreamSource(stream);

    // ScriptProcessor para prototipo simple; AudioWorklet sería mejor para prod
    micProcessorNode = audioContext.createScriptProcessor(4096, 1, 1);

    micProcessorNode.onaudioprocess = (event) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        if (isMicMuted) return;

        const inputData = event.inputBuffer.getChannelData(0);

        // Resamplea a 24kHz si el contexto real no coincide
        const pcmFloat =
            audioContext.sampleRate === TARGET_SAMPLE_RATE
                ? inputData
                : downsampleBuffer(inputData, audioContext.sampleRate, TARGET_SAMPLE_RATE);

        if (!pcmFloat || pcmFloat.length === 0) return;

        const pcm16Buffer = floatTo16BitPCM(pcmFloat);
        const base64Audio = arrayBufferToBase64(pcm16Buffer);

        socket.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Audio
        }));
    };

    micSourceNode.connect(micProcessorNode);

    // Evita escuchar el micrófono localmente
    silentGainNode = audioContext.createGain();
    silentGainNode.gain.value = 0;
    micProcessorNode.connect(silentGainNode);
    silentGainNode.connect(audioContext.destination);
}

export function cerrarAgenteVoz() {
    cleanupAudioCapture();
    stopAllAudioPlayback();

    if (socket) {
        try {
            socket.close();
        } catch (err) {
            console.warn('No se pudo cerrar socket:', err);
        }
    }

    hideVoiceOverlay();
}

function cleanupAudioCapture() {
    try {
        if (micProcessorNode) {
            micProcessorNode.disconnect();
            micProcessorNode.onaudioprocess = null;
        }
    } catch {}

    try {
        if (micSourceNode) micSourceNode.disconnect();
    } catch {}

    try {
        if (silentGainNode) silentGainNode.disconnect();
    } catch {}

    if (stream) {
        stream.getTracks().forEach(t => {
            try { t.stop(); } catch {}
        });
    }

    micProcessorNode = null;
    micSourceNode = null;
    silentGainNode = null;
    stream = null;
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

// Si no usaras server_vad, puedes llamar esto al soltar botón hablar.
export function finalizarTurnoDeVoz() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    socket.send(JSON.stringify({
        type: 'input_audio_buffer.commit'
    }));

    socket.send(JSON.stringify({
        type: 'response.create'
    }));
}

// Opcional: cancelar respuesta en curso si el usuario interrumpe
export function cancelarRespuestaActual() {
    stopAllAudioPlayback();

    if (!socket || socket.readyState !== WebSocket.OPEN || !currentResponseId) return;

    socket.send(JSON.stringify({
        type: 'response.cancel',
        response_id: currentResponseId
    }));
}

function playAudioDelta(base64Audio) {
    playPCM16(base64Audio);
}

function stopAllAudioPlayback() {
    for (const source of audioSources) {
        try {
            source.stop();
        } catch {}
    }
    audioSources = [];

    if (audioContext) {
        nextPlayTime = audioContext.currentTime;
    } else {
        nextPlayTime = 0;
    }
}

// ============================================================================
// AUXILIARES
// ============================================================================
function normalizeTools(tools) {
    return (tools || []).map(t => {
        if (t?.type === 'function') return t;
        if (t?.function) return t.function;
        return t;
    });
}

function normalizeVoice(value) {
    return String(value || '').trim().toLowerCase();
}

function safeJsonParse(value, fallback = null) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

// Downsample simple por promedio.
// Para prototipo está bien; para prod conviene filtro mejor.
function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
    if (outputSampleRate >= inputSampleRate) {
        return buffer;
    }

    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);

    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
        const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
        let accum = 0;
        let count = 0;

        for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i];
            count++;
        }

        result[offsetResult] = count > 0 ? accum / count : 0;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
    }

    return result;
}

// ─── Auxiliares de audio ─────────────────────────────────────────────────────
function floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);

    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return buffer;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

function playPCM16(base64Data) {
    if (!audioContext || !base64Data) return;

    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);

    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }

    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);

    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
    }

    const buffer = audioContext.createBuffer(1, float32Array.length, TARGET_SAMPLE_RATE);
    buffer.getChannelData(0).set(float32Array);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    source.onended = () => {
        audioSources = audioSources.filter(s => s !== source);
    };

    audioSources.push(source);

    if (nextPlayTime < audioContext.currentTime) {
        nextPlayTime = audioContext.currentTime;
    }

    source.start(nextPlayTime);
    nextPlayTime += buffer.duration;
}