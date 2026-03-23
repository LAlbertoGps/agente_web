// ============================================================================
// apis.js — Todas las llamadas a la API de RedGPS
//
// Uso en cualquier agente:
//   import { getTareasUsuario, crearTareaAPI, actualizarTareas, crearComentarioAPI } from './apis.js';
//
// Para cambiar credenciales o URLs, solo editas este archivo.
// ============================================================================

import { getCredentials } from './auth.js';

let BASE_URL = 'https://qaapi.service24gps.com/api/v1/onassistant';

function getRedGPSCredentials() {
    const creds = getCredentials();
    return {
        token: creds ? creds.token : 'Ybmc7/dSGdQlc5FfGiBqWtDp+vi6Zgff6GofvmtII04tpjGAyyrKYQ==',
        apikey: creds ? creds.redgpsKey : '1500251af10e18883f4da7041e357ed6'
    };
}

const CREDENCIALES_ACTIVOS ={
    apikey:"6024b79f2b985aa87539deb0bc0f80d4",
    token :"wBcWYNxVw+Z6UtWbX3ISxXQZ6GOA6BNBd3JII5clpjD0RoaGjWle8pe7UyufjOvI",
}

const CREDENCIALES_LICENCIAMIENTO ={
    apikey:"513c8028735a305ef4bc4e9847829813",
    token :"uUjqv3hJZ4x8in6Y5Jd3KKKdGoeHvHqXWLYHPWN1Uw7ocp2DXxUspg==I",
}

// Helper interno — hace el fetch y maneja errores de forma uniforme
async function postRedGPS(endpoint, body) {

    let credenciales = getRedGPSCredentials();

    if(endpoint === 'getReporteActivos' || endpoint === 'infoVehiculo' || endpoint === 'getRecorridoActivo'){
        credenciales = CREDENCIALES_ACTIVOS;
    }

    if(endpoint === 'getReporteLicenciamiento'){
        credenciales = CREDENCIALES_LICENCIAMIENTO;
    }

    if(endpoint === 'gettoken'){
        BASE_URL = 'https://qaapi.service24gps.com/api/v1';
    }else{
        BASE_URL = 'https://qaapi.service24gps.com/api/v1/onassistant';
    }

    console.log('📡 BASE_URL:', `${BASE_URL}/${endpoint}`);
    console.log('📡 credenciales:', credenciales);
    console.log('📡 body:', body);

    try {
        const response = await fetch(`${BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',   
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ...credenciales, ...body })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        return await response.json();

    } catch (error) {
        console.error(`❌ Error en /${endpoint}:`, error);
        return { error: `No se pudo conectar con RedGps (${endpoint}).` };
    }
}

// ── Funciones exportadas ──────────────────────────────────────────────────────

/**
 * Obtiene el token de redgps para realizar las apis
 * @param {*} username usuario de redgps
 * @param {*} password contraseña de redgps
 * @param {*} apikey apikey de redgps
 * @param {*} token token de redgps
 * @returns 
 */
export async function gettoken(username, password , token =""){
    console.log('📡 gettoken:', {username, password , token});
    return postRedGPS('gettoken', {username, password , token});
}



/**
 * Consulta y filtra tareas del usuario.
 * @param {Object} filtros - { solo, estado, prioridad, proceso, etapa, area, colaborador }
 */
export async function getTareasUsuario(filtros = {}) {
    console.log('📡 getTareas:', filtros);
    return postRedGPS('getTareas', filtros);
}

/**
 * Actualiza estado, prioridad o título de una tarea.
 * @param {string} idTarea
 * @param {string} estado
 * @param {string} prioridad
 * @param {string} titulo
 */
export async function actualizarTareas(idTarea, estado, prioridad, titulo) {
    console.log('📡 actualizarTareas:', idTarea);
    return postRedGPS('editarTarea', { idTarea, estado, prioridad, titulo });
}

/**
 * Crea una nueva tarea con los argumentos que el LLM recopiló.
 * @param {Object} args - { titulo, descripcion, proceso, fecha_inicio, fecha_fin, ... }
 */
export async function crearTareaAPI(args) {
    console.log('📡 crearTarea:', args.titulo);
    return postRedGPS('crearTarea', args);
}

/**
 * Agrega un comentario a una tarea existente.
 * @param {Object} args - { idtarea, detalle, idproceso, idproceso_etapa }
 */
export async function crearComentarioAPI(args) {
    console.log('📡 crearComentario:', args.idtarea);
    return postRedGPS('crearComentario', {
        idtarea: args.idtarea,
        detalle: args.detalle,
        idproceso: args.idproceso || 0,
        idproceso_etapa: args.idproceso_etapa || 0
    });
}

// ─── Herramientas de Monitoreo ──────────────────────────────────────────────

/**
 * Obtiene el reporte general de activos (reportando / no reportando).
 * @returns {Promise<Object>} respuesta de RedGPS
 */
export async function getReporteActivos() {
    console.log('📡 getReporteActivos:');
    return postRedGPS('getReporteActivos', {});
}

/**
 * Obtiene información de un vehículo específico.
 * @param {Object} args - { placa }
 */
export async function infoVehiculo(args) {
    console.log('📡 infoVehiculo:', args);
    return postRedGPS('infoVehiculo', {
        placa: args.placa,
    });
}

/**
 * Obtiene el recorrido activo de un vehículo específico.
 * @param {Object} args - { placa }
 */
export async function getRecorridoActivo(args = {}) {
    console.log('📡 getRecorridoActivo:', args);
    return postRedGPS('getRecorridoActivo', {
        placa: args.placa
    });
}

// ─── Herramientas de Facturacion ──────────────────────────────────────────────

/**
 * Obtiene el reporte de facturación con clientes que tienen facturas vencidas.
 * @returns {Promise<Object>} respuesta de RedGPS
 */

export async function getReporteFacturacion() {
    console.log('📡 getReporteFacturacion:');
    return postRedGPS('getReporteFacturacion', {});
}

/**
 * Obtiene las facturas de un cliente específico (ultimas 4max).
 * @param {Object} args - { cliente }
 */
export async function getFacturasCliente(args = {}) {
    console.log('📡 getFacturasCliente:', args);
    return postRedGPS('getFacturasCliente', {
        cliente: args.cliente
    });
}

// ─── Herramientas de Licenciamiento ──────────────────────────────────────────────

/**
 * Obtiene el reporte de licenciamiento con clientes que tienen facturas vencidas.
 * @returns {Promise<Object>} respuesta de RedGPS
 */

export async function getReporteLicenciamiento() {
    console.log('📡 getReporteLicenciamiento:');
    return postRedGPS('getReporteLicenciamiento', {});
}

/**
 * Obtiene las facturas de un cliente específico (ultimas 4max).
 * @param {Object} args - { cliente }
 */
export async function getLicenciamientoByCliente(args = {}) {
    console.log('📡 getLicenciamientoByCliente:', args);
    return postRedGPS('getLicenciamientoByCliente', {
        cliente: args.cliente
    });
}

/**
 * Despachador genérico — recibe el nombre de la herramienta y sus args.
 * Usado por ambos agentes para no repetir el bloque if/else.
 * @param {string} nombre - nombre de la función
 * @param {Object} args   - argumentos del LLM
 * @returns {Promise<Object>} resultado de la API
 */
export async function ejecutarHerramienta(nombre, args) {
    switch (nombre) {
        case 'getTareas':
            return getTareasUsuario(args);
        case 'actualizarTareas':
            return actualizarTareas(args.idTarea, args.estado, args.prioridad, args.titulo);
        case 'crearTarea':
            return crearTareaAPI(args);
        case 'crearComentario':
            return crearComentarioAPI(args);
        case 'getReporteActivos':
            return getReporteActivos();
        case 'infoVehiculo':
            return infoVehiculo(args);
        case 'getRecorridoActivo':
            return getRecorridoActivo(args);
        case 'getReporteFacturacion':
            return getReporteFacturacion();
        case 'getFacturasCliente':
            return getFacturasCliente(args);
        case 'getReporteLicenciamiento':
            return getReporteLicenciamiento();
        case 'getLicenciamientoByCliente':
            return getLicenciamientoByCliente(args);
        case 'gettoken':
            return gettoken(args.username, args.password, args.apikey, args.token);
        default:
            console.warn('⚠️ Herramienta desconocida:', nombre);
            return { error: `Herramienta "${nombre}" no reconocida.` };
    } 
}