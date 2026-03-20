// ============================================================================
// prompt.js — Lee base.md y construye el system prompt final
//
// Uso en cualquier agente:
//   import { getSystemPrompt } from './prompt.js';
//   const prompt = await getSystemPrompt();
// ============================================================================

// Importa el contenido de base.md como string (Vite lo soporta nativamente)
import basePrompt from './prompts/base.md?raw';

/**
 * Retorna el system prompt completo con la fecha/hora actual inyectada.
 * Se llama una vez al iniciar cada sesión para tener la fecha fresca.
 */
export function getSystemPrompt() {
    const ahora = new Date();
    const fechaActual = ahora.toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });

    // Agrega la fecha al inicio del prompt base
    const contextoTemporal = `[SISTEMA] Fecha/Hora actual: ${fechaActual}. Calcula fechas relativas ("hoy", "mañana") basándote en esta. Usa siempre formato 'YYYY-MM-DD HH:MM:SS' en las herramientas.\n\n`;

    return contextoTemporal + basePrompt;
}

/**
 * Definición de herramientas compartida — formato OpenAI-compatible.
 * Gemini las convierte a su formato internamente con el SDK.
 */
export const herramientas = [
    {
        type: 'function',
        function: {
            name: 'getTareas',
            description: 'Consulta y filtra las tareas del usuario. Pasa los nombres tal cual, el backend resuelve los IDs.',
            parameters: {
                type: 'object',
                properties: {
                    solo: { type: 'number', description: '1 = solo tareas asignadas al usuario actual.' },
                    estado: { type: 'string', description: "Ej: 'Nueva, Pendiente'. Valores: Nueva, Pendiente, En proceso, Vencida, Cancelada, Finalizada" },
                    prioridad: { type: 'string', description: "Ej: 'Alta, Crítica'. Valores: Baja, Media, Alta, Crítica" },
                    proceso: { type: 'string', description: 'Nombre del proceso.' },
                    etapa: { type: 'string', description: 'Nombre de la etapa.' },
                    area: { type: 'string', description: 'Nombre del área.' },
                    colaborador: { type: 'string', description: 'Nombre del colaborador.' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'actualizarTareas',
            description: 'Actualiza estado o prioridad de una tarea. SIEMPRE pedir confirmación antes.',
            parameters: {
                type: 'object',
                properties: {
                    idTarea: { type: 'string', description: 'ID único de la tarea.' },
                    estado: { type: 'string', description: 'Nuevo estado.' },
                    prioridad: { type: 'string', description: 'Nueva prioridad.' },
                    titulo: { type: 'string', description: 'Nuevo título.' }
                },
                required: ['idTarea']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'crearTarea',
            description: 'Crea una nueva tarea. Pedir título y descripción antes de llamar.',
            parameters: {
                type: 'object',
                properties: {
                    titulo: { type: 'string', description: 'Título de la tarea.' },
                    descripcion: { type: 'string', description: 'Descripción detallada.' },
                    proceso: { type: 'string', description: 'Si lo envías, también envía fecha_inicio y fecha_fin.' },
                    fecha_inicio: { type: 'string', description: "Formato: 'YYYY-MM-DD HH:MM:SS'" },
                    fecha_fin: { type: 'string', description: "Formato: 'YYYY-MM-DD HH:MM:SS'" },
                    colaboradores: { type: 'string', description: 'Nombres separados por coma.' },
                    clientes: { type: 'string', description: 'Nombres de clientes.' },
                    plataformas: { type: 'string', description: 'Nombres de plataformas.' },
                    area: { type: 'string', description: 'Nombre del área.' },
                    prioridad: { type: 'string', description: 'Baja, Media, Alta, Critica.' }
                },
                required: ['titulo', 'descripcion']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'crearComentario',
            description: 'Agrega un comentario a una tarea existente.',
            parameters: {
                type: 'object',
                properties: {
                    idtarea: { type: 'number', description: 'ID de la tarea.' },
                    detalle: { type: 'string', description: 'Texto del comentario.' },
                    idproceso: { type: 'number', description: 'ID del proceso. Si no lo tienes, envía 0.' },
                    idproceso_etapa: { type: 'number', description: 'ID de la etapa. Si no lo tienes, envía 0.' }
                },
                required: ['idtarea', 'detalle']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getReporteActivos',
            description: 'Obtiene el reporte general de activos (reportando / no reportando).',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'infoVehiculo',
            description: 'Obtiene información de un vehículo específico.',
            parameters: {
                type: 'object',
                properties: {
                    placa: { type: 'string', description: 'Placa del vehículo.' }
                },
                required: ['placa']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getRecorridoActivo',
            description: 'Obtiene el recorrido activo de un vehículo específico.',
            parameters: {
                type: 'object',
                properties: {
                    placa: { type: 'string', description: 'Placa del vehículo.' }
                },
                required: ['placa']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getReporteFacturacion',
            description: 'Obtiene el reporte general de facturación con clientes que tienen facturas vencidas.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getFacturasCliente',
            description: 'Obtiene las facturas de un cliente específico (ultimas 4max).',
            parameters: {
                type: 'object',
                properties: {
                    cliente: { type: 'string', description: 'Nombre del cliente.' }
                },
                required: ['cliente']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getReporteLicenciamiento',
            description: 'Obtiene el reporte general de licenciamiento con clientes que tienen facturas vencidas.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getLicenciamientoByCliente',
            description: 'Obtiene las facturas de un cliente específico (ultimas 4max).',
            parameters: {
                type: 'object',
                properties: {
                    cliente: { type: 'string', description: 'Nombre del cliente.' }
                },
                required: ['cliente']
            }
        }
    }
];

/**
 * Formato de herramientas para Gemini SDK
 * El SDK de Google usa functionDeclarations en lugar del formato OpenAI
 */
export const herramientasGemini = [{
    functionDeclarations: herramientas.map(h => ({
        name: h.function.name,
        description: h.function.description,
        parameters: {
            type: 'OBJECT',
            properties: Object.fromEntries(
                Object.entries(h.function.parameters.properties).map(([k, v]) => [
                    k, { type: v.type.toUpperCase(), description: v.description }
                ])
            ),
            required: h.function.parameters.required
        }
    }))
}];