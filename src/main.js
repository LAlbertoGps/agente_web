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

import { $ } from './ui.js';

import {
    handleSendText,
    iniciarAgenteVoz,
    toggleSilenciar,
    cerrarAgenteVoz,
    isVoiceActive
} from './gemini_agent.js';

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
