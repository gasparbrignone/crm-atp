/**
 * Seed de Fase 0 — carga el catálogo de permisos, los 4 roles base
 * (Administrador, Coordinador, Militante, Lectura) y la matriz de permisos
 * por rol, exactamente como se documenta en /10-usuarios-roles-permisos.md
 * secciones 3, 4 y 5. No crea usuarios (ver scripts/create-admin-user.ts).
 *
 * Uso: npm run prisma:seed
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Catálogo completo de permisos — /10-usuarios-roles-permisos.md sección 4.
const PERMISOS: { codigo: string; modulo: string; descripcion: string }[] = [
  { codigo: "personas.ver", modulo: "personas", descripcion: "Ver fichas de personas" },
  { codigo: "personas.crear", modulo: "personas", descripcion: "Crear fichas de personas" },
  { codigo: "personas.editar", modulo: "personas", descripcion: "Editar fichas de personas" },
  { codigo: "personas.archivar", modulo: "personas", descripcion: "Archivar fichas de personas" },
  {
    codigo: "personas.fusionar_duplicados",
    modulo: "personas",
    descripcion: "Fusionar fichas de personas duplicadas",
  },
  { codigo: "personas.exportar", modulo: "personas", descripcion: "Exportar datos de personas" },

  { codigo: "actividades.ver", modulo: "actividades", descripcion: "Ver actividades" },
  { codigo: "actividades.crear", modulo: "actividades", descripcion: "Crear actividades" },
  { codigo: "actividades.editar", modulo: "actividades", descripcion: "Editar actividades" },
  { codigo: "actividades.eliminar", modulo: "actividades", descripcion: "Eliminar actividades" },
  {
    codigo: "actividades.gestionar_todas",
    modulo: "actividades",
    descripcion: "Gestionar actividades de cualquier responsable",
  },

  {
    codigo: "participaciones.gestionar",
    modulo: "participaciones",
    descripcion: "Gestionar participaciones",
  },
  {
    codigo: "participaciones.gestionar_masivo",
    modulo: "participaciones",
    descripcion: "Gestionar participaciones de forma masiva",
  },

  { codigo: "punteo.ver_propio", modulo: "punteo", descripcion: "Ver el propio punteo" },
  { codigo: "punteo.ver_todos", modulo: "punteo", descripcion: "Ver el punteo de todos los usuarios" },
  {
    codigo: "punteo.exportar_propio",
    modulo: "punteo",
    descripcion: "Exportar el propio punteo",
  },
  {
    codigo: "punteo.exportar_todos",
    modulo: "punteo",
    descripcion: "Exportar el punteo de todos los usuarios",
  },

  { codigo: "padron.ver", modulo: "padron", descripcion: "Ver padrones electorales" },
  { codigo: "padron.importar", modulo: "padron", descripcion: "Importar padrones electorales" },
  { codigo: "padron.gestionar", modulo: "padron", descripcion: "Gestionar padrones electorales" },
  { codigo: "padron.exportar", modulo: "padron", descripcion: "Exportar padrones electorales" },

  { codigo: "usuarios.ver", modulo: "usuarios", descripcion: "Ver usuarios del sistema" },
  { codigo: "usuarios.gestionar", modulo: "usuarios", descripcion: "Gestionar usuarios del sistema" },
  { codigo: "roles.gestionar", modulo: "usuarios", descripcion: "Gestionar roles y permisos" },

  { codigo: "dashboard.ver_personal", modulo: "dashboard", descripcion: "Ver dashboard personal" },
  {
    codigo: "dashboard.ver_administrativo",
    modulo: "dashboard",
    descripcion: "Ver dashboard administrativo",
  },

  { codigo: "buscador.usar", modulo: "buscador", descripcion: "Usar el buscador global" },

  {
    codigo: "notificaciones.gestionar_reglas",
    modulo: "notificaciones",
    descripcion: "Crear y editar reglas de notificación automática",
  },

  {
    codigo: "importaciones.ejecutar",
    modulo: "importaciones",
    descripcion: "Ejecutar importaciones de datos",
  },
  {
    codigo: "exportaciones.ejecutar",
    modulo: "exportaciones",
    descripcion: "Ejecutar exportaciones de datos",
  },

  { codigo: "ia.usar_chatbot", modulo: "ia", descripcion: "Usar el chatbot de IA" },
  {
    codigo: "ia.gestionar_duplicados",
    modulo: "ia",
    descripcion: "Gestionar detección de duplicados por IA",
  },
  { codigo: "ia.gestionar_insights", modulo: "ia", descripcion: "Gestionar insights de IA" },

  { codigo: "auditoria.ver", modulo: "auditoria", descripcion: "Ver auditoría del sistema" },

  {
    codigo: "configuracion.gestionar",
    modulo: "configuracion",
    descripcion: "Gestionar configuración del sistema",
  },
];

// Roles base del sistema — /10-usuarios-roles-permisos.md sección 3.
const ROLES = [
  { nombre: "Administrador", descripcion: "Conducción de la organización — acceso total" },
  {
    nombre: "Coordinador",
    descripcion: "Responsable de un área o de actividades específicas",
  },
  { nombre: "Militante", descripcion: "Miembro de base — el perfil más numeroso" },
  { nombre: "Lectura", descripcion: "Perfil de solo consulta, sin capacidad de edición" },
] as const;

// Matriz de permisos por rol base — /10-usuarios-roles-permisos.md sección 5.
// El marcador ✓* ("solo sobre recursos propios") es una regla que se aplica en
// la capa de servicios (lib/servicios/*), no en la asignación de RolPermiso:
// acá se otorga el permiso base y el alcance "propio" se filtra en runtime.
const MATRIZ_PERMISOS_POR_ROL: Record<(typeof ROLES)[number]["nombre"], string[]> = {
  Administrador: PERMISOS.map((p) => p.codigo), // acceso total
  Coordinador: [
    "personas.ver",
    "personas.crear",
    "personas.editar",
    "personas.archivar",
    "personas.fusionar_duplicados",
    "personas.exportar",
    "actividades.ver",
    "actividades.crear",
    "actividades.editar",
    "actividades.eliminar",
    "actividades.gestionar_todas",
    "participaciones.gestionar",
    "participaciones.gestionar_masivo",
    "punteo.ver_propio",
    "punteo.exportar_propio",
    "padron.ver",
    "dashboard.ver_personal",
    "dashboard.ver_administrativo",
    "buscador.usar",
    "importaciones.ejecutar",
    "exportaciones.ejecutar",
    "ia.usar_chatbot",
    "ia.gestionar_duplicados",
  ],
  Militante: [
    "personas.ver",
    "personas.crear",
    "personas.editar",
    "actividades.ver",
    "actividades.crear",
    "actividades.editar",
    "participaciones.gestionar",
    "punteo.ver_propio",
    "punteo.exportar_propio",
    "padron.ver",
    "dashboard.ver_personal",
    "buscador.usar",
    "exportaciones.ejecutar",
    "ia.usar_chatbot",
  ],
  Lectura: ["personas.ver", "actividades.ver", "padron.ver", "buscador.usar"],
};

// Catálogo inicial de Carrera — supuesto S1 de /01-vision-alcance.md sección 9:
// lista de referencia editable desde Configuración, no cerrada. ATP puede
// agregar/desactivar carreras sin tocar código.
const CARRERAS = [
  { nombre: "Medicina", duracionAnios: 6, orden: 1 },
  { nombre: "Licenciatura en Enfermería", duracionAnios: 4, orden: 2 },
  { nombre: "Fonoaudiología", duracionAnios: 5, orden: 3 },
  { nombre: "Licenciatura en Terapia Ocupacional", duracionAnios: 4, orden: 4 },
] as const;

// Catálogo inicial de TipoActividad — /04-modelo-datos.md sección 4.2 y
// /06-modulo-actividades.md sección 2: catálogo administrable, no cerrado.
// Colores de referencia (paleta consistente con /19-ux-ui.md sección 2, colores
// semánticos con propósito, no decorativos) — reusables en calendario y dashboard.
const TIPOS_ACTIVIDAD = [
  { nombre: "Repaso", color: "#2563eb", orden: 1 },
  { nombre: "Grupo de estudio", color: "#0891b2", orden: 2 },
  { nombre: "Simulacro", color: "#7c3aed", orden: 3 },
  { nombre: "Congreso", color: "#b91c1c", orden: 4 },
  { nombre: "Capacitación", color: "#0f766e", orden: 5 },
  { nombre: "Charla", color: "#c2410c", orden: 6 },
  { nombre: "Jornada", color: "#a16207", orden: 7 },
] as const;

// Catálogo inicial de ClasificacionPunteo — /08-modulo-punteo-electoral.md
// sección 6: valores iniciales de referencia, taxonomía administrable (es una
// decisión política de la organización, no técnica), catálogo no cerrado.
const CLASIFICACIONES_PUNTEO = [
  { nombre: "Sin contactar", color: "#64748b", orden: 1 },
  { nombre: "Favorable", color: "#16a34a", orden: 2 },
  { nombre: "Indeciso", color: "#ca8a04", orden: 3 },
  { nombre: "Desfavorable", color: "#b91c1c", orden: 4 },
  { nombre: "No ubicable", color: "#78716c", orden: 5 },
] as const;

async function main() {
  console.log("Sembrando catálogo de carreras...");
  for (const carrera of CARRERAS) {
    await prisma.carrera.upsert({
      where: { nombre: carrera.nombre },
      update: {},
      create: carrera,
    });
  }

  console.log("Sembrando catálogo de tipos de actividad...");
  for (const tipo of TIPOS_ACTIVIDAD) {
    await prisma.tipoActividad.upsert({
      where: { nombre: tipo.nombre },
      update: {},
      create: tipo,
    });
  }

  console.log("Sembrando catálogo de clasificaciones de punteo...");
  for (const clasificacion of CLASIFICACIONES_PUNTEO) {
    await prisma.clasificacionPunteo.upsert({
      where: { nombre: clasificacion.nombre },
      update: {},
      create: clasificacion,
    });
  }

  console.log("Sembrando catálogo de permisos...");
  for (const permiso of PERMISOS) {
    await prisma.permiso.upsert({
      where: { codigo: permiso.codigo },
      update: { modulo: permiso.modulo, descripcion: permiso.descripcion },
      create: permiso,
    });
  }

  console.log("Sembrando roles base...");
  for (const rol of ROLES) {
    await prisma.rol.upsert({
      where: { nombre: rol.nombre },
      update: { descripcion: rol.descripcion, esRolSistema: true },
      create: { ...rol, esRolSistema: true },
    });
  }

  console.log("Sembrando matriz de permisos por rol...");
  for (const [nombreRol, codigosPermisos] of Object.entries(MATRIZ_PERMISOS_POR_ROL)) {
    const rol = await prisma.rol.findUniqueOrThrow({ where: { nombre: nombreRol } });
    for (const codigo of codigosPermisos) {
      const permiso = await prisma.permiso.findUniqueOrThrow({ where: { codigo } });
      await prisma.rolPermiso.upsert({
        where: { rolId_permisoId: { rolId: rol.id, permisoId: permiso.id } },
        update: {},
        create: { rolId: rol.id, permisoId: permiso.id },
      });
    }
  }

  // Umbral configurable de confianza para sugerencias de duplicados —
  // /15-ia.md sección 2.3 y /18-configuracion-sistema.md. Ajustable después
  // desde la UI de configuración (Fase 12) sin redeploy.
  //
  // Valor recalibrado el 2026-08-04 (era 0.7): desde ese día la confianza ya
  // no la calcula un LLM, la calcula el Motor de Resolución de Identidad
  // determinístico (lib/identidad/, ver motor-scoring.ts) — una escala de
  // puntaje distinta, calibrada empíricamente contra un benchmark sintético
  // (lib/identidad/BENCHMARK-RESULTADOS.md: 0.61 es el umbral óptimo medido
  // para F1 con precisión ~99%; se usa 0.65 acá, un poco por encima, para
  // dejar margen de seguridad sobre el techo de 0.6 que aplica la compuerta
  // determinística de nombre mínimo del motor — ver motor-scoring.ts). El
  // 0.7 anterior no tiene ningún significado en la escala nueva, no era
  // "conservador", era simplemente el número de otra escala.
  console.log("Sembrando configuración del sistema...");
  await prisma.configuracionSistema.upsert({
    where: { clave: "umbral_confianza_duplicados" },
    update: {},
    create: {
      clave: "umbral_confianza_duplicados",
      valor: "0.65",
      descripcion:
        "Puntaje mínimo (0 a 1) para que el Motor de Resolución de Identidad (lib/identidad/) sugiera automáticamente una coincidencia como posible duplicado, o la vincule automáticamente en el caso de padrón.",
    },
  });

  // Límite de mensajes por conversación del chatbot — /15-ia.md sección 10:
  // salvaguarda operativa de costo, configurable sin redeploy.
  await prisma.configuracionSistema.upsert({
    where: { clave: "chatbot_max_mensajes_por_conversacion" },
    update: {},
    create: {
      clave: "chatbot_max_mensajes_por_conversacion",
      valor: "40",
      descripcion:
        "Cantidad máxima de mensajes (usuario + IA) permitidos en una misma conversación del chatbot, como salvaguarda de costo.",
    },
  });

  // Parámetros generales — /18-configuracion-sistema.md sección 8.
  console.log("Sembrando parámetros generales del sistema...");
  const PARAMETROS_GENERALES: { clave: string; valor: string; descripcion: string }[] = [
    {
      clave: "nombre_organizacion",
      valor: "ATP",
      descripcion: "Nombre de la organización, mostrado en la interfaz y en emails.",
    },
    {
      clave: "dias_retencion_notificaciones_leidas",
      valor: "30",
      descripcion:
        "Días tras los cuales una notificación leída deja de mostrarse en el panel (no se borra, se oculta; sigue disponible en el historial completo).",
    },
    {
      clave: "formato_export_default",
      valor: "csv",
      descripcion: "Formato preferido por defecto al exportar (csv o excel).",
    },
    {
      clave: "email_notificaciones_activo",
      valor: "false",
      descripcion:
        "Interruptor general de envío de emails de notificación (resumen/digest). Requiere RESEND_API_KEY configurada en el entorno para tener efecto.",
    },
    {
      clave: "dias_inactividad_punteo_recordatorio",
      valor: "30",
      descripcion:
        "Días sin actualizar el estado_seguimiento de un PunteoPersona antes de recordarle al usuario dueño que le dé seguimiento — /13-notificaciones.md sección 3.",
    },
  ];
  for (const parametro of PARAMETROS_GENERALES) {
    await prisma.configuracionSistema.upsert({
      where: { clave: parametro.clave },
      update: {},
      create: parametro,
    });
  }

  // Catálogo léxico del Motor de Resolución de Identidad —
  // PROPUESTA-REDISENO-DESDE-CERO-MATCHING-2026-08-05.md sección 6: valores
  // por defecto, editables desde la base sin tocar código (pedido explícito
  // de Gaspar de no hardcodear estas listas). Nombres compuestos frecuentes
  // en Argentina (para que el tokenizador no corte "José" de "Juan José"
  // como si fuera apellido) y partículas de apellido (para que "de la Cruz"
  // no se corte mal sin coma explícita en el texto original).
  console.log("Sembrando catálogo léxico de identidad (nombres compuestos y partículas)...");
  const NOMBRES_COMPUESTOS = [
    "juan jose",
    "juan ignacio",
    "juan cruz",
    "juan manuel",
    "juan pablo",
    "juan carlos",
    "juan martin",
    "jose maria",
    "jose luis",
    "jose antonio",
    "maria jose",
    "maria belen",
    "maria del carmen",
    "maria eugenia",
    "maria fernanda",
    "maria laura",
    "maria victoria",
    "maria sol",
    "maria emilia",
    "maria agustina",
    "maria paz",
    "ana paula",
    "ana clara",
    "ana maria",
    "ana laura",
    "luis alberto",
    "carlos alberto",
    "carlos alfredo",
    "franco nicolas",
    "nicolas gabriel",
  ];
  const PARTICULAS_APELLIDO = ["de la", "de los", "de las", "del", "de", "di", "van", "von", "mc", "mac"];

  for (const valor of NOMBRES_COMPUESTOS) {
    await prisma.lexicoNombrePropio.upsert({
      where: { tipo_valor: { tipo: "nombre_compuesto", valor } },
      update: {},
      create: { tipo: "nombre_compuesto", valor, origen: "seed" },
    });
  }
  for (const valor of PARTICULAS_APELLIDO) {
    await prisma.lexicoNombrePropio.upsert({
      where: { tipo_valor: { tipo: "particula_apellido", valor } },
      update: {},
      create: { tipo: "particula_apellido", valor, origen: "seed" },
    });
  }

  console.log("Seed de Fase 0 completado.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
