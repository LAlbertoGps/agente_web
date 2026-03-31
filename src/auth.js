// ============================================================================
// auth.js — Manejo de credenciales en localStorage
// ============================================================================

const STORAGE_KEY = 'redgps_assistant_auth';

/**
 * Guarda las credenciales en localStorage
 * @param {Object} credentials - { username, password, geminiKey, redgpsKey }
 */
export function saveCredentials(credentials) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
}

/**
 * Obtiene las credenciales guardadas
 * @returns {Object|null}
 */
export function getCredentials() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
}

/**
 * Elimina las credenciales (logout)
 */
export function clearCredentials() {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Verifica si hay credenciales guardadas
 * @returns {boolean}
 */
export function hasCredentials() {
    const creds = getCredentials();
    return !!(creds && (creds.geminiKey || creds.openaiKey) && creds.redgpsKey);
}
