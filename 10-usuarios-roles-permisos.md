# Módulo: Usuarios, Roles y Permisos

[← Índice general](./00-README.md)

## Índice

1. [Objetivo del módulo](#1-objetivo-del-módulo)
2. [Modelo de autorización](#2-modelo-de-autorización)
3. [Roles base del sistema](#3-roles-base-del-sistema)
4. [Catálogo completo de permisos](#4-catálogo-completo-de-permisos)
5. [Matriz de permisos por rol base](#5-matriz-de-permisos-por-rol-base)
6. [Gestión de usuarios](#6-gestión-de-usuarios)
7. [Gestión de roles personalizados](#7-gestión-de-roles-personalizados)
8. [Ciclo de vida de un usuario](#8-ciclo-de-vida-de-un-usuario)
9. [Reglas de negocio del módulo](#9-reglas-de-negocio-del-módulo)

---

## 1. Objetivo del módulo

Definir quién puede hacer qué dentro del sistema, con la granularidad suficiente para que la organización pueda delegar responsabilidades de forma segura a medida que crece, sin que eso implique dar acceso total a cada nuevo militante que se suma.

Este módulo es la base sobre la que se apoya la autorización de **todos** los demás módulos: cada acción descripta en el resto de la documentación tiene un permiso asociado, definido acá.

## 2. Modelo de autorización

El sistema usa **RBAC (Role-Based Access Control) con permisos granulares**, no roles fijos con comportamiento hardcodeado:

- Un **`Permiso`** es la unidad mínima, con formato `modulo.accion` (ej. `personas.editar`).
- Un **`Rol`** es un conjunto nombrado de permisos.
- Un **`Usuario`** tiene un único rol principal asignado (ver supuesto S3 en [`01-vision-alcance.md`](./01-vision-alcance.md)), del cual hereda todos sus permisos.

Esto significa que, aunque el sistema se entrega con cuatro roles base predefinidos (sección 3), **la organización puede crear roles adicionales** combinando permisos de forma distinta sin necesidad de un cambio de código (sección 7).

La verificación de permisos ocurre en la capa de servicios en el servidor (nunca solo en el cliente — ocultar un botón en la UI no es una medida de seguridad, ver [`16-seguridad.md`](./16-seguridad.md)), reforzada por políticas de RLS en la base de datos para los módulos más sensibles (particularmente Punteo).

## 3. Roles base del sistema

Estos cuatro roles se cargan al iniciar el sistema y no pueden eliminarse (`Rol.es_rol_sistema = true`), aunque sus permisos asignados sí pueden ajustarse desde [`18-configuracion-sistema.md`](./18-configuracion-sistema.md) si la organización lo necesita.

| Rol | Perfil típico | Filosofía de acceso |
|---|---|---|
| **Administrador** | Conducción de la organización | Acceso total: configuración, todos los punteos, gestión de usuarios, auditoría completa |
| **Coordinador** | Responsable de un área o de actividades específicas | Gestión amplia de Personas y Actividades, estadísticas ampliadas, **sin** acceso a punteo ajeno por defecto |
| **Militante** | Miembro de base, el perfil más numeroso | Gestión de su propio punteo, participación en actividades como responsable o colaborador, lectura de Personas |
| **Lectura** | Perfil de solo consulta (por ejemplo, alguien en incorporación, o un rol de auditoría externa puntual) | Solo lectura de Personas y Actividades, sin acceso a punteo, sin capacidad de edición |

## 4. Catálogo completo de permisos

Organizado por módulo. Este catálogo es la referencia única — los documentos de cada módulo listan un subconjunto "relevante" a modo de resumen, pero este es el listado completo y autoritativo.

| Módulo | Permisos |
|---|---|
| Personas | `personas.ver`, `personas.crear`, `personas.editar`, `personas.archivar`, `personas.fusionar_duplicados`, `personas.exportar` |
| Actividades | `actividades.ver`, `actividades.crear`, `actividades.editar`, `actividades.eliminar`, `actividades.gestionar_todas` |
| Participaciones | `participaciones.gestionar`, `participaciones.gestionar_masivo` |
| Punteo | `punteo.ver_propio`, `punteo.ver_todos`, `punteo.exportar_propio`, `punteo.exportar_todos` |
| Padrón | `padron.ver`, `padron.importar`, `padron.gestionar`, `padron.exportar` |
| Usuarios y permisos | `usuarios.ver`, `usuarios.gestionar`, `roles.gestionar` |
| Dashboard | `dashboard.ver_personal`, `dashboard.ver_administrativo` |
| Buscador | `buscador.usar` (otorgado por defecto a todo rol operativo) |
| Notificaciones | `notificaciones.gestionar_reglas` (crear/editar reglas de notificación automática, no la recepción, que es implícita para todo usuario) |
| Importaciones/Exportaciones | `importaciones.ejecutar`, `exportaciones.ejecutar` |
| IA | `ia.usar_chatbot`, `ia.gestionar_duplicados`, `ia.gestionar_insights` |
| Auditoría | `auditoria.ver` |
| Configuración | `configuracion.gestionar` |

## 5. Matriz de permisos por rol base

`✓` = otorgado · `—` = no otorgado · `✓*` = otorgado solo sobre recursos propios

| Permiso | Administrador | Coordinador | Militante | Lectura |
|---|---|---|---|---|
| `personas.ver` | ✓ | ✓ | ✓ | ✓ |
| `personas.crear` / `.editar` | ✓ | ✓ | ✓ | — |
| `personas.archivar` | ✓ | ✓ | — | — |
| `personas.fusionar_duplicados` | ✓ | ✓ | — | — |
| `personas.exportar` | ✓ | ✓ | — | — |
| `actividades.ver` | ✓ | ✓ | ✓ | ✓ |
| `actividades.crear` / `.editar` | ✓ | ✓ | ✓* (solo propias) | — |
| `actividades.eliminar` | ✓ | ✓ | — | — |
| `actividades.gestionar_todas` | ✓ | ✓ | — | — |
| `participaciones.gestionar` | ✓ | ✓ | ✓ | — |
| `participaciones.gestionar_masivo` | ✓ | ✓ | — | — |
| `punteo.ver_propio` | ✓ | ✓ | ✓ | — |
| `punteo.ver_todos` | ✓ | — | — | — |
| `punteo.exportar_propio` | ✓ | ✓ | ✓ | — |
| `punteo.exportar_todos` | ✓ | — | — | — |
| `padron.ver` | ✓ | ✓ | ✓ | ✓ |
| `padron.importar` / `.gestionar` | ✓ | — | — | — |
| `usuarios.gestionar` / `roles.gestionar` | ✓ | — | — | — |
| `dashboard.ver_personal` | ✓ | ✓ | ✓ | — |
| `dashboard.ver_administrativo` | ✓ | ✓ | — | — |
| `importaciones.ejecutar` | ✓ | ✓ | — | — |
| `exportaciones.ejecutar` | ✓ | ✓ | ✓* (propio) | — |
| `ia.usar_chatbot` | ✓ | ✓ | ✓ | — |
| `ia.gestionar_duplicados` | ✓ | ✓ | — | — |
| `auditoria.ver` | ✓ | — | — | — |
| `configuracion.gestionar` | ✓ | — | — | — |

Esta matriz es el estado inicial cargado al desplegar el sistema, editable después desde la UI de configuración por cualquier usuario con `roles.gestionar`.

## 6. Gestión de usuarios

- El alta de un usuario nuevo la realiza un Administrador desde `/usuarios`: nombre, apellido, email y rol. El sistema envía una invitación vía Supabase Auth (magic link o definición de contraseña, según se configure) — no se comparten contraseñas manualmente entre personas.
- Un usuario puede cambiar su propio nombre, apellido, teléfono y contraseña; **no puede cambiar su propio rol** (evidente por seguridad, pero se deja explícito).
- El listado de usuarios muestra, junto a cada uno, su último acceso y su rol, como vista rápida de quién está activo en el sistema.

## 7. Gestión de roles personalizados

Un Administrador puede, desde [`18-configuracion-sistema.md`](./18-configuracion-sistema.md):

- Crear un rol nuevo, con nombre y descripción propios, y seleccionar cualquier combinación de permisos del catálogo de la sección 4.
- Editar el conjunto de permisos de un rol existente, incluidos los cuatro roles base (con una advertencia explícita en la UI antes de modificar un rol base, dado su impacto potencialmente amplio).
- Eliminar un rol personalizado, siempre que no tenga usuarios asignados (si los tiene, se debe reasignar esos usuarios a otro rol primero).

## 8. Ciclo de vida de un usuario

```
   [Invitación] → activo → inactivo
```

- **activo**: puede iniciar sesión y operar según su rol.
- **inactivo**: no puede iniciar sesión. Se usa en lugar de eliminar al usuario cuando deja de participar activamente, preservando la trazabilidad de todo lo que hizo (autoría en `HistorialCambio`, sus `Actividad` como responsable, su punteo — ver [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md#11-reglas-de-negocio-del-módulo)).
- Al desactivar un usuario que es responsable de alguna `Actividad` planificada o en curso, el sistema exige reasignar esas actividades a otro responsable como parte del mismo flujo (ver regla en [`06-modulo-actividades.md`](./06-modulo-actividades.md#8-reglas-de-negocio-del-módulo)).

## 9. Reglas de negocio del módulo

- No puede existir un sistema con cero usuarios `Administrador` activos — el sistema impide desactivar al último Administrador activo, para evitar quedar sin nadie con capacidad de gestión.
- Un usuario no puede eliminarse físicamente en ningún caso, solo desactivarse (coherente con el principio de cero pérdida de datos de [`01-vision-alcance.md`](./01-vision-alcance.md)).
- Cambiar el rol de un usuario queda registrado en `HistorialCambio` con la acción `cambio_permiso`, incluyendo el rol anterior y el nuevo.

---

### Documentos relacionados

- [`04-modelo-datos.md`](./04-modelo-datos.md) — estructura de datos de `Usuario`, `Rol`, `Permiso`
- [`16-seguridad.md`](./16-seguridad.md) — cómo se refuerzan estos permisos con RLS
- [`18-configuracion-sistema.md`](./18-configuracion-sistema.md) — dónde se gestionan roles personalizados
