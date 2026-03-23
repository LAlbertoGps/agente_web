// ============================================================================
// main.js — Orquestador principal
//
// Conecta botones con el agente Gemini.
//
// Estructura del proyecto:
//   prompt.js       → system prompt + herramientas (compartido)
//   apis.js         → llamadas a RedGPS (compartido)
//   ui.js           → DOM, mensajes, toggle, botones
//   gemini_agent.js → lógica completa Gemini
//   main.js         → este archivo, conecta todo
// ============================================================================

import { $, showChat, showLogin, setEngineUI } from './ui.js';
import { hasCredentials, saveCredentials, getCredentials } from './auth.js';
import { ejecutarHerramienta } from './api.js';

import * as GeminiAgent from './gemini_agent.js';
import * as OpenAIAgent from './openai_agent.js';

let activeAgent = GeminiAgent;
let currentEngine = 'gemini';

// ─── Inicialización ──────────────────────────────────────────────────────────
function init() {
    if (hasCredentials()) {
        showChat();
        setEngineUI(currentEngine);
        GeminiAgent.inicializarIA();
        OpenAIAgent.inicializarIA();
    } else {
        showLogin();
    }
}

// ─── Manejo de Login ─────────────────────────────────────────────────────────
$.loginSubmit.addEventListener('click', async () => {
    const username = $.loginUsername.value.trim();
    const password = $.loginPassword.value.trim();
    const geminiKey = $.loginGeminiKey.value.trim();
    const openaiKey = $.loginOpenaiKey.value.trim();
    const redgpsKey = $.loginRedgpsKey.value.trim();

    if (!redgpsKey) {
        alert('Por favor, ingresa la API Key de RedGPS.');
        return;
    }

    let token = await ejecutarHerramienta('gettoken', {username, password, redgpsKey});
    saveCredentials({ username, password, geminiKey, openaiKey, redgpsKey, token: token.data });
    
    showChat();
    GeminiAgent.inicializarIA();
    OpenAIAgent.inicializarIA();
});

// ─── Cambio de Engine ────────────────────────────────────────────────────────
$.btnGemini.addEventListener('click', () => {
    currentEngine = 'gemini';
    activeAgent = GeminiAgent;
    setEngineUI('gemini');
});

$.btnOpenai.addEventListener('click', () => {
    currentEngine = 'openai';
    activeAgent = OpenAIAgent;
    setEngineUI('openai');
});

// ─── Chat de texto ───────────────────────────────────────────────────────────
async function handleSend() {
    const text = $.userInput.value.trim();
    if (!text) return;
    $.userInput.value = '';
    $.sendBtn.classList.remove('active');
    await activeAgent.handleSendText(text);
}

// ─── Listeners ───────────────────────────────────────────────────────────────
$.userInput.addEventListener('input', () => {
    // Auto-resize refinado
    $.userInput.style.height = '44px'; // Altura base inicial
    const newHeight = $.userInput.scrollHeight;
    if (newHeight > 44) {
        $.userInput.style.height = newHeight + 'px';
    }
    
    $.sendBtn.classList.toggle('active', $.userInput.value.trim().length > 0);
});

$.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
        // Reset height after send
        $.userInput.style.height = '44px';
    }
});

$.sendBtn.addEventListener('click', () => {
    handleSend();
    $.userInput.style.height = '44px';
});
$.micBtn.addEventListener('click', () => {
    if (activeAgent.isVoiceActive()) {
        activeAgent.cerrarAgenteVoz();
    } else {
        activeAgent.iniciarAgenteVoz();
    }
});
$.btnSilenciar?.addEventListener('click', () => activeAgent.toggleSilenciar());
$.btnCerrar?.addEventListener('click', () => activeAgent.cerrarAgenteVoz());

// Iniciar aplicación
init();
