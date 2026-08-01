# Glosario

[← Índice general](./00-README.md)

Este documento define el **lenguaje ubicuo** del proyecto: los términos que se usan de forma consistente en toda la documentación, en el modelo de datos y, eventualmente, en el código y la interfaz. Cuando un documento usa uno de estos términos, se refiere exactamente a esta definición — no a un sinónimo aproximado.

Los términos están ordenados alfabéticamente. Donde corresponde, se indica el documento donde el concepto se desarrolla en profundidad.

## Índice rápido por letra

[A](#a) · [B](#b) · [C](#c) · [D](#d) · [E](#e) · [F](#f) · [H](#h) · [I](#i) · [M](#m) · [N](#n) · [P](#p) · [R](#r) · [S](#s) · [U](#u)

---

### A

**Actividad**
Evento organizado por la agrupación al que las Personas pueden inscribirse: repaso, grupo de estudio, simulacro, congreso, capacitación, charla, jornada u otro tipo definido en el catálogo `TipoActividad`. Ver [`06-modulo-actividades.md`](./06-modulo-actividades.md).

**Actividad padre / sub-actividad**
Relación opcional en la que una Actividad agrupa a otras (por ejemplo, una jornada de varios talleres). Ver [`06-modulo-actividades.md`](./06-modulo-actividades.md).

**Administrador**
Rol de usuario con acceso total al sistema, incluida la visibilidad de todos los punteos y la configuración global. Ver [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md).

**Auditoría**
Sistema de registro inmutable de acciones relevantes ejecutadas por usuarios sobre el sistema (quién hizo qué, cuándo). Distinto del Historial de cambios, aunque comparten mecanismo. Ver [`17-auditoria-historial.md`](./17-auditoria-historial.md).

### B

**Buscador global**
Componente de búsqueda unificada, accesible desde cualquier pantalla, que indexa Personas, Actividades y otros registros por múltiples campos simultáneamente. Ver [`12-buscador-global.md`](./12-buscador-global.md).

### C

**Carrera**
Catálogo administrable de carreras universitarias que cursan las Personas (por ejemplo, Medicina, Enfermería). No es un valor fijo en el código: se gestiona desde [`18-configuracion-sistema.md`](./18-configuracion-sistema.md).

**Clasificación (de punteo)**
Valor que un Usuario asigna a una Persona dentro de su propio punteo, indicando su percepción de afinidad (por ejemplo: favorable, indeciso, desfavorable, sin contactar). Es siempre un juicio humano, nunca inferido automáticamente por IA. Ver [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md).

**Coordinador**
Rol de usuario intermedio, con gestión sobre actividades y visibilidad estadística ampliada, pero sin acceso al punteo privado de otros usuarios salvo delegación explícita. Ver [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md).

### D

**Dashboard administrativo**
Panel de indicadores agregados de toda la organización, visible según permiso, no restringido a la actividad de un único usuario. Ver [`11-dashboards.md`](./11-dashboards.md).

**Dashboard personal**
Panel de indicadores centrado en la actividad de un Usuario individual: su punteo, sus actividades a cargo, sus pendientes. Ver [`11-dashboards.md`](./11-dashboards.md).

**Dato sensible**
En el marco de la Ley 25.326 argentina, dato personal que revela origen racial o étnico, opiniones políticas, convicciones religiosas, afiliación sindical o información de salud o vida sexual. La clasificación de punteo constituye un dato sensible bajo esta definición. Ver [`16-seguridad.md`](./16-seguridad.md).

**Duplicado**
Dos o más fichas de Persona que representan al mismo individuo real. El sistema los detecta de forma asistida por IA pero nunca los fusiona sin confirmación humana. Ver [`15-ia.md`](./15-ia.md).

### E

**Estado de habilitación para votar**
Campo derivado que indica si una Persona está en condiciones de votar en la elección vigente, resultado del cruce entre la Persona y el Padrón Electoral activo. Ver [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md).

**Etiqueta**
Marca libre, definida por los usuarios, que se puede asociar a una Persona para categorizarla más allá de los campos estructurados (por ejemplo: "delegado de curso", "referente de camada"). Ver [`05-modulo-personas.md`](./05-modulo-personas.md).

### F

**Ficha (de Persona)**
Registro único e íntegro de una Persona en el sistema, con todos sus datos, historial, actividades y etiquetas asociadas. "Ficha" y "Persona" se usan como sinónimos en el resto de la documentación.

**Fusión (de duplicados)**
Proceso guiado en el que dos fichas de Persona detectadas como duplicadas se combinan en una sola, campo por campo, conservando el historial de ambas. Ver [`15-ia.md`](./15-ia.md).

### H

**Historial de cambios**
Registro cronológico de las modificaciones sufridas por una entidad específica (por ejemplo, todos los cambios sobre la ficha de una Persona puntual). Ver [`17-auditoria-historial.md`](./17-auditoria-historial.md).

### I

**Importación**
Proceso de carga masiva de datos al sistema desde una fuente externa (Google Sheets, CSV, Excel o PDF). Ver [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md).

**Insight**
Observación generada automáticamente por el sistema a partir de patrones en los datos (por ejemplo, "la participación en actividades de 2do año creció 30% este cuatrimestre"), mostrada en el dashboard. Ver [`15-ia.md`](./15-ia.md).

### M

**Militante**
Rol de usuario de base: gestiona su propio punteo, participa como responsable o colaborador de actividades y tiene visibilidad acotada a lo propio. Es, en volumen, el perfil de usuario más numeroso. Ver [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md).

### N

**Notificación**
Aviso generado por el sistema hacia uno o varios usuarios, ya sea informativo, accionable o de alerta. Ver [`13-notificaciones.md`](./13-notificaciones.md).

**Normalización**
Proceso, asistido por IA, de estandarizar el formato de un dato (teléfonos, capitalización de nombres, direcciones de correo) para que sea comparable y buscable de forma consistente. Ver [`15-ia.md`](./15-ia.md).

### P

**Padrón Electoral**
Listado oficial de personas habilitadas para votar en una elección universitaria específica, publicado por la facultad o la universidad y cargado al sistema como una entidad propia, versionada. Ver [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md).

**Participación**
Relación con atributos propios entre una Persona y una Actividad (fecha de inscripción, estado, asistencia). Es la entidad que materializa el vínculo N a N entre Persona y Actividad. Ver [`07-modulo-participaciones.md`](./07-modulo-participaciones.md).

**Persona**
Entidad central del sistema: representa a un estudiante, con una ficha única. No debe confundirse con "Usuario" (quien opera el sistema). Ver [`05-modulo-personas.md`](./05-modulo-personas.md).

**Permiso**
Unidad mínima y granular de autorización dentro del sistema, con formato `modulo.accion` (por ejemplo, `punteo.ver_todos`). Se agrupan en Roles. Ver [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md).

**Punteo**
Práctica de seguimiento político-territorial: el conjunto de clasificación, comentarios y seguimiento que un Usuario mantiene, de forma privada, sobre las Personas con las que tiene contacto. Ver [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md).

### R

**Rol**
Conjunto nombrado de Permisos que se asigna a un Usuario (por ejemplo, Administrador, Coordinador, Militante, Lectura). Ver [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md).

**RLS (Row Level Security)**
Mecanismo de PostgreSQL/Supabase que restringe, a nivel de base de datos, qué filas puede leer o escribir cada usuario, como capa adicional de seguridad independiente de la lógica de la aplicación. Ver [`16-seguridad.md`](./16-seguridad.md).

### S

**Soft delete (archivado)**
Práctica de marcar un registro como inactivo/archivado en lugar de eliminarlo físicamente de la base de datos, preservando su historial y sus relaciones. Ver [`17-auditoria-historial.md`](./17-auditoria-historial.md).

**SSOT (Single Source of Truth)**
En referencia a esta misma documentación: el conjunto de documentos en `/docs` es la única fuente de verdad sobre decisiones de producto y arquitectura para este proyecto.

### U

**Usuario**
Miembro de la organización con una cuenta en el sistema, autenticado vía Supabase Auth, con un Rol asignado. No debe confundirse con "Persona" (el estudiante gestionado). Ver [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md).

---

### Documentos relacionados

- [`00-README.md`](./00-README.md) — índice general
- [`04-modelo-datos.md`](./04-modelo-datos.md) — donde cada uno de estos términos se traduce en una entidad de base de datos formal
