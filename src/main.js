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

import { $, showChat, showLogin } from './ui.js';
import { hasCredentials, saveCredentials, getCredentials } from './auth.js';
import { ejecutarHerramienta } from './api.js';

import {
    handleSendText,
    iniciarAgenteVoz,
    toggleSilenciar,
    cerrarAgenteVoz,
    isVoiceActive,
    inicializarIA
} from './gemini_agent.js';

// ─── Inicialización ──────────────────────────────────────────────────────────
function init() {
    if (hasCredentials()) {
        showChat();
        inicializarIA();
    } else {
        showLogin();
    }
}

// ─── Manejo de Login ─────────────────────────────────────────────────────────
$.loginSubmit.addEventListener('click', async () => {
    const username = $.loginUsername.value.trim();
    const password = $.loginPassword.value.trim();
    const geminiKey = $.loginGeminiKey.value.trim();
    const redgpsKey = $.loginRedgpsKey.value.trim();

    if (!geminiKey || !redgpsKey) {
        alert('Por favor, ingresa ambas API Keys.');
        return;
    }

    saveCredentials({ username, password, geminiKey, redgpsKey });
    let token = await ejecutarHerramienta('getToken', {username, password, redgpsKey});
    console.log("token",token);
    showChat();
    inicializarIA();
});

// ─── Chat de texto ───────────────────────────────────────────────────────────
async function handleSend() {
    const text = $.userInput.value.trim();
    if (!text) return;
    $.userInput.value = '';
    $.sendBtn.classList.remove('active');
    await handleSendText(text);
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
    if (isVoiceActive()) {
        cerrarAgenteVoz();
    } else {
        iniciarAgenteVoz();
    }
});
$.btnSilenciar?.addEventListener('click', () => toggleSilenciar());
$.btnCerrar?.addEventListener('click', () => cerrarAgenteVoz());

// Iniciar aplicación
init();
