# CLAUDE.md — Constitución del proyecto CRM ATP

Este archivo es la guía operativa para cualquier sesión de Claude Code que trabaje en este repositorio. La fuente de verdad de producto, modelo de datos y arquitectura son los 21 documentos en la raíz del proyecto (`00-README.md` a `20-roadmap.md`), no este archivo. Este archivo resume y traduce esa documentación a reglas de trabajo concretas para escribir código; si algo acá contradice a `/docs`, gana `/docs` y hay que corregir este archivo.

> Nota: la documentación funcional (`00-README.md` en adelante) fue entregada en la raíz del repositorio, no en una carpeta `/docs` separada como asume la propia documentación en sus referencias cruzadas. Todas las referencias `./NN-nombre.md` dentro de esos documentos deben leerse como archivos en la raíz.

> Ver también `AGENTS.md` en la raíz: contiene una advertencia de la versión de Next.js usada en este scaffold (puede tener cambios respecto al conocimiento de entrenamiento del modelo).

## 1. Qué es este proyecto

CRM inteligente para ATP, agrupación estudiantil de la Facultad de Ciencias Médicas (UNR). Reemplaza planillas dispersas y contactos sueltos con una fuente de verdad operativa sobre personas, actividades, punteo electoral y padrones. Ver visión completa en `01-vision-alcance.md`.

Dos tipos de "persona" que nunca hay que confundir:
- **Personas**: estudiantes, el objeto gestionado por el CRM. No inician sesión.
- **Usuarios**: militantes/conducción de ATP que operan el sistema.

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js (App Router) + React, TypeScript estricto (`strict: true`) |
| Estilos | Tailwind CSS |
| Base de datos | PostgreSQL vía Supabase |
| ORM | Prisma (única vía de acceso a datos — nunca SQL manual fuera de `prisma/schema.prisma` y migraciones) |
| Auth / Storage | Supabase Auth + Supabase Storage |
| IA | API de Gemini (Google AI Studio), invocada siempre desde el servidor — migrado desde Anthropic el 2026-08-02, ver sección 7 (S6) |
| Deploy | Vercel, con preview deployments por rama |

Detalle completo y justificación en `03-arquitectura.md`.

## 3. Estructura de carpetas (referencia obligatoria)

```
/
├── app/
│   ├── (auth)/                    # login, recuperar-contrasena
│   ├── (app)/                     # rutas autenticadas, layout con sidebar + buscador global
│   │   ├── dashboard/
│   │   ├── personas/[id]/
│   │   ├── actividades/[id]/
│   │   ├── punteo/
│   │   ├── padron/
│   │   ├── importar/
│   │   ├── exportar/
│   │   ├── auditoria/              # requiere permiso auditoria.ver
│   │   ├── configuracion/          # requiere permiso configuracion.gestionar
│   │   └── usuarios/               # requiere permiso usuarios.gestionar
│   ├── api/webhooks/               # solo para webhooks externos que requieren HTTP puro
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                         # primitivas del design system
│   ├── personas/ actividades/ punteo/ dashboard/ buscador/ layout/
├── lib/
│   ├── prisma/client.ts            # instancia única de PrismaClient
│   ├── supabase/client.ts server.ts
│   ├── permisos/permisos.ts roles.ts
│   ├── servicios/
│   │   ├── personas.service.ts actividades.service.ts participaciones.service.ts
│   │   ├── punteo.service.ts padron.service.ts
│   │   ├── importaciones.service.ts exportaciones.service.ts
│   │   ├── auditoria.service.ts notificaciones.service.ts busqueda.service.ts
│   ├── ia/
│   │   ├── cliente-ia.ts           # única puerta de entrada a la API de Gemini
│   │   ├── deteccion-duplicados.ts normalizacion.ts lectura-padron.ts chatbot.ts insights.ts
│   ├── validaciones/               # esquemas de validación por entidad
│   └── utils/
├── prisma/schema.prisma
├── public/
└── tests/{unit,integration,e2e}/
```

**Reglas de dependencia (no negociables):**
- `components/` puede importar de `lib/servicios/*`. Nunca al revés.
- Nada en `app/` llama a Prisma directamente — siempre pasa por `lib/servicios/*`.
- Toda mutación de datos pasa por la capa de servicios, nunca directo de UI a Prisma.
- Todo lo de IA vive en `lib/ia/`, con `cliente-ia.ts` como única puerta de configuración del cliente.
- Cada servicio en `lib/servicios/` corresponde 1 a 1 con un módulo funcional documentado (ver tabla en `03-arquitectura.md` sección 6).

## 3.0 Nota: migraciones que usan `auth.*`/`storage.*` (Supabase) rompen el flujo normal de Prisma

La base de sombra que usa `prisma migrate dev` (incluso con `--create-only`, porque igual valida el historial completo contra la sombra antes de crear la migración nueva) es un Postgres vacío sin los schemas `auth`/`storage` que provee Supabase — en cuanto el historial de migraciones incluye una que usa `auth.uid()`, `storage.buckets`, etc., **todo** comando `migrate dev` posterior falla con `schema "auth" does not exist`, aunque la base real sí los tenga. A partir de la migración `0001_rls_persona_punteo`, el flujo para cualquier migración nueva con SQL específico de Supabase es:
1. Crear la carpeta a mano: `prisma/migrations/<timestamp-UTC-YYYYMMDDHHMMSS>_<nombre>/migration.sql` (no uses `prisma migrate dev --create-only`, va a fallar).
2. Escribir el SQL en ese archivo (ver `prisma/sql/*.sql` como fuente editable de referencia).
3. Aplicar con `npx prisma migrate deploy` (no pasa por la base de sombra).
4. Verificar con `npx prisma migrate status`.

También: los IDs del modelo son `String` (TEXT en Postgres, no `uuid` nativo), así que toda comparación contra `auth.uid()` necesita `::text`.

## 3.1 Nota de versión: Next.js 16 usa `proxy.ts`, no `middleware.ts`

Este proyecto corre sobre Next.js 16, que renombró la convención `middleware.ts` a `proxy.ts` (mismo propósito: código de servidor que corre antes de completar el request, usado acá para refrescar la sesión de Supabase). El archivo vive en `proxy.ts` en la raíz y exporta una función `proxy`, no `middleware`. Ver `AGENTS.md` y `node_modules/next/dist/docs/` antes de asumir comportamiento de versiones anteriores de Next.js.

## 4. Convenciones de código

- **Idioma**: nombres de entidades y campos de negocio en **español** (reflejan el lenguaje ubicuo del glosario, `02-glosario.md`). Nombres de archivos, funciones internas y elementos puramente técnicos en **inglés**.
- **TypeScript estricto** en todo el proyecto, sin excepciones por módulo.
- **IDs**: UUID en toda entidad, nunca enteros autoincrementales.
- **Server Components por default**; Client Components solo donde se necesita interactividad.
- **Toda Server Action que mute datos** empieza verificando sesión activa y el permiso específico requerido, antes de cualquier lógica.
- **RLS en Postgres es una segunda capa, no la única.** La autorización se valida primero en `lib/servicios/*`.
- **Errores**: nunca se expone un stack trace ni un error crudo de Prisma/Postgres en la UI. Los errores no controlados en Server Actions se capturan, se registran con contexto (usuario, acción, entidad) y se traducen a un mensaje entendible.
- **Importaciones masivas**: los fallos parciales se reportan fila por fila, nunca como error genérico.
- **Catálogos configurables, no hardcodeados**: Carrera, TipoActividad, Etiqueta, ClasificacionPunteo son tablas, no enums de código ni de base de datos.
- **Paginación obligatoria** en todo listado (Personas, Actividades, Historial); nunca se trae una tabla completa al cliente.

## 5. Reglas de negocio transversales (RN-1 a RN-8)

Definidas en `04-modelo-datos.md` sección 18. Se aplican en todo el sistema, no solo en el módulo donde se mencionan por primera vez:

- **RN-1 — Unicidad de persona.** El sistema no debe permitir intencionalmente dos fichas para el mismo individuo (prevención vía detección de duplicados, ver `15-ia.md`).
- **RN-2 — Fusión conserva historia.** Al fusionar dos Personas, la ficha descartada pasa a `estado_ficha = fusionada` con `fusionada_en_id` apuntando a la definitiva. Nunca se borra físicamente. Toda `Participacion`, `PunteoPersona` y `HistorialCambio` de la ficha fusionada se re-vincula a la definitiva, y la fusión queda registrada en `HistorialCambio`.
- **RN-3 — Un único contacto principal por tipo.** En `PersonaTelefono` y `PersonaEmail`, solo un registro por Persona puede tener `es_principal = true`. Marcar uno nuevo desmarca el anterior en la misma transacción.
- **RN-4 — Una participación por persona y actividad.** Re-inscribir actualiza el registro existente (ej. revierte `cancelado` a `inscripto`), nunca crea un duplicado.
- **RN-5 — Comentarios de punteo inmutables.** `PunteoComentario` no admite edición ni borrado desde la UI estándar, solo alta de comentarios nuevos. Una corrección se agrega como comentario nuevo. Excepción: borrado por error grave, reservado al rol Administrador, y registrado igual en `HistorialCambio`.
- **RN-6 — Autoría de eventos automáticos.** `HistorialCambio` generado por procesos automáticos tiene `usuario_id` nulo pero `metadata` obligatorio identificando el proceso (ej. `{"proceso": "matching_padron", "import_job_id": "..."}`).
- **RN-7 — Catálogos no se eliminan si están en uso.** `Carrera`, `TipoActividad`, `Etiqueta`, `ClasificacionPunteo` solo se desactivan (`activo = false`) si tienen registros asociados, nunca se eliminan.
- **RN-8 — Integridad del padrón activo.** Solo un `PadronElectoral` con `estado = activo` a la vez. Activar uno nuevo exige cerrar el anterior en la misma operación.

Principios rectores transversales (de `01-vision-alcance.md` sección 8), válidos como criterio de desempate ante decisiones de diseño ambiguas:

1. Privacidad por diseño en el punteo — acceso privado por defecto, se amplía solo por rol explícito.
2. La IA asiste, la persona decide — ninguna función de IA fusiona, clasifica políticamente o elimina de forma autónoma.
3. Cero pérdida de datos — no hay `DELETE` físico de entidades de negocio, todo es soft delete + historial.
4. Escala desde el día uno — índices y paginación pensados para miles de registros, no para el volumen inicial.
5. Mobile-first para tareas de campo (punteo), desktop-first para tareas analíticas (dashboard admin).
6. Catálogos configurables, no hardcodeados.
7. Todo cambio relevante es trazable a un usuario y a un momento.

## 6. Modelo de autorización (resumen operativo)

RBAC con permisos granulares (`modulo.accion`). 4 roles base (`es_rol_sistema = true`, no eliminables): **Administrador**, **Coordinador**, **Militante**, **Lectura**. Un usuario tiene un único rol (supuesto S3, revisar `01-vision-alcance.md` si cambia). Catálogo completo de permisos y matriz por rol en `10-usuarios-roles-permisos.md` secciones 4 y 5 — no lo dupliques en código sin mantenerlo sincronizado con ese documento.

El módulo de **Punteo** es el más sensible: cada `PunteoPersona` es privado a su `usuario_id` salvo permiso explícito `punteo.ver_todos`. No implementar ninguna funcionalidad de punteo sin releer `08-modulo-punteo-electoral.md` completo, incluida la sección 10 (marco legal).

## 7. Supuestos activos (no asumir cambios sin confirmar con Gaspar)

De `01-vision-alcance.md` sección 9 — si alguno se corrige, hay que propagar el cambio al documento afectado y a este archivo:

- S1: catálogo de carreras inicial (Medicina, Enfermería, Fonoaudiología, Terapia Ocupacional) es editable, no cerrado.
- S2: un único `PadronElectoral` activo a la vez.
- S3: un usuario tiene un único rol principal (no roles múltiples).
- S4: volumen esperado de Personas del orden de miles, no decenas de miles.
- S5: una `Actividad` puede tener una `Actividad` padre opcional.
- S6: el proveedor de IA es la API de Gemini (Google AI Studio) para todas las funcionalidades de IA — **corregido 2026-08-02**, era Anthropic (Claude) hasta que la cuenta se quedó sin saldo en medio de la carga real de un padrón. Gemini tiene cuota gratuita suficiente para el volumen real de ATP. `GEMINI_API_KEY` en `.env.local` y en las variables de entorno de Vercel (conseguir en https://aistudio.google.com/apikey). Modelo usado: `gemini-2.5-flash` (ver `lib/ia/cliente-ia.ts`).

## 8. Cómo navegar el resto de `/docs` (raíz del repo) según lo que se esté implementando

| Si estás trabajando en... | Leé primero |
|---|---|
| Cualquier entidad o campo nuevo | `04-modelo-datos.md` (estructura) + doc del módulo específico |
| CRM de Personas (alta, ficha, fusión, etiquetado) | `05-modulo-personas.md` |
| Actividades (incl. padre/sub-actividad) | `06-modulo-actividades.md` |
| Participaciones (inscripción, asistencia) | `07-modulo-participaciones.md` |
| Punteo electoral / comentarios privados | `08-modulo-punteo-electoral.md` (⚠️ sección 10, marco legal, prioridad de lectura) |
| Padrón electoral y matching | `09-modulo-padron-electoral.md` |
| Usuarios, roles, permisos | `10-usuarios-roles-permisos.md` |
| Dashboards | `11-dashboards.md` |
| Buscador global | `12-buscador-global.md` |
| Notificaciones | `13-notificaciones.md` |
| Importación/exportación de datos | `14-importaciones-exportaciones.md` |
| Cualquier funcionalidad de IA (duplicados, normalización, lectura de padrón, chatbot, insights) | `15-ia.md` |
| Seguridad, RLS, cumplimiento legal, backups | `16-seguridad.md` |
| Auditoría e historial | `17-auditoria-historial.md` |
| Catálogos y parámetros de configuración | `18-configuracion-sistema.md` |
| UI, navegación, accesibilidad, responsive | `19-ux-ui.md` |
| En qué fase estamos y qué incluye | `20-roadmap.md` |
| Vocabulario / término ambiguo | `02-glosario.md` |

**Regla de trabajo**: al iniciar cada fase del roadmap, releer los documentos funcionales referenciados en esa fase (no solo `20-roadmap.md`, que resume alcance sin repetir el detalle). Cada fase cierra con un checkpoint humano de Gaspar; dentro de una fase se avanza con criterio, sin pedir aprobación paso a paso. Ninguna sesión toma decisiones de producto no resueltas en la documentación sin dejarlas registradas explícitamente (como supuesto nuevo o actualización del documento correspondiente) y, si es una duda real de producto/modelo/permisos, se pregunta antes de asumir.

## 9. Comandos del proyecto

```bash
npm run dev            # desarrollo local
npm run build           # build de producción
npm run lint             # lint
npx prisma generate      # regenerar cliente Prisma tras editar schema.prisma
npx prisma migrate dev   # crear y aplicar migración en desarrollo (NO correr contra producción a mano)
npx prisma studio        # explorar datos en desarrollo
```

## 10. Entornos

Desarrollo local y Preview (Vercel) nunca se conectan a la base de producción, ni siquiera en solo lectura. Producción es únicamente la rama `main`, con backups activos (`16-seguridad.md`). Detalle en `03-arquitectura.md` sección 9.

**Plan de Vercel: siempre el gratuito (Hobby)** — decisión explícita de Gaspar (2026-08-02): este proyecto no paga por infraestructura. No asumir que hay margen de duración de función más allá de lo que permite el plan gratuito (bug real: se asumió por error que el proyecto estaba en plan Pro con funciones de hasta 800s, cuando en realidad corre en Hobby). Cualquier tarea que pueda tardar más que ese límite (como la lectura de padrones por IA, ver `15-ia.md` sección 8) tiene que diseñarse como procesamiento incremental en pasos cortos, no como una sola función de larga duración.
