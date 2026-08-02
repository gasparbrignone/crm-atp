# Arquitectura del Sistema

[← Índice general](./00-README.md)

## Índice

1. [Resumen ejecutivo de la arquitectura](#1-resumen-ejecutivo-de-la-arquitectura)
2. [Stack tecnológico y justificación](#2-stack-tecnológico-y-justificación)
3. [Arquitectura general (vista lógica)](#3-arquitectura-general-vista-lógica)
4. [Estructura de carpetas](#4-estructura-de-carpetas)
5. [Capas y responsabilidades](#5-capas-y-responsabilidades)
6. [Módulos y servicios internos](#6-módulos-y-servicios-internos)
7. [Estrategia de datos: Prisma + Supabase](#7-estrategia-de-datos-prisma--supabase)
8. [Autenticación y autorización a nivel de arquitectura](#8-autenticación-y-autorización-a-nivel-de-arquitectura)
9. [Entornos y despliegue](#9-entornos-y-despliegue)
10. [Escalabilidad](#10-escalabilidad)
11. [Rendimiento](#11-rendimiento)
12. [Mantenibilidad](#12-mantenibilidad)
13. [Observabilidad y manejo de errores](#13-observabilidad-y-manejo-de-errores)
14. [Convenciones de proyecto para desarrollo asistido por IA](#14-convenciones-de-proyecto-para-desarrollo-asistido-por-ia)

---

## 1. Resumen ejecutivo de la arquitectura

El sistema es una aplicación web **monolítica modular**, no un conjunto de microservicios. Esta decisión es deliberada: un CRM de este tamaño, para una única organización, con un equipo de desarrollo reducido (potencialmente una sola persona apoyada por herramientas de IA), no se beneficia de la complejidad operativa de microservicios. Se beneficia, en cambio, de límites de módulo claros *dentro* de un mismo despliegue — lo que esta documentación llama "monolito modular".

La aplicación se construye sobre **Next.js con App Router**, usando **React Server Components** como default y Client Components solo donde se necesita interactividad. La lógica de negocio vive mayormente en el servidor (Server Actions y funciones de servicio), no en el cliente. **Prisma** es la única vía de acceso a **PostgreSQL** (alojado en **Supabase**); ninguna consulta SQL se escribe a mano fuera del *schema* y las migraciones de Prisma. **Supabase Auth** resuelve identidad; **Supabase Storage** resuelve almacenamiento de archivos (padrones en PDF, planillas importadas, exportaciones generadas). El despliegue es en **Vercel**, con *preview deployments* automáticos por rama.

## 2. Stack tecnológico y justificación

| Tecnología | Rol en el sistema | Justificación |
|---|---|---|
| **Next.js (App Router)** | Framework full-stack: UI, ruteo, Server Actions, capa de API cuando haga falta | Permite renderizado en servidor (clave para un dashboard con muchos datos), colocar UI y lógica de servidor en el mismo proyecto, y despliegue nativo en Vercel |
| **React** | Librería de UI | Requisito del stack; ecosistema maduro de componentes |
| **TypeScript** | Lenguaje en todo el proyecto (frontend, backend, scripts) | Tipado punta a punta: desde el modelo de Prisma hasta el componente de React, sin "zonas grises" sin tipos. Reduce errores de integración entre capas |
| **Tailwind CSS** | Sistema de estilos | Consistencia visual mantenible a través de tokens de diseño (ver [`19-ux-ui.md`](./19-ux-ui.md)) sin mantener hojas de estilo separadas por componente |
| **PostgreSQL** | Motor de base de datos | Relacional, con soporte maduro de índices avanzados (GIN, trigram) necesarios para el buscador global y para las relaciones complejas del modelo (ver [`04-modelo-datos.md`](./04-modelo-datos.md)) |
| **Prisma ORM** | Capa de acceso a datos y migraciones | Tipado automático generado desde el *schema*, migraciones versionadas y legibles, y una única fuente de verdad del modelo de datos que se mantiene sincronizada con el código |
| **Supabase (Auth + Database + Storage)** | Backend as a Service: aloja el Postgres, resuelve autenticación y almacenamiento de archivos | Evita operar infraestructura propia de auth y storage; Row Level Security nativo de Postgres se aprovecha como segunda capa de seguridad (ver [`16-seguridad.md`](./16-seguridad.md)) |
| **Vercel** | Hosting y CI/CD | Integración nativa con Next.js, *preview deployments* por *pull request*, escalado automático |
| **API de Gemini (Google AI Studio)** | Todas las funcionalidades de IA (ver [`15-ia.md`](./15-ia.md)) | Cuota gratuita suficiente para el volumen real de ATP — proveedor original era Anthropic, migrado el 2026-08-02 (supuesto S6, ver [`01-vision-alcance.md`](./01-vision-alcance.md#9-supuestos-y-decisiones-abiertas)) tras quedarse sin saldo en medio de una carga real de padrón |

## 3. Arquitectura general (vista lógica)

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENTE (navegador)                       │
│   React Server/Client Components · Tailwind · Modo oscuro         │
└───────────────────────────────┬────────────────────────────────--┘
                                 │ HTTPS
┌───────────────────────────────▼────────────────────────────────--┐
│                    NEXT.JS (Vercel — App Router)                  │
│                                                                    │
│  ┌───────────────┐  ┌────────────────┐  ┌──────────────────────┐ │
│  │  Rutas de UI   │  │ Server Actions │  │  Rutas de API (edge/ │ │
│  │  (páginas y    │  │ (mutaciones y  │  │  webhooks, si hacen  │ │
│  │  layouts)      │  │  lecturas)     │  │  falta)              │ │
│  └───────┬───────┘  └────────┬───────┘  └──────────┬───────────┘ │
│          │                   │                      │             │
│          └──────────┬────────┴──────────────────────┘             │
│                      ▼                                            │
│         ┌─────────────────────────────┐                           │
│         │   Capa de servicios (lib/)   │                          │
│         │  personas · actividades ·    │                          │
│         │  punteo · padron · ia ·      │                          │
│         │  permisos · auditoria ·      │                          │
│         │  importaciones · búsqueda    │                          │
│         └───────────────┬─────────────┘                           │
│                          ▼                                        │
│              ┌───────────────────────┐                            │
│              │   Prisma ORM (cliente) │                           │
│              └───────────┬───────────┘                            │
└──────────────────────────┼────────────────────────────────────---┘
                            │
        ┌───────────────────┴────────────────────┐
        ▼                                         ▼
┌──────────────────────┐               ┌────────────────────────┐
│  SUPABASE POSTGRESQL   │              │   SUPABASE AUTH /       │
│  (con Row Level        │◄────────────►│   STORAGE               │
│   Security como         │              │  Sesión, JWT, archivos │
│   segunda capa)         │              │  (padrones, imports)   │
└──────────────────────┘               └────────────────────────┘
                            │
                            ▼
                 ┌───────────────────────┐
                 │   API de Gemini        │
                 │   (Google AI Studio)   │
                 │   — IA                 │
                 └───────────────────────┘
```

Puntos clave de esta vista:

- Toda mutación de datos pasa por la **capa de servicios**, nunca directamente desde un componente de UI a Prisma. Esto es lo que permite, por ejemplo, que la lógica de "solo el dueño del punteo o un Administrador puede editar este comentario" viva en un único lugar y no se reimplemente en cada pantalla.
- **RLS en Postgres es una segunda capa, no la única.** La autorización se valida primero en la capa de servicios (con el permiso del usuario autenticado), y las políticas de RLS actúan como red de seguridad ante un eventual error de lógica en la aplicación. Ver el detalle en [`16-seguridad.md`](./16-seguridad.md).
- La API de Gemini se invoca **siempre desde el servidor** (Server Actions o servicios), nunca desde el cliente, para no exponer credenciales y para poder aplicar el mismo control de permisos que al resto del sistema.

## 4. Estructura de carpetas

Estructura de referencia para el repositorio. Es la organización que debe usarse al iniciar el desarrollo; cualquier desviación relevante debería reflejarse como actualización de este documento.

```
/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── recuperar-contrasena/
│   ├── (app)/                     # Rutas autenticadas, con layout común (sidebar, buscador global)
│   │   ├── dashboard/
│   │   ├── personas/
│   │   │   └── [id]/
│   │   ├── actividades/
│   │   │   └── [id]/
│   │   ├── punteo/
│   │   ├── padron/
│   │   ├── importar/
│   │   ├── exportar/
│   │   ├── auditoria/             # Solo accesible con permiso auditoria.ver
│   │   ├── configuracion/         # Solo accesible con permiso configuracion.gestionar
│   │   └── usuarios/              # Solo accesible con permiso usuarios.gestionar
│   ├── api/
│   │   └── webhooks/              # Endpoints que requieren HTTP puro (webhooks externos)
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                        # Primitivas del sistema de diseño (botón, input, tabla, modal…)
│   ├── personas/
│   ├── actividades/
│   ├── punteo/
│   ├── dashboard/
│   ├── buscador/
│   └── layout/                    # Sidebar, topbar, navegación
├── lib/
│   ├── prisma/
│   │   └── client.ts               # Instancia única de PrismaClient
│   ├── supabase/
│   │   ├── client.ts                # Cliente de navegador
│   │   └── server.ts                # Cliente de servidor
│   ├── permisos/
│   │   ├── permisos.ts              # Definición de permisos y su verificación
│   │   └── roles.ts
│   ├── servicios/
│   │   ├── personas.service.ts
│   │   ├── actividades.service.ts
│   │   ├── participaciones.service.ts
│   │   ├── punteo.service.ts
│   │   ├── padron.service.ts
│   │   ├── importaciones.service.ts
│   │   ├── exportaciones.service.ts
│   │   ├── auditoria.service.ts
│   │   ├── notificaciones.service.ts
│   │   └── busqueda.service.ts
│   ├── ia/
│   │   ├── cliente-ia.ts
│   │   ├── deteccion-duplicados.ts
│   │   ├── normalizacion.ts
│   │   ├── lectura-padron.ts
│   │   ├── chatbot.ts
│   │   └── insights.ts
│   ├── validaciones/               # Esquemas de validación (por entidad)
│   └── utils/
├── prisma/
│   └── schema.prisma
├── docs/                            # Esta misma documentación
├── public/
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

**Reglas de organización que se derivan de esta estructura:**

- Un componente dentro de `components/personas/` puede importar de `lib/servicios/personas.service.ts`, pero **nunca al revés**: la capa de servicios no debe importar nada de `components/` ni de `app/`.
- Ningún archivo dentro de `app/` llama a Prisma directamente. Siempre pasa por `lib/servicios/*`.
- Todo lo relacionado con IA vive en `lib/ia/`, con una única puerta de entrada (`cliente-ia.ts`) para la configuración del cliente de la API, de forma que cambiar de modelo o de configuración (por ejemplo, límites de tokens) se hace en un solo lugar.

## 5. Capas y responsabilidades

| Capa | Responsabilidad | No le corresponde |
|---|---|---|
| **UI (`app/`, `components/`)** | Renderizar datos, capturar interacción del usuario, invocar Server Actions | Contener reglas de negocio, decidir permisos, construir queries |
| **Server Actions / rutas** | Punto de entrada de las mutaciones y lecturas iniciadas por el usuario; valida sesión y delega en servicios | Contener lógica de negocio extensa (debe delegar a `lib/servicios`) |
| **Servicios (`lib/servicios/`)** | Lógica de negocio: reglas de validación, verificación de permisos, orquestación de múltiples entidades, registro de auditoría | Conocer detalles de la UI |
| **IA (`lib/ia/`)** | Construcción de prompts, llamadas a la API de Gemini, parseo de respuestas estructuradas | Tomar decisiones finales sobre datos sin pasar por un servicio que aplique las reglas de negocio (por ejemplo, un duplicado sugerido por IA se persiste a través de `personas.service.ts`, no directamente desde `lib/ia`) |
| **Acceso a datos (Prisma)** | Ejecutar consultas tipadas contra PostgreSQL | Contener lógica de negocio |
| **Base de datos (PostgreSQL/Supabase)** | Persistencia, integridad referencial, RLS como segunda capa de autorización | — |

## 6. Módulos y servicios internos

Cada servicio en `lib/servicios/` corresponde 1 a 1 con un módulo funcional documentado en `/docs`. Esta correspondencia es intencional: facilita ubicar dónde vive la lógica de cualquier funcionalidad descripta en la documentación funcional.

| Servicio | Documento funcional correspondiente |
|---|---|
| `personas.service.ts` | [`05-modulo-personas.md`](./05-modulo-personas.md) |
| `actividades.service.ts` | [`06-modulo-actividades.md`](./06-modulo-actividades.md) |
| `participaciones.service.ts` | [`07-modulo-participaciones.md`](./07-modulo-participaciones.md) |
| `punteo.service.ts` | [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) |
| `padron.service.ts` | [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md) |
| `importaciones.service.ts` / `exportaciones.service.ts` | [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md) |
| `auditoria.service.ts` | [`17-auditoria-historial.md`](./17-auditoria-historial.md) |
| `notificaciones.service.ts` | [`13-notificaciones.md`](./13-notificaciones.md) |
| `busqueda.service.ts` | [`12-buscador-global.md`](./12-buscador-global.md) |
| `lib/ia/*` | [`15-ia.md`](./15-ia.md) |
| `lib/permisos/*` | [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md) |

## 7. Estrategia de datos: Prisma + Supabase

- El **`schema.prisma`** es la fuente de verdad estructural del modelo de datos. El detalle funcional de cada entidad está en [`04-modelo-datos.md`](./04-modelo-datos.md); el `schema.prisma` es su traducción técnica cuando comience la implementación (fuera del alcance de esta etapa de documentación).
- Las **migraciones** de Prisma son la única forma permitida de modificar la estructura de la base de datos. No se editan tablas manualmente desde el panel de Supabase en ningún entorno, ni siquiera en desarrollo, para evitar que el *schema* y la base real diverjan.
- Prisma se conecta a Postgres en modo *connection pooling* (vía el *pooler* que provee Supabase) para el tráfico de la aplicación en Vercel, dado el modelo *serverless* de Next.js en producción, y en conexión directa solo para la ejecución de migraciones.

## 8. Autenticación y autorización a nivel de arquitectura

- **Autenticación**: delegada por completo a Supabase Auth. La aplicación nunca almacena contraseñas ni implementa su propio flujo de login desde cero.
- **Autorización**: es responsabilidad de la aplicación (capa de servicios), reforzada por RLS en la base de datos. El detalle completo de roles y permisos está en [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md); el detalle de la arquitectura de seguridad está en [`16-seguridad.md`](./16-seguridad.md).
- Cada Server Action que mute datos comienza, sin excepción, verificando la sesión activa y el permiso requerido para esa acción específica, antes de ejecutar cualquier lógica.

## 9. Entornos y despliegue

| Entorno | Propósito | Rama | Base de datos |
|---|---|---|---|
| **Desarrollo local** | Desarrollo día a día | cualquier rama de feature | Proyecto de Supabase de desarrollo, con datos de prueba/sintéticos — nunca datos reales de personas |
| **Preview (Vercel)** | Revisión de cada *pull request* antes de mergear | rama de feature, automático en cada push | Igual que desarrollo, o una base de *staging* compartida de solo lectura para pruebas visuales |
| **Producción** | Sistema real usado por la organización | `main` | Proyecto de Supabase de producción, con backups activos (ver [`16-seguridad.md`](./16-seguridad.md)) |

**Regla no negociable:** los entornos de desarrollo y *preview* nunca se conectan a la base de datos de producción, ni siquiera en modo solo lectura, para eliminar cualquier riesgo de que un cambio en curso afecte datos reales de personas.

## 10. Escalabilidad

El sistema se diseña para escalar en dos dimensiones, ambas cubiertas por el stack elegido sin requerir arquitectura adicional en el corto/mediano plazo:

- **Escalado de tráfico/carga de trabajo**: Vercel escala instancias *serverless* de Next.js automáticamente. No hay estado en el servidor de aplicación (toda sesión vive en el JWT de Supabase Auth), por lo que no hay límite estructural de instancias concurrentes.
- **Escalado de volumen de datos**: PostgreSQL en Supabase soporta sin problema los volúmenes esperados (ver supuesto S4 en [`01-vision-alcance.md`](./01-vision-alcance.md)). Las decisiones de índices están documentadas por entidad en [`04-modelo-datos.md`](./04-modelo-datos.md) y se diseñan desde el inicio pensando en miles de filas por tabla, con paginación obligatoria en toda vista de listado (nunca se trae una tabla completa al cliente).

Si en el futuro el volumen de datos o de organizaciones usando el sistema creciera un orden de magnitud (por ejemplo, uso por otras agrupaciones o facultades), los puntos de extensión ya previstos en el modelo son: agregar una entidad `Organizacion` como raíz de particionado lógico de datos (multi-tenant), sin que esto requiera rediseñar las entidades existentes — ver la nota de extensibilidad en [`04-modelo-datos.md`](./04-modelo-datos.md).

## 11. Rendimiento

- **Renderizado**: las vistas con datos pesados (dashboard, listados) usan Server Components para resolver datos en el servidor y enviar HTML ya armado, minimizando JavaScript en el cliente.
- **Paginación obligatoria**: ningún listado (Personas, Actividades, Historial) devuelve más de un límite fijo de filas por página (ver el detalle de paginación en cada módulo). El buscador global usa la misma estrategia (ver [`12-buscador-global.md`](./12-buscador-global.md)).
- **Índices**: cada entidad documenta sus índices en [`04-modelo-datos.md`](./04-modelo-datos.md), pensados en función de los patrones de consulta reales del sistema (búsqueda por DNI/legajo, filtro por carrera y año, filtro por estado de padrón).
- **Presupuesto de rendimiento objetivo**: tiempo de respuesta percibido menor a 500ms en listados paginados con miles de registros, y *Largest Contentful Paint* menor a 2.5s en el dashboard bajo condiciones de red 4G, como referencia de Core Web Vitals.

## 12. Mantenibilidad

- **TypeScript estricto** (`strict: true`) en todo el proyecto, sin excepciones module por module.
- **Un servicio por módulo funcional** (ver sección 6), de forma que cualquier persona (o cualquier sesión de Claude Code) que necesite modificar una funcionalidad sepa exactamente en qué archivo empezar a buscar.
- **Catálogos en base de datos, no en código** (Carreras, Tipos de Actividad, clasificaciones de punteo — ver [`18-configuracion-sistema.md`](./18-configuracion-sistema.md)), para que los cambios frecuentes de la organización no requieran cambios de código ni despliegues.
- **Un archivo `CLAUDE.md` en la raíz del repositorio**, mantenido desde el inicio del desarrollo, que documente las convenciones específicas de este proyecto (nombres de servicios, patrones a seguir, patrones a evitar) para que cualquier sesión de desarrollo asistido por IA parta del mismo contexto. Ver sección 14.

## 13. Observabilidad y manejo de errores

- Todo error no controlado en una Server Action se captura, se registra (con suficiente contexto para depurar: usuario, acción, entidad involucrada) y se traduce en un mensaje entendible para el usuario final — nunca se expone un *stack trace* ni un mensaje de error de Prisma/Postgres crudo en la UI.
- Las acciones que fallan parcialmente (por ejemplo, una importación masiva donde algunas filas fallan y otras no) deben reportar el detalle fila por fila, nunca un error genérico de "algo salió mal" — ver [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md).
- Se recomienda integrar un servicio de *error tracking* (por ejemplo, Sentry) desde las primeras fases del roadmap, no como tarea de última hora antes de producción.

## 14. Convenciones de proyecto para desarrollo asistido por IA

Dado que este sistema está pensado para desarrollarse por etapas con Claude Code a partir de esta documentación, se recomienda:

- Mantener un **`CLAUDE.md`** en la raíz del repositorio con: las convenciones de nombres usadas (español para entidades y campos de negocio, inglés para elementos puramente técnicos como nombres de archivos y funciones internas), la lista de comandos de build/test/lint del proyecto, y una referencia explícita a esta carpeta `/docs` como fuente de verdad de producto y arquitectura.
- Cada fase del [roadmap](./20-roadmap.md) debe completarse y validarse (checkpoint humano) antes de iniciar la siguiente, en lugar de aprobar tarea por tarea — esto reduce fricción sin perder control en los puntos que realmente importan (fin de fase, no cada commit).
- Ninguna sesión de desarrollo debe tomar decisiones de producto no resueltas en esta documentación sin dejarlas registradas explícitamente (como nueva entrada en la tabla de supuestos de [`01-vision-alcance.md`](./01-vision-alcance.md) o como actualización del documento correspondiente).

---

### Documentos relacionados

- [`04-modelo-datos.md`](./04-modelo-datos.md) — modelo de datos completo que Prisma traduce a `schema.prisma`
- [`16-seguridad.md`](./16-seguridad.md) — detalle de autenticación, autorización y RLS
- [`20-roadmap.md`](./20-roadmap.md) — cómo se construye esta arquitectura por fases
