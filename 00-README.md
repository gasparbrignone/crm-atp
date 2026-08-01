# CRM ATP — Documentación Técnica

Documentación funcional y técnica completa (Single Source of Truth) para el desarrollo del CRM inteligente de ATP (Agrupación de Trabajo y Participación, Facultad de Ciencias Médicas, UNR). Pensada para que Claude Code desarrolle el sistema por etapas sin necesidad de tomar decisiones de producto no cubiertas aquí.

Stack: Next.js (App Router) + React + TypeScript + Tailwind + PostgreSQL + Prisma + Supabase (Auth + DB + Storage) + Vercel.

## Orden de lectura sugerido

### Fundamentos (leer primero, en orden)

| Doc | Contenido |
|---|---|
| [01-vision-alcance.md](./01-vision-alcance.md) | Visión, contexto organizacional, objetivos, alcance de los 15 módulos, principios de diseño, supuestos |
| [02-glosario.md](./02-glosario.md) | Glosario alfabético de todos los términos del sistema |
| [03-arquitectura.md](./03-arquitectura.md) | Stack, estructura de carpetas, capas, auth/autorización, entornos, convención `CLAUDE.md` |
| [04-modelo-datos.md](./04-modelo-datos.md) | Las ~22 entidades, campos, cardinalidades, índices, reglas de negocio transversales |

### Módulos funcionales (pueden leerse en el orden que convenga al roadmap)

| Doc | Contenido |
|---|---|
| [05-modulo-personas.md](./05-modulo-personas.md) | CRM de Personas: alta, ficha, edición, etiquetado, fusión |
| [06-modulo-actividades.md](./06-modulo-actividades.md) | Actividades, tipos, actividades compuestas (padre/sub-actividad) |
| [07-modulo-participaciones.md](./07-modulo-participaciones.md) | Relación Personas↔Actividades, inscripción, asistencia |
| [08-modulo-punteo-electoral.md](./08-modulo-punteo-electoral.md) | Punteo electoral: clasificación, comentarios privados, privacidad, marco legal |
| [09-modulo-padron-electoral.md](./09-modulo-padron-electoral.md) | Gestión de padrones electorales y matching contra Personas |
| [10-usuarios-roles-permisos.md](./10-usuarios-roles-permisos.md) | Sistema de usuarios, roles (RBAC), catálogo y matriz de permisos |
| [11-dashboards.md](./11-dashboards.md) | Dashboard administrativo y dashboard personal |
| [12-buscador-global.md](./12-buscador-global.md) | Buscador global difuso multi-entidad |
| [13-notificaciones.md](./13-notificaciones.md) | Notificaciones in-app y por email |
| [14-importaciones-exportaciones.md](./14-importaciones-exportaciones.md) | Importación (CSV, Sheets, PDF) y exportación de datos |
| [15-ia.md](./15-ia.md) | IA: duplicados, normalización, lectura de padrones, chatbot, insights |

### Transversales

| Doc | Contenido |
|---|---|
| [16-seguridad.md](./16-seguridad.md) | Autenticación, autorización, RLS, privacidad, Ley 25.326, backups |
| [17-auditoria-historial.md](./17-auditoria-historial.md) | Historial de cambios por entidad y auditoría global de usuarios |
| [18-configuracion-sistema.md](./18-configuracion-sistema.md) | Gestión de catálogos editables, roles personalizados, parámetros |
| [19-ux-ui.md](./19-ux-ui.md) | Sistema visual, navegación, responsive, accesibilidad, tono de copy |

### Ejecución

| Doc | Contenido |
|---|---|
| [20-roadmap.md](./20-roadmap.md) | 14 fases de implementación (0 a 13), objetivos, criterios de aceptación, dependencias |

## Notas de lectura

- Todos los documentos comparten formato: título, índice interno, contenido con tablas, y una sección final de "Documentos relacionados" con links cruzados.
- Las decisiones marcadas como **supuestos** (ver sección 9 de `01-vision-alcance.md`) están documentadas explícitamente para que ATP las confirme o ajuste antes o durante el desarrollo — no son definiciones cerradas de forma unilateral.
- El documento con mayor sensibilidad legal y de privacidad es `08-modulo-punteo-electoral.md` (sección 10, marco legal) — se recomienda su revisión prioritaria por parte de ATP.
