# 18. Configuración del Sistema

[← Índice general](./00-README.md)

## Índice

1. [Propósito](#1-propósito)
2. [Gestión de catálogos editables](#2-gestión-de-catálogos-editables)
3. [Catálogo: Carrera](#3-catálogo-carrera)
4. [Catálogo: TipoActividad](#4-catálogo-tipoactividad)
5. [Catálogo: Etiqueta](#5-catálogo-etiqueta)
6. [Catálogo: ClasificacionPunteo](#6-catálogo-clasificacionpunteo)
7. [Gestión de roles personalizados](#7-gestión-de-roles-personalizados)
8. [Parámetros generales del sistema](#8-parámetros-generales-del-sistema)
9. [Interfaz](#9-interfaz)
10. [Reglas de negocio](#10-reglas-de-negocio)
11. [Permisos](#11-permisos)

## 1. Propósito

Varias decisiones que en un sistema más rígido estarían fijas en el código (los tipos de actividad, las carreras de la facultad, las categorías de punteo) fueron modeladas en [`04-modelo-datos.md`](./04-modelo-datos.md) como **catálogos editables** en base de datos, no como `ENUM` fijos — precisamente porque ATP es una organización viva que puede necesitar ajustar estas listas sin depender de un despliegue de código. Este módulo es el panel donde esa edición ocurre, junto con el resto de los parámetros de configuración global del sistema.

Es un módulo exclusivamente administrativo: no forma parte del uso diario del resto de los roles.

## 2. Gestión de catálogos editables

Los cuatro catálogos editables comparten un patrón de gestión común, descrito una sola vez aquí y aplicado a cada uno en las secciones 3 a 6:

- Listado simple de todos los valores del catálogo, activos e inactivos.
- Alta de un nuevo valor (nombre, y en algunos casos atributos adicionales — color, orden).
- Edición de un valor existente.
- **Desactivación** (no eliminación) de un valor en uso: un catálogo nunca permite el borrado físico de una entrada que ya esté referenciada por al menos un registro de negocio, dado que eso rompería la integridad referencial y el historial. Un valor desactivado deja de estar disponible para selección en formularios nuevos, pero los registros existentes que ya lo usan lo conservan sin cambios.
- Reordenamiento manual (arrastrar y soltar) cuando el orden de presentación importa (por ejemplo, `TipoActividad` en un selector).

## 3. Catálogo: Carrera

Basado en la oferta académica real de FCM-UNR relevada como referencia (Medicina, Enfermería, Fonoaudiología, Licenciatura en Terapia Ocupacional — ver supuesto documentado en [`01-vision-alcance.md`](./01-vision-alcance.md#9-supuestos-explícitos)), cargado como valor inicial editable, no como lista cerrada — ATP puede agregar, renombrar o desactivar carreras si la oferta académica de la facultad cambia.

| Campo | Descripción |
|---|---|
| `nombre` | Nombre completo de la carrera |
| `duracion_anios_referencia` | Duración de referencia, informativa (no bloquea nada) |
| `activa` | Si aparece disponible para selección en la ficha de Persona |

## 4. Catálogo: TipoActividad

Valores iniciales sugeridos (editables desde el primer día): Reunión interna, Actividad de formación (con EFS como caso destacado, ver [`06-modulo-actividades.md`](./06-modulo-actividades.md#2-tipos-de-actividad)), Actividad de territorio/punteo, Evento público, Asamblea. Cada tipo tiene un color asociado usado como código visual en el calendario y en el listado de Actividades.

## 5. Catálogo: Etiqueta

A diferencia de los otros tres catálogos, las Etiquetas se crean mayormente "sobre la marcha" desde el propio módulo de Personas (ver [`05-modulo-personas.md`](./05-modulo-personas.md#5-etiquetado)), no exclusivamente desde este panel. Este panel ofrece una vista centralizada para:

- Ver todas las etiquetas existentes con su conteo de uso (a cuántas Personas están asignadas).
- Fusionar dos etiquetas duplicadas por error de tipeo (por ejemplo, "delegadx" y "delegado/a") en una sola, reasignando todas las Personas afectadas.
- Desactivar etiquetas obsoletas.

## 6. Catálogo: ClasificacionPunteo

El catálogo más sensible de configurar, dado que define las categorías del módulo de punteo electoral ([`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md#4-clasificación-configurable)). Valores iniciales sugeridos siguiendo la convención habitual de punteo territorial (por ejemplo, una escala de afinidad de 5 niveles más "sin dato"), documentados como catálogo inicial editable, no como decisión cerrada — es una de las configuraciones que ATP con mayor probabilidad va a querer ajustar a su propio lenguaje interno antes de empezar a usar el módulo en producción.

Cambiar esta clasificación después de que ya existan registros de `PunteoPersona` no reclasifica retroactivamente los registros existentes (ver regla de negocio en la sección 10).

## 7. Gestión de roles personalizados

Ya introducida funcionalmente en [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md#6-gestión-de-roles-personalizados); este panel es el punto de entrada de esa funcionalidad, junto con la gestión de los cuatro catálogos de esta sección, bajo el mismo apartado de "Configuración" en la navegación.

## 8. Parámetros generales del sistema

Modelados sobre la entidad `ConfiguracionSistema` (clave-valor, ver [`04-modelo-datos.md`](./04-modelo-datos.md#configuracionsistema)):

| Clave | Descripción | Referenciado desde |
|---|---|---|
| `nombre_organizacion` | Nombre mostrado en la interfaz y en emails | Toda la interfaz |
| `umbral_confianza_duplicados` | Umbral de similitud a partir del cual la IA sugiere una posible Persona duplicada | [`15-ia.md`](./15-ia.md#2-detección-de-duplicados) |
| `dias_retencion_notificaciones_leidas` | Días tras los cuales una notificación leída deja de mostrarse en el listado (no se borra, se oculta) | [`13-notificaciones.md`](./13-notificaciones.md) |
| `formato_export_default` | Formato preferido por defecto al exportar (CSV o Excel) | [`14-importaciones-exportaciones.md`](./14-importaciones-exportaciones.md) |
| `email_notificaciones_activo` | Interruptor general de envío de emails de notificación | [`13-notificaciones.md`](./13-notificaciones.md#5-canales) |

Esta tabla de parámetros es intencionalmente pequeña en v1 — se agregan nuevas claves a medida que un valor concreto necesite dejar de estar fijo en código, no se anticipan parámetros especulativos sin uso real.

## 9. Interfaz

- Sección "Configuración" en la navegación principal, visible únicamente para el rol Administrador.
- Organizada en pestañas: Catálogos (con sub-pestañas por cada uno de los cuatro catálogos), Roles y permisos, Parámetros generales.
- Cada catálogo se edita en una tabla simple con edición inline, sin necesidad de pantallas de formulario separadas para operaciones tan livianas.
- Cambios en catálogos y parámetros generan su correspondiente evento en `HistorialCambio` (ver [`17-auditoria-historial.md`](./17-auditoria-historial.md#3-qué-se-registra)), dado su impacto potencial en el resto del sistema.

## 10. Reglas de negocio

- **RN-1**: Ningún valor de catálogo referenciado por al menos un registro de negocio puede eliminarse físicamente — solo desactivarse.
- **RN-2**: Desactivar un valor de catálogo no afecta a los registros existentes que ya lo usan; solo lo retira de los selectores para registros nuevos.
- **RN-3**: Cambiar el catálogo `ClasificacionPunteo` (agregar, renombrar o desactivar un nivel) no reclasifica automáticamente los registros `PunteoPersona` existentes que usaban un valor renombrado o desactivado — quedan con la referencia histórica intacta hasta que alguien los reclasifique manualmente.
- **RN-4**: Los cuatro catálogos, los roles personalizados y los parámetros generales son de acceso exclusivo del rol Administrador; ningún otro rol tiene acceso de lectura ni escritura a este módulo.

## 11. Permisos

| Permiso | Descripción | Roles con el permiso |
|---|---|---|
| `configuracion.ver` | Acceder a la sección de configuración | Administrador |
| `configuracion.editar_catalogos` | Crear, editar y desactivar valores de los cuatro catálogos | Administrador |
| `configuracion.editar_parametros` | Editar los parámetros generales del sistema | Administrador |
| `configuracion.gestionar_roles` | Crear y editar roles personalizados (ver [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md)) | Administrador |

---

### Documentos relacionados

- [`04-modelo-datos.md`](./04-modelo-datos.md) — modelado de las entidades de catálogo y `ConfiguracionSistema`
- [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md) — gestión de roles personalizados en detalle
- [`15-ia.md`](./15-ia.md) — uso del parámetro `umbral_confianza_duplicados`
- [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) — uso funcional del catálogo `ClasificacionPunteo`
