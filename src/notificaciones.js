import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, onChildAdded, update } from "firebase/database";
import { getCredentials } from "./auth.js";

// Credenciales de tu Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBVmYf9tGXtg3-PCw4RGiLh5M0OWA5zBbo",
    authDomain: "ia-websockets.firebaseapp.com",
    projectId: "ia-websockets",
    storageBucket: "ia-websockets.firebasestorage.app",
    messagingSenderId: "287927894401",
    appId: "1:287927894401:web:611414e7ac16eb4c27a880"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 1. Enviar notificación al crear tarea
export function enviarNotificacionTarea(destinatario, titulo, descripcion) {
    const creador = getCredentials()?.username || "Sistema";
    const notificacionesRef = ref(db, 'notificaciones');
    
    push(notificacionesRef, {
        para: destinatario,
        creador: creador,
        titulo: titulo,
        descripcion: descripcion,
        leido: false,
        timestamp: Date.now()
    });
}

// 2. Escuchar notificaciones entrantes en tiempo real
export function iniciarEscuchaNotificaciones() {
    const miUsuario = getCredentials()?.username;
    if (!miUsuario) return;

    const notificacionesRef = ref(db, 'notificaciones');
    
    // Escucha cada vez que se añade una nueva notificación
    onChildAdded(notificacionesRef, (snapshot) => {
        const id = snapshot.key;
        const data = snapshot.val();
        
        // Si es para mí, no está leída y es reciente (ej. últimos 30 segundos)
        if (data.para === miUsuario && !data.leido && (Date.now() - data.timestamp < 30000)) {
            // Marcar como leída inmediatamente para que no se repita
            const updates = {};
            updates[`/notificaciones/${id}/leido`] = true;
            update(ref(db), updates);

            // Hablar
            reproducirNotificacionVoz(data);
        }
    });
}

// 3. Sintesis de voz nativa del navegador
function reproducirNotificacionVoz(data) {
    const mensaje = `Hola. ${data.creador} te ha asignado una nueva tarea: ${data.titulo}. El resumen es: ${data.descripcion}`;
    
    const utterance = new SpeechSynthesisUtterance(mensaje);
    utterance.lang = 'es-MX';
    utterance.rate = 0.95; // Un poco más lento para que sea claro
    
    window.speechSynthesis.speak(utterance);
}