# 20. Roadmap de Implementación

[← Índice general](./00-README.md)

## Índice

1. [Enfoque general](#1-enfoque-general)
2. [Cómo usar este roadmap con Claude Code](#2-cómo-usar-este-roadmap-con-claude-code)
3. [Fase 0 — Fundaciones](#3-fase-0--fundaciones)
4. [Fase 1 — CRM de Personas (núcleo)](#4-fase-1--crm-de-personas-núcleo)
5. [Fase 2 — Actividades y Participaciones](#5-fase-2--actividades-y-participaciones)
6. [Fase 3 — Dashboards v1](#6-fase-3--dashboards-v1)
7. [Fase 4 — Usuarios y permisos completo](#7-fase-4--usuarios-y-permisos-completo)
8. [Fase 5 — Punteo electoral y comentarios](#8-fase-5--punteo-electoral-y-comentarios)
9. [Fase 6 — Padrón electoral](#9-fase-6--padrón-electoral)
10. [Fase 7 — Importaciones avanzadas](#10-fase-7--importaciones-avanzadas)
11. [Fase 8 — IA: duplicados y normalización](#11-fase-8--ia-duplicados-y-normalización)
12. [Fase 9 — Chatbot e insights de IA](#12-fase-9--chatbot-e-insights-de-ia)
13. [Fase 10 — Buscador avanzado](#13-fase-10--buscador-avanzado)
14. [Fase 11 — Notificaciones](#14-fase-11--notificaciones)
15. [Fase 12 — Auditoría, exportaciones y configuración avanzada](#15-fase-12--auditoría-exportaciones-y-configuración-avanzada)
16. [Fase 13 — Hardening final](#16-fase-13--hardening-final)
17. [Resumen de dependencias entre fases](#17-resumen-de-dependencias-entre-fases)

## 1. Enfoque general

El roadmap está diseñado siguiendo dos criterios explícitos:

- **Valor utilizable lo antes posible**: cada fase, al cerrarse, deja a ATP con algo que puede empezar a usar en la práctica — no hay fases puramente técnicas sin funcionalidad visible hasta etapas muy avanzadas.
- **Checkpoints ubicados, no aprobación constante**: cada fase termina en un punto de revisión humana claro (checklist de aceptación), pero dentro de una fase el trabajo se ejecuta de forma continua, sin pedir validación paso a paso — consistente con la preferencia de Gaspar por revisar en puntos bien definidos en vez de en cada paso intermedio.

Cada fase de este documento incluye: objetivo, funcionalidades incluidas, criterios de aceptación medibles, dependencias de fases anteriores, y riesgos específicos a vigilar.

## 2. Cómo usar este roadmap con Claude Code

Este roadmap está pensado como guía de trabajo para Claude Code, no como cronograma con fechas. El orden de las fases refleja dependencias técnicas y de negocio, no una estimación de tiempo — cada fase se da por iniciada recién cuando la anterior cierra su checklist de aceptación.

Al iniciar cada fase, Claude Code debería releer los documentos funcionales referenciados en esa fase (no solo este roadmap), dado que este documento resume alcance pero no repite el detalle ya documentado en los módulos correspondientes.

## 3. Fase 0 — Fundaciones

**Objetivo**: dejar montada la base técnica sobre la que se construye todo el resto — sin funcionalidad de negocio visible todavía.

**Incluye**:
- Configuración del proyecto Next.js + TypeScript + Tailwind según [`03-arquitectura.md`](./03-arquitectura.md#4-estructura-de-carpetas).
- Conexión a Supabase (Auth + Postgres + Storage) y configuración inicial de Prisma con el esquema completo de [`04-modelo-datos.md`](./04-modelo-datos.md).
- Autenticación básica (login, logout, recuperación de contraseña) vía Supabase Auth.
- Los 4 roles base y el modelo de permisos de [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md), sin interfaz de gestión todavía (datos semilla).
- Design system base: tokens de color y tipografía de [`19-ux-ui.md`](./19-ux-ui.md#2-sistema-visual), componentes base mínimos (botón, input, tabla, modal).
- Estructura del archivo `CLAUDE.md` como constitución del proyecto (ver [`03-arquitectura.md`](./03-arquitectura.md#14-convenciones-y-claudemd)).
- Configuración de entornos y despliegue inicial en Vercel.

**Criterios de aceptación**:
- Un usuario semilla con rol Administrador puede iniciar sesión.
- El esquema de Prisma migra sin errores contra la base de Supabase.
- El despliegue en Vercel sirve una página autenticada mínima.

**Dependencias**: ninguna (fase inicial).

**Riesgos**: subestimar el tiempo de configuración de RLS desde el inicio deja deuda técnica de seguridad para más adelante — se recomienda dejar al menos las políticas de RLS de `Persona` y `PunteoPersona` definidas desde esta fase, aunque el resto del hardening de seguridad se complete recién en la Fase 13.

## 4. Fase 1 — CRM de Personas (núcleo)

**Objetivo**: ATP puede empezar a migrar su base de contactos desde planillas al sistema.

**Incluye**: alta, edición, listado, filtros y vista de detalle de Personas según [`05-modulo-personas.md`](./05-modulo-personas.md), sin etiquetado avanzado ni fusión todavía. Importación básica desde CSV (sin matching inteligente todavía, ver Fase 7) según el flujo general de [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md#3-flujo-general).

**Criterios de aceptación**: un militante puede dar de alta una Persona nueva en menos de 30 segundos desde mobile; un CSV de contactos existente de ATP se importa sin errores no controlados.

**Dependencias**: Fase 0.

**Riesgos**: si el CSV real de ATP tiene un formato muy distinto al asumido en la documentación, este es el punto donde debería detectarse y ajustarse el mapeo de columnas.

## 5. Fase 2 — Actividades y Participaciones

**Objetivo**: ATP puede registrar sus actividades y quién participó en cada una.

**Incluye**: ciclo de vida completo de Actividades incluyendo actividades compuestas (padre/sub-actividad) según [`06-modulo-actividades.md`](./06-modulo-actividades.md), y el módulo de Participaciones con registro rápido de asistencia según [`07-modulo-participaciones.md`](./07-modulo-participaciones.md).

**Criterios de aceptación**: se puede recrear en el sistema la estructura de una actividad tipo EFS (evento padre con talleres como sub-actividades) y registrar asistencia de al menos 20 personas en menos de 5 minutos desde mobile.

**Dependencias**: Fase 1 (requiere Personas existentes para poder asociar participaciones).

## 6. Fase 3 — Dashboards v1

**Objetivo**: la conducción de ATP tiene visibilidad agregada de la actividad cargada hasta el momento.

**Incluye**: dashboard administrativo y dashboard personal según [`11-dashboards.md`](./11-dashboards.md), con los KPIs y gráficos que dependen únicamente de datos de Personas y Actividades (se excluyen de esta fase los paneles que dependen de punteo, todavía no implementado).

**Criterios de aceptación**: el dashboard admin refleja correctamente conteos ya verificables manualmente contra los datos cargados en las fases 1 y 2.

**Dependencias**: Fases 1 y 2.

## 7. Fase 4 — Usuarios y permisos completo

**Objetivo**: ATP puede gestionar su propio equipo de usuarios sin intervención técnica externa.

**Incluye**: interfaz completa de gestión de usuarios, asignación de roles, y roles personalizados según [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md), reemplazando los datos semilla de la Fase 0.

**Criterios de aceptación**: el Administrador puede invitar a un nuevo militante, asignarle el rol Militante, y ese usuario puede iniciar sesión y ver únicamente lo que su rol permite.

**Dependencias**: Fase 0.

## 8. Fase 5 — Punteo electoral y comentarios

**Objetivo**: se habilita el módulo más sensible del sistema, con su modelo de privacidad estricto ya operativo.

**Incluye**: clasificación de punteo, vista de trabajo mobile-first, comentarios privados inmutables, y el modelo de visibilidad de dos capas completo según [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md), incluyendo la auditoría de acceso a punteo ajeno.

**Criterios de aceptación**: un militante solo puede ver y editar el punteo que él mismo cargó; un Administrador que accede a punteo ajeno genera un evento de auditoría verificable; el checklist legal de la sección 10 de ese documento fue revisado con ATP antes de cerrar esta fase.

**Dependencias**: Fases 1 y 4 (requiere Personas y el sistema de permisos completo, dado que este módulo depende críticamente de RLS granular).

**Riesgos**: este es el módulo de mayor riesgo legal y reputacional del sistema — no debería habilitarse con datos reales de personas sin que el checklist de la sección 10 de [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) haya sido revisado explícitamente por ATP, idealmente con asesoría legal puntual como se documenta ahí.

## 9. Fase 6 — Padrón electoral

**Objetivo**: ATP puede cruzar su base de Personas contra un padrón electoral oficial.

**Incluye**: ciclo de vida completo de PadronElectoral, carga y proceso de matching (DNI, nombre difuso) según [`09-modulo-padron-electoral.md`](./09-modulo-padron-electoral.md).

**Criterios de aceptación**: al cargar un padrón de prueba, el sistema clasifica correctamente el `estado_padron` de las Personas ya existentes según la lógica de prioridad documentada.

**Dependencias**: Fase 1 (requiere la base de Personas ya poblada para que el matching tenga sentido).

## 10. Fase 7 — Importaciones avanzadas

**Objetivo**: se completa el módulo de importación más allá del CSV básico de la Fase 1.

**Incluye**: importación desde Google Sheets y desde PDF (padrones con texto seleccionable) usando extracción de texto + IA (Gemini) para estructurar filas, manejo de errores parciales fila por fila, según [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md).

**Dependencias**: Fases 1 y 6.

## 11. Fase 8 — IA: duplicados y normalización

**Objetivo**: reducir el trabajo manual de mantenimiento de calidad de datos.

**Incluye**: detección de duplicados con umbral configurable y regla de "nunca fusiona sola", normalización de campos, según [`15-ia.md`](./15-ia.md#2-detección-de-duplicados) y [`15-ia.md`](./15-ia.md#3-normalización).

**Criterios de aceptación**: sobre un conjunto de prueba con duplicados conocidos, el sistema los detecta y los presenta para revisión humana, sin fusionar ninguno automáticamente.

**Dependencias**: Fase 1.

## 12. Fase 9 — Chatbot e insights de IA

**Objetivo**: se habilita la capa conversacional de consulta sobre los datos del sistema.

**Incluye**: chatbot con arquitectura de tool-use controlado que respeta los permisos del usuario que consulta, e insights automáticos sobre datos agregados, según [`15-ia.md`](./15-ia.md#6-chatbot) y [`15-ia.md`](./15-ia.md#5-insights-automáticos), incluyendo el principio transversal de que la IA nunca infiere ni clasifica opiniones políticas.

**Criterios de aceptación**: el chatbot responde correctamente preguntas sobre datos a los que el usuario consultante tiene acceso, y rechaza o filtra correctamente el acceso a datos fuera de su permiso (verificado con casos de prueba explícitos, incluyendo intentos de acceder a punteo ajeno vía el chat).

**Dependencias**: Fases 5 y 8 (requiere que el modelo de permisos y el módulo de punteo ya estén completos y probados, dado el riesgo de que el chatbot exponga datos sensibles si se construye antes).

**Riesgos**: es el módulo con mayor riesgo de fuga de datos si se implementa antes de tener el modelo de permisos completamente probado — de ahí la dependencia explícita de la Fase 5, y no solo de la Fase 4.

## 13. Fase 10 — Buscador avanzado

**Objetivo**: búsqueda rápida y difusa en todo el sistema.

**Incluye**: búsqueda global con `pg_trgm` y `unaccent`, ranking de resultados, según [`12-buscador-global.md`](./12-buscador-global.md), con la exclusión explícita del contenido de punteo del índice de búsqueda.

**Dependencias**: Fases 1 y 2 (indexa Personas y Actividades).

## 14. Fase 11 — Notificaciones

**Objetivo**: los usuarios reciben avisos proactivos relevantes en vez de tener que revisar manualmente cada módulo.

**Incluye**: catálogo completo de disparadores, canales in-app y digest por email, preferencias de usuario, según [`13-notificaciones.md`](./13-notificaciones.md).

**Dependencias**: Fases 2, 5 y 6 (los disparadores dependen de eventos generados en esos módulos).

## 15. Fase 12 — Auditoría, exportaciones y configuración avanzada

**Objetivo**: cerrar las funcionalidades administrativas restantes.

**Incluye**: vista de auditoría global por usuario según [`17-auditoria-historial.md`](./17-auditoria-historial.md#7-vista-de-auditoría-global-administrador), exportaciones completas según [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md#6-exportaciones), y el panel de configuración de catálogos y parámetros según [`18-configuracion-sistema.md`](./18-configuracion-sistema.md).

**Dependencias**: todas las fases anteriores (esta fase completa lo que las demás dejaron con funcionalidad parcial de gestión).

## 16. Fase 13 — Hardening final

**Objetivo**: el sistema queda listo para operar con datos reales de personas de forma sostenida.

**Incluye**: revisión completa del checklist de seguridad de [`16-seguridad.md`](./16-seguridad.md#13-checklist-de-seguridad-previo-a-producción), pruebas de carga básicas, pruebas de recuperación de backups, revisión de rendimiento de las consultas más usadas, y revisión final de accesibilidad según [`19-ux-ui.md`](./19-ux-ui.md#9-accesibilidad).

**Criterios de aceptación**: todos los ítems del checklist de seguridad marcados como completos, con evidencia verificable para cada uno (no solo la marca del casillero).

**Dependencias**: todas las fases anteriores.

**Riesgos**: la tentación de saltear esta fase por presión de tiempo es el mayor riesgo del proyecto completo, dado que el sistema maneja datos sensibles (punteo político) desde la Fase 5 en adelante — se recomienda explícitamente no tratar esta fase como opcional.

## 17. Resumen de dependencias entre fases

```
Fase 0 (Fundaciones)
  ├─→ Fase 1 (Personas) ──┬─→ Fase 2 (Actividades/Participaciones) ─→ Fase 3 (Dashboards v1)
  │                        ├─→ Fase 6 (Padrón) ─→ Fase 7 (Import. avanzadas)
  │                        ├─→ Fase 8 (IA duplicados)
  │                        └─→ Fase 10 (Buscador, junto con Fase 2)
  └─→ Fase 4 (Usuarios/permisos completo)
           └─→ Fase 5 (Punteo) ─┬─→ Fase 9 (Chatbot/insights, junto con Fase 8)
                                  └─→ Fase 11 (Notificaciones, junto con Fases 2 y 6)

Fases 2, 5, 6 ─→ Fase 11 (Notificaciones)
Todas las anteriores ─→ Fase 12 (Auditoría/export/config avanzada) ─→ Fase 13 (Hardening final)
```

Cada fase, al cerrarse, es el checkpoint recomendado para que Gaspar revise el resultado antes de continuar — no se requiere revisión dentro de una fase salvo que surja una decisión de producto no cubierta por esta documentación.

---

### Documentos relacionados

- Todos los documentos `05` a `19` — cada fase referencia el detalle funcional correspondiente
- [`03-arquitectura.md`](./03-arquitectura.md) — base técnica construida en la Fase 0
- [`16-seguridad.md`](./16-seguridad.md) — checklist central de la Fase 13
