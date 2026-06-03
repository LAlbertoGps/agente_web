// ============================================================================
// firebase.js — Inicialización de Firebase y Gestión de Notificaciones en Tiempo Real
// ============================================================================

import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onChildAdded, update } from "firebase/database";
import { getCredentials } from "./auth.js";
import { addMessage } from "./ui.js";

// Configuración de Firebase provista por el usuario
const firebaseConfig = {
  apiKey: "AIzaSyBVmYf9tGXtg3-PCw4RGiLh5M0OWA5zBbo",
  authDomain: "ia-websockets.firebaseapp.com",
  databaseURL: "https://ia-websockets-default-rtdb.firebaseio.com",
  projectId: "ia-websockets",
  storageBucket: "ia-websockets.firebasestorage.app",
  messagingSenderId: "287927894401",
  appId: "1:287927894401:web:611414e7ac16eb4c27a880"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/**
 * Registra y envía una notificación en Firebase cuando se crea una tarea
 * @param {string} destinatarios - nombres de los colaboradores (pueden ser separados por coma)
 * @param {string} titulo - título de la tarea
 * @param {string} descripcion - descripción de la tarea
 */
export function enviarNotificacionTarea(destinatarios, titulo, descripcion) {
    if (!destinatarios) {
        console.warn("⚠️ No se puede enviar notificación: destinatario vacío.");
        return;
    }
    
    const creador = getCredentials()?.username || "Sistema";
    const notificacionesRef = ref(db, 'notificaciones');

    // Separar destinatarios por coma si hay múltiples colaboradores
    const listaDestinatarios = destinatarios.split(',').map(name => name.trim()).filter(Boolean);

    listaDestinatarios.forEach(destinatario => {
        console.log(`📤 Enviando notificación en tiempo real para: ${destinatario}`);
        push(notificacionesRef, {
            para: destinatario,
            creador: creador,
            titulo: titulo,
            descripcion: descripcion,
            leido: false,
            timestamp: Date.now()
        });
    });
}

// Diccionario de equivalencias: "nombre_natural": "username_redgps"
const MAPA_COLABORADORES = {
  "pedro": "pdelgado",
  "pedro delgado": "pdelgado",
  "luis alberto": "luis_alberto",
  "juan": "juan.martinez",
  "diego": "diego_redgps"
};

// Bandera para asegurar que la escucha solo se inicialice una vez
let escuchaActiva = false;

/**
 * Inicia la escucha de notificaciones en tiempo real dirigidas al usuario actual
 */
export function iniciarEscuchaNotificaciones() {
    if (escuchaActiva) return;

    const creds = getCredentials();
    const miUsuario = creds?.username?.trim().toLowerCase();
    if (!miUsuario) {
        console.warn("⚠️ No se puede iniciar la escucha de notificaciones sin usuario autenticado.");
        return;
    }

    console.log(`🔔 Iniciando escucha de notificaciones para el usuario: ${miUsuario}`);
    escuchaActiva = true;
    
    const notificacionesRef = ref(db, 'notificaciones');
    
    // Escuchar cada nueva notificación añadida
    onChildAdded(notificacionesRef, (snapshot) => {
        const id = snapshot.key;
        const data = snapshot.val();
        
        console.log("👀 Firebase onChildAdded detectó un registro:", data);
        
        // Traducir nombre natural a username usando el mapa, si no existe usa el nombre tal cual
        const destinatarioNatural = data.para ? data.para.trim().toLowerCase() : "";
        const usernameDestinatario = MAPA_COLABORADORES[destinatarioNatural] || destinatarioNatural;

        // Validar si la notificación es para mí, no está leída, y es reciente (últimos 30 segundos)
        const esParaMi = usernameDestinatario === miUsuario;
        const diferenciaTiempo = Date.now() - data.timestamp;
        const esReciente = diferenciaTiempo < 30000; // 30 segundos

        console.log(`🔍 Evaluación para ${miUsuario}: esParaMi=${esParaMi}, leido=${data.leido}, diferenciaTiempo=${diferenciaTiempo}ms, esReciente=${esReciente}`);

        if (esParaMi && !data.leido && esReciente) {
            console.log(`📥 ¡Notificación aprobada y recibida! Procesando...`);
            
            // Marcar como leída en Firebase para evitar duplicidad
            const notifRef = ref(db, `notificaciones/${id}`);
            update(notifRef, { leido: true });

            // Mostrar visualmente en la burbuja del chat
            addMessage('ai', `🔔 **Nueva Tarea Asignada**\n\n**De:** ${data.creador}\n**Título:** ${data.titulo}\n**Descripción:** ${data.descripcion}`);

            // Hablar por Text-to-Speech
            reproducirNotificacionVoz(data);
        }
    });
}

function reproducirNotificacionVoz(data) {
    if (!('speechSynthesis' in window)) {
        console.warn("⚠️ Síntesis de voz no soportada en este navegador.");
        return;
    }

    const mensaje = `Hola. ${data.creador} te ha asignado una nueva tarea: ${data.titulo}. El resumen es: ${data.descripcion}`;
    console.log("🔊 Intentando hablar:", mensaje);
    
    const utterance = new SpeechSynthesisUtterance(mensaje);
    utterance.lang = 'es-MX';
    utterance.rate = 0.95; // Velocidad pausada

    // Callbacks de depuración
    utterance.onstart = () => console.log("🔊 Síntesis de voz: INICIADA");
    utterance.onend = () => console.log("🔊 Síntesis de voz: FINALIZADA");
    utterance.onerror = (e) => console.error("❌ Síntesis de voz ERROR:", e.error, e);

    try {
        window.speechSynthesis.speak(utterance);
        console.log("🔊 Comando speechSynthesis.speak enviado al navegador.");
    } catch (err) {
        console.error("❌ Excepción al usar speechSynthesis.speak:", err);
    }
}
