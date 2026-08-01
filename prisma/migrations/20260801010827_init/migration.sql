-- CreateEnum
CREATE TYPE "EstadoPadronPersona" AS ENUM ('no_evaluado', 'en_padron_habilitado', 'en_padron_no_habilitado', 'no_encontrado_en_padron');

-- CreateEnum
CREATE TYPE "EstadoFicha" AS ENUM ('activa', 'archivada', 'fusionada');

-- CreateEnum
CREATE TYPE "ModalidadActividad" AS ENUM ('presencial', 'virtual', 'hibrida');

-- CreateEnum
CREATE TYPE "EstadoActividad" AS ENUM ('planificada', 'en_curso', 'finalizada', 'cancelada');

-- CreateEnum
CREATE TYPE "EstadoParticipacion" AS ENUM ('inscripto', 'confirmado', 'asistio', 'ausente', 'cancelado');

-- CreateEnum
CREATE TYPE "EstadoSeguimientoPunteo" AS ENUM ('sin_iniciar', 'en_seguimiento', 'contactado', 'requiere_reintento', 'cerrado');

-- CreateEnum
CREATE TYPE "EstadoPadronElectoral" AS ENUM ('borrador', 'activo', 'cerrado');

-- CreateEnum
CREATE TYPE "EstadoMatchingPadron" AS ENUM ('pendiente', 'vinculado_automatico', 'vinculado_manual', 'sin_coincidencia');

-- CreateEnum
CREATE TYPE "AccionHistorial" AS ENUM ('crear', 'editar', 'archivar', 'restaurar', 'fusionar', 'exportar', 'importar', 'login', 'cambio_permiso', 'otro');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('informativa', 'accionable', 'alerta');

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('activo', 'inactivo');

-- CreateEnum
CREATE TYPE "TipoOrigenImport" AS ENUM ('google_sheets', 'csv', 'excel', 'pdf');

-- CreateEnum
CREATE TYPE "EntidadDestinoImport" AS ENUM ('Persona', 'PadronElectoral', 'Actividad');

-- CreateEnum
CREATE TYPE "EstadoImportJob" AS ENUM ('pendiente', 'procesando', 'en_revision', 'completado', 'completado_con_errores', 'fallido');

-- CreateEnum
CREATE TYPE "EntidadOrigenExport" AS ENUM ('Persona', 'Actividad', 'Participacion', 'PadronElectoral');

-- CreateEnum
CREATE TYPE "FormatoExport" AS ENUM ('csv', 'excel', 'pdf');

-- CreateEnum
CREATE TYPE "RolMensajeChatbot" AS ENUM ('usuario', 'asistente');

-- CreateTable
CREATE TABLE "Carrera" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "duracionAnios" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER,

    CONSTRAINT "Carrera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoActividad" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER,

    CONSTRAINT "TipoActividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "dni" TEXT,
    "legajo" TEXT,
    "carreraId" TEXT,
    "anio" INTEGER,
    "instagram" TEXT,
    "observacionesGenerales" TEXT,
    "estadoPadron" "EstadoPadronPersona" NOT NULL DEFAULT 'no_evaluado',
    "estadoFicha" "EstadoFicha" NOT NULL DEFAULT 'activa',
    "fusionadaEnId" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaModificacion" TIMESTAMP(3) NOT NULL,
    "creadoPorId" TEXT,
    "modificadoPorId" TEXT,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaTelefono" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,

    CONSTRAINT "PersonaTelefono_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaEmail" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PersonaEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Actividad" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoActividadId" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3),
    "modalidad" "ModalidadActividad" NOT NULL DEFAULT 'presencial',
    "lugar" TEXT,
    "cupoMaximo" INTEGER,
    "estado" "EstadoActividad" NOT NULL DEFAULT 'planificada',
    "responsableId" TEXT NOT NULL,
    "actividadPadreId" TEXT,
    "observaciones" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaModificacion" TIMESTAMP(3) NOT NULL,
    "creadoPorId" TEXT,
    "modificadoPorId" TEXT,

    CONSTRAINT "Actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participacion" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "estado" "EstadoParticipacion" NOT NULL DEFAULT 'inscripto',
    "fechaInscripcion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaAsistencia" TIMESTAMP(3),
    "observaciones" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaModificacion" TIMESTAMP(3) NOT NULL,
    "creadoPorId" TEXT,
    "modificadoPorId" TEXT,

    CONSTRAINT "Participacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Etiqueta" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT,
    "categoria" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" TEXT,

    CONSTRAINT "Etiqueta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaEtiqueta" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "etiquetaId" TEXT NOT NULL,
    "fechaAsignacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asignadoPorId" TEXT,

    CONSTRAINT "PersonaEtiqueta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "rolId" TEXT NOT NULL,
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'activo',
    "telefono" TEXT,
    "ultimoAcceso" TIMESTAMP(3),
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rol" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "esRolSistema" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permiso" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "Permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolPermiso" (
    "id" TEXT NOT NULL,
    "rolId" TEXT NOT NULL,
    "permisoId" TEXT NOT NULL,

    CONSTRAINT "RolPermiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClasificacionPunteo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT,
    "orden" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ClasificacionPunteo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunteoPersona" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "clasificacionId" TEXT,
    "estadoSeguimiento" "EstadoSeguimientoPunteo" NOT NULL DEFAULT 'sin_iniciar',
    "fechaUltimaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PunteoPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunteoComentario" (
    "id" TEXT NOT NULL,
    "punteoPersonaId" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PunteoComentario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadronElectoral" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaEleccion" DATE,
    "estado" "EstadoPadronElectoral" NOT NULL DEFAULT 'borrador',
    "archivoOrigenId" TEXT,
    "fechaCarga" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cargadoPorId" TEXT,

    CONSTRAINT "PadronElectoral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadronEntrada" (
    "id" TEXT NOT NULL,
    "padronElectoralId" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "nombreCompletoOriginal" TEXT NOT NULL,
    "carreraTextoOriginal" TEXT,
    "personaId" TEXT,
    "estadoMatching" "EstadoMatchingPadron" NOT NULL DEFAULT 'pendiente',
    "confianzaMatching" DECIMAL(3,2),

    CONSTRAINT "PadronEntrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialCambio" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" "AccionHistorial" NOT NULL,
    "campo" TEXT,
    "valorAnterior" TEXT,
    "valorNuevo" TEXT,
    "usuarioId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,

    CONSTRAINT "HistorialCambio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "entidadRelacionada" TEXT,
    "entidadRelacionadaId" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaLectura" TIMESTAMP(3),

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "tipoOrigen" "TipoOrigenImport" NOT NULL,
    "entidadDestino" "EntidadDestinoImport" NOT NULL,
    "estado" "EstadoImportJob" NOT NULL DEFAULT 'pendiente',
    "archivoOrigenId" TEXT,
    "totalFilas" INTEGER,
    "filasExitosas" INTEGER NOT NULL DEFAULT 0,
    "filasConError" INTEGER NOT NULL DEFAULT 0,
    "duplicadosDetectados" INTEGER NOT NULL DEFAULT 0,
    "usuarioId" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFin" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJobError" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "numeroFila" INTEGER NOT NULL,
    "contenidoOriginal" TEXT NOT NULL,
    "mensajeError" TEXT NOT NULL,

    CONSTRAINT "ImportJobError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "entidadOrigen" "EntidadOrigenExport" NOT NULL,
    "formato" "FormatoExport" NOT NULL,
    "filtrosAplicados" TEXT,
    "usuarioId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracionSistema" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "descripcion" TEXT,
    "modificadoPorId" TEXT,
    "fechaModificacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionSistema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotConversacion" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "titulo" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatbotConversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotMensaje" (
    "id" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "rol" "RolMensajeChatbot" NOT NULL,
    "contenido" TEXT NOT NULL,
    "consultasEjecutadas" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatbotMensaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Carrera_nombre_key" ON "Carrera"("nombre");

-- CreateIndex
CREATE INDEX "Carrera_activo_idx" ON "Carrera"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "TipoActividad_nombre_key" ON "TipoActividad"("nombre");

-- CreateIndex
CREATE INDEX "TipoActividad_activo_idx" ON "TipoActividad"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_dni_key" ON "Persona"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_legajo_key" ON "Persona"("legajo");

-- CreateIndex
CREATE INDEX "Persona_carreraId_anio_estadoPadron_idx" ON "Persona"("carreraId", "anio", "estadoPadron");

-- CreateIndex
CREATE INDEX "Persona_apellido_nombre_idx" ON "Persona"("apellido", "nombre");

-- CreateIndex
CREATE INDEX "PersonaTelefono_personaId_idx" ON "PersonaTelefono"("personaId");

-- CreateIndex
CREATE INDEX "PersonaEmail_personaId_idx" ON "PersonaEmail"("personaId");

-- CreateIndex
CREATE INDEX "Actividad_tipoActividadId_idx" ON "Actividad"("tipoActividadId");

-- CreateIndex
CREATE INDEX "Actividad_actividadPadreId_idx" ON "Actividad"("actividadPadreId");

-- CreateIndex
CREATE INDEX "Actividad_responsableId_idx" ON "Actividad"("responsableId");

-- CreateIndex
CREATE INDEX "Actividad_fechaInicio_idx" ON "Actividad"("fechaInicio");

-- CreateIndex
CREATE INDEX "Participacion_actividadId_idx" ON "Participacion"("actividadId");

-- CreateIndex
CREATE INDEX "Participacion_personaId_idx" ON "Participacion"("personaId");

-- CreateIndex
CREATE UNIQUE INDEX "Participacion_personaId_actividadId_key" ON "Participacion"("personaId", "actividadId");

-- CreateIndex
CREATE UNIQUE INDEX "Etiqueta_nombre_key" ON "Etiqueta"("nombre");

-- CreateIndex
CREATE INDEX "Etiqueta_activo_idx" ON "Etiqueta"("activo");

-- CreateIndex
CREATE INDEX "PersonaEtiqueta_etiquetaId_idx" ON "PersonaEtiqueta"("etiquetaId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaEtiqueta_personaId_etiquetaId_key" ON "PersonaEtiqueta"("personaId", "etiquetaId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_rolId_idx" ON "Usuario"("rolId");

-- CreateIndex
CREATE UNIQUE INDEX "Rol_nombre_key" ON "Rol"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Permiso_codigo_key" ON "Permiso"("codigo");

-- CreateIndex
CREATE INDEX "Permiso_modulo_idx" ON "Permiso"("modulo");

-- CreateIndex
CREATE INDEX "RolPermiso_permisoId_idx" ON "RolPermiso"("permisoId");

-- CreateIndex
CREATE UNIQUE INDEX "RolPermiso_rolId_permisoId_key" ON "RolPermiso"("rolId", "permisoId");

-- CreateIndex
CREATE UNIQUE INDEX "ClasificacionPunteo_nombre_key" ON "ClasificacionPunteo"("nombre");

-- CreateIndex
CREATE INDEX "ClasificacionPunteo_activo_idx" ON "ClasificacionPunteo"("activo");

-- CreateIndex
CREATE INDEX "PunteoPersona_usuarioId_personaId_idx" ON "PunteoPersona"("usuarioId", "personaId");

-- CreateIndex
CREATE INDEX "PunteoPersona_personaId_idx" ON "PunteoPersona"("personaId");

-- CreateIndex
CREATE UNIQUE INDEX "PunteoPersona_usuarioId_personaId_key" ON "PunteoPersona"("usuarioId", "personaId");

-- CreateIndex
CREATE INDEX "PunteoComentario_punteoPersonaId_idx" ON "PunteoComentario"("punteoPersonaId");

-- CreateIndex
CREATE INDEX "PadronElectoral_estado_idx" ON "PadronElectoral"("estado");

-- CreateIndex
CREATE INDEX "PadronEntrada_padronElectoralId_idx" ON "PadronEntrada"("padronElectoralId");

-- CreateIndex
CREATE INDEX "PadronEntrada_dni_idx" ON "PadronEntrada"("dni");

-- CreateIndex
CREATE INDEX "PadronEntrada_personaId_idx" ON "PadronEntrada"("personaId");

-- CreateIndex
CREATE INDEX "HistorialCambio_entidad_entidadId_fecha_idx" ON "HistorialCambio"("entidad", "entidadId", "fecha");

-- CreateIndex
CREATE INDEX "HistorialCambio_usuarioId_idx" ON "HistorialCambio"("usuarioId");

-- CreateIndex
CREATE INDEX "Notificacion_usuarioId_leida_idx" ON "Notificacion"("usuarioId", "leida");

-- CreateIndex
CREATE INDEX "ImportJob_usuarioId_idx" ON "ImportJob"("usuarioId");

-- CreateIndex
CREATE INDEX "ImportJob_estado_idx" ON "ImportJob"("estado");

-- CreateIndex
CREATE INDEX "ImportJobError_importJobId_idx" ON "ImportJobError"("importJobId");

-- CreateIndex
CREATE INDEX "ExportJob_usuarioId_idx" ON "ExportJob"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionSistema_clave_key" ON "ConfiguracionSistema"("clave");

-- CreateIndex
CREATE INDEX "ChatbotConversacion_usuarioId_idx" ON "ChatbotConversacion"("usuarioId");

-- CreateIndex
CREATE INDEX "ChatbotMensaje_conversacionId_idx" ON "ChatbotMensaje"("conversacionId");

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_carreraId_fkey" FOREIGN KEY ("carreraId") REFERENCES "Carrera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_fusionadaEnId_fkey" FOREIGN KEY ("fusionadaEnId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_modificadoPorId_fkey" FOREIGN KEY ("modificadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaTelefono" ADD CONSTRAINT "PersonaTelefono_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaEmail" ADD CONSTRAINT "PersonaEmail_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_tipoActividadId_fkey" FOREIGN KEY ("tipoActividadId") REFERENCES "TipoActividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_actividadPadreId_fkey" FOREIGN KEY ("actividadPadreId") REFERENCES "Actividad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_modificadoPorId_fkey" FOREIGN KEY ("modificadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participacion" ADD CONSTRAINT "Participacion_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participacion" ADD CONSTRAINT "Participacion_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participacion" ADD CONSTRAINT "Participacion_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participacion" ADD CONSTRAINT "Participacion_modificadoPorId_fkey" FOREIGN KEY ("modificadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaEtiqueta" ADD CONSTRAINT "PersonaEtiqueta_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaEtiqueta" ADD CONSTRAINT "PersonaEtiqueta_etiquetaId_fkey" FOREIGN KEY ("etiquetaId") REFERENCES "Etiqueta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaEtiqueta" ADD CONSTRAINT "PersonaEtiqueta_asignadoPorId_fkey" FOREIGN KEY ("asignadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolPermiso" ADD CONSTRAINT "RolPermiso_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolPermiso" ADD CONSTRAINT "RolPermiso_permisoId_fkey" FOREIGN KEY ("permisoId") REFERENCES "Permiso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunteoPersona" ADD CONSTRAINT "PunteoPersona_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunteoPersona" ADD CONSTRAINT "PunteoPersona_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunteoPersona" ADD CONSTRAINT "PunteoPersona_clasificacionId_fkey" FOREIGN KEY ("clasificacionId") REFERENCES "ClasificacionPunteo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunteoComentario" ADD CONSTRAINT "PunteoComentario_punteoPersonaId_fkey" FOREIGN KEY ("punteoPersonaId") REFERENCES "PunteoPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadronElectoral" ADD CONSTRAINT "PadronElectoral_cargadoPorId_fkey" FOREIGN KEY ("cargadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadronEntrada" ADD CONSTRAINT "PadronEntrada_padronElectoralId_fkey" FOREIGN KEY ("padronElectoralId") REFERENCES "PadronElectoral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadronEntrada" ADD CONSTRAINT "PadronEntrada_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialCambio" ADD CONSTRAINT "HistorialCambio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJobError" ADD CONSTRAINT "ImportJobError_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracionSistema" ADD CONSTRAINT "ConfiguracionSistema_modificadoPorId_fkey" FOREIGN KEY ("modificadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotConversacion" ADD CONSTRAINT "ChatbotConversacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotMensaje" ADD CONSTRAINT "ChatbotMensaje_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "ChatbotConversacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
