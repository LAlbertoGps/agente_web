// ============================================================================
// ui.js — Manejo del DOM, mensajes y botones
//
// Solo pinta cosas en pantalla y emite eventos.
// ============================================================================

/**
 * Parseador de markdown simple (solo negritas y saltos de línea)
 * @param {string} text 
 * @returns {string} HTML
 */
function parseMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Negritas
        .replace(/^\*\s+(.*)/gm, '<div style="margin-left: 12px;>• $1</div>') // Listas con *
        .replace(/\n/g, '<br>'); // Saltos de línea
}

// ─── Referencias DOM ─────────────────────────────────────────────────────────
export const $ = {
    chatContainer:  document.getElementById('chat-container'),
    userInput:      document.getElementById('user-input'),
    sendBtn:        document.getElementById('send-btn'),
    micBtn:         document.getElementById('mic-btn'),
    micIcon:        document.getElementById('mic-icon'),
    headerBadge:    document.getElementById('header-badge'),
    inputArea:      document.getElementById('input-area'),
    tokenIn:        document.getElementById('global-token-in'),
    tokenOut:       document.getElementById('global-token-out'),
    tokenTotal:     document.getElementById('global-token-total'),
    costIn:         document.getElementById('global-cost-in'),
    costOut:        document.getElementById('global-cost-out'),
    costTotal:      document.getElementById('global-cost-total'),
    voiceSelect:    document.getElementById('voice-select'),
    // Login Screen
    loginScreen:    document.getElementById('login-screen'),
    loginUsername:  document.getElementById('login-username'),
    loginPassword:  document.getElementById('login-password'),
    loginGeminiKey: document.getElementById('login-gemini-key'),
    loginOpenaiKey: document.getElementById('login-openai-key'),
    loginRedgpsKey: document.getElementById('login-redgps-key'),
    loginSubmit:    document.getElementById('login-submit'),
    // Engine Selection
    btnGemini:      document.getElementById('btn-gemini'),
    btnOpenai:      document.getElementById('btn-openai'),
    btnHibrido:     document.getElementById('btn-hibrido'),
    
};

// ─── Control de Pantallas ────────────────────────────────────────────────────
export function showChat() {
    $.loginScreen.classList.add('hidden');
}

export function showLogin() {
    $.loginScreen.classList.remove('hidden');
}

export function setEngineUI(engine) {
    if (engine === 'gemini') {
        $.btnGemini.classList.add('active-gemini');
        $.btnOpenai.classList.remove('active-openai');
        $.btnHibrido.classList.remove('active-hibrido');
        updateVoiceSelector('gemini');
    } else if (engine === 'openai') {
        $.btnGemini.classList.remove('active-gemini');
        $.btnOpenai.classList.add('active-openai');
        $.btnHibrido.classList.remove('active-hibrido');
        updateVoiceSelector('openai');
    } else if (engine === 'hibrido') {
        $.btnGemini.classList.remove('active-gemini');
        $.btnOpenai.classList.remove('active-openai');
        $.btnHibrido.classList.add('active-hibrido');
        updateVoiceSelector('hibrido');
    }
}

export function updateVoiceSelector(engine) {
    const voices = {
        gemini: [
            { value: 'Kore', text: 'Voz: Kore (Default)' },
            { value: 'Aoede', text: 'Voz: Aoede' },
            { value: 'Charon', text: 'Voz: Charon' },
            { value: 'Fenrir', text: 'Voz: Fenrir' },
            { value: 'Puck', text: 'Voz: Puck' }
        ],
        openai: [
            { value: 'alloy', text: 'Voz: Alloy (Default)' },
            { value: 'echo', text: 'Voz: Echo' },
            { value: 'shimmer', text: 'Voz: Shimmer' },
            { value: 'ash', text: 'Voz: Ash' },
            { value: 'ballad', text: 'Voz: Ballad' },
            { value: 'coral', text: 'Voz: Coral' },
            { value: 'sage', text: 'Voz: Sage' },
            { value: 'verse', text: 'Voz: Verse' }
        ],
        hibrido: [
           
        ]
    };

    const options = voices[engine] || voices.gemini;
    $.voiceSelect.innerHTML = options.map(v => `<option value="${v.value}">${v.text}</option>`).join('');
}

// ─── Mensajes en el chat ──────────────────────────────────────────────────────
/**
 * Agrega un mensaje al chat.
 * @param {'user'|'ai'} role
 * @param {string} text  - puede ser HTML o markdown
 * @param {string|null} id - si se pasa, se puede actualizar luego con updateMessage()
 */
export function addMessage(role, text, id = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    if (id) msgDiv.id = `msg-${id}`;

    const icon = role === 'user' ? 'user' : 'bot';

    const formattedText = parseMarkdown(text);

    let tokenHtml = '';
    if (role === 'ai' && id) {
        tokenHtml = `
            <div class="msg-token-counter" id="tokens-${id}" style="font-size: 10px; color: #888; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 4px; display: none;">
                <span><i data-lucide="chevron-up" class="ic-green" style="width: 10px; height: 10px;"></i> <strong class="t-in">0</strong></span> |
                <span><i data-lucide="chevron-down" class="ic-red" style="width: 10px; height: 10px;"></i> <strong class="t-out">0</strong></span> |
                <span><i data-lucide="activity" class="ic-white" style="width: 10px; height: 10px;"></i> <strong class="t-total">0</strong> <strong>(<span class="t-cost">$0.00</span>)</strong></span>
            </div>
        `;
    }

    msgDiv.innerHTML = `
        <div class="avatar"><i data-lucide="${icon}" class="ic-white"></i></div>
        <div class="bubble">
            <div class="text-content">${formattedText}</div>
            ${tokenHtml}
        </div>
    `;

    $.chatContainer.appendChild(msgDiv);
    if (window.lucide) lucide.createIcons();
    $.chatContainer.scrollTo({ top: $.chatContainer.scrollHeight, behavior: 'smooth' });
}

/**
 * Actualiza el contenido de un mensaje existente por su id temporal.
 * @param {string} id
 * @param {string} html - contenido HTML final
 */
export function updateMessage(id, text) {
    const msgDiv = document.getElementById(`msg-${id}`);
    if (msgDiv) {
        msgDiv.querySelector('.text-content').innerHTML = parseMarkdown(text);
        if (window.lucide) lucide.createIcons();
    }
}

export function showVoiceOverlay() {
    $.micBtn.classList.add('voice-active');
}

export function hideVoiceOverlay() {
    $.micBtn.classList.remove('voice-active');
}

// ─── Silenciar botón ─────────────────────────────────────────────────────────
export function setMicMuted(muted) {
    if (muted) {
        $.micIcon.setAttribute('data-lucide', 'play');
    } else {
        $.micIcon.setAttribute('data-lucide', 'pause');
    }
    if (window.lucide) lucide.createIcons();
}

// ─── Contador de tokens ──────────────────────────────────────────────────────
/**
 * Actualiza el contador de tokens y costos.
 * @param {number} tokensIn
 * @param {number} tokensOut
 * @param {number} costoIn
 * @param {number} costoOut
 * @param {number} costoTotal
 * @param {string|null} messageId - si se pasa, actualiza el contador de ese mensaje. Si no, el global.
 */
export function updateTokenCounter(tokensIn, tokensOut, costoIn, costoOut, costoTotal, messageId = null) {
    if (messageId) {
        const container = document.getElementById(`tokens-${messageId}`);
        if (container) {
            container.style.display = 'block';
            container.querySelector('.t-in').innerText = tokensIn;
            container.querySelector('.t-out').innerText = tokensOut;
            container.querySelector('.t-total').innerText = tokensIn + tokensOut;
            container.querySelector('.t-cost').innerText = '$' + costoTotal.toFixed(6);
        }
    } else {
        $.tokenIn.innerText    = tokensIn;
        $.tokenOut.innerText   = tokensOut;
        $.tokenTotal.innerText = tokensIn + tokensOut;
        $.costIn.innerText     = '$' + costoIn.toFixed(6);
        $.costOut.innerText    = '$' + costoOut.toFixed(6);
        $.costTotal.innerText  = '$' + costoTotal.toFixed(6);
    }
}

// Inicialización inicial
if (window.lucide) lucide.createIcons();