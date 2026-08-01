# Módulo: Buscador Global

[← Índice general](./00-README.md)

## Índice

1. [Objetivo del módulo](#1-objetivo-del-módulo)
2. [Alcance de la búsqueda](#2-alcance-de-la-búsqueda)
3. [Comportamiento de búsqueda](#3-comportamiento-de-búsqueda)
4. [Estrategia técnica](#4-estrategia-técnica)
5. [Ranking de resultados](#5-ranking-de-resultados)
6. [Interfaz](#6-interfaz)
7. [Privacidad en los resultados](#7-privacidad-en-los-resultados)
8. [Permisos relevantes](#8-permisos-relevantes)

---

## 1. Objetivo del módulo

Ofrecer un único punto de entrada, accesible desde cualquier pantalla del sistema, para encontrar cualquier registro relevante sin tener que saber de antemano en qué módulo vive. Un militante que recuerda un nombre a medias, o que solo tiene un número de teléfono, tiene que poder llegar a la ficha correcta en segundos.

## 2. Alcance de la búsqueda

| Entidad | Campos indexados |
|---|---|
| `Persona` | Nombre, apellido, DNI, legajo, teléfonos, emails, Instagram, observaciones generales, nombre de etiquetas asociadas |
| `Actividad` | Nombre, descripción, lugar |
| `PadronEntrada` (con permiso `padron.ver`) | DNI, nombre completo original — para ubicar rápido una entrada puntual del padrón durante la revisión de matching |

El punteo (`PunteoPersona`, `PunteoComentario`) **no forma parte del índice del buscador global**, ni siquiera para el usuario dueño de ese punteo: acceder al punteo de una persona siempre pasa por su ficha (pestaña Punteo), nunca por resultados de búsqueda libre de texto, para no crear una superficie adicional de exposición accidental de un dato privado (ver [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md)).

## 3. Comportamiento de búsqueda

- **Tolerante a errores de tipeo y a tildes** (búsqueda difusa, no solo coincidencia exacta) — buscar "gonzalez" debe encontrar "González".
- **Multi-campo simultáneo**: una única caja de búsqueda consulta todos los campos indexados a la vez, sin que el usuario tenga que elegir de antemano "buscar por teléfono" o "buscar por nombre".
- **Resultados agrupados por tipo de entidad** (Personas primero por defecto, dado que es el caso de uso dominante; Actividades y otras entidades en secciones separadas debajo).
- **Búsqueda incremental**: resultados que se actualizan mientras el usuario tipea, con un debounce breve para no saturar de consultas al backend en cada tecla.

## 4. Estrategia técnica

- PostgreSQL con las extensiones **`pg_trgm`** (búsqueda por similitud de trigramas, base de la tolerancia a errores de tipeo) y **`unaccent`** (para ignorar tildes de forma consistente), sobre los índices definidos en [`04-modelo-datos.md`](./04-modelo-datos.md#17-estrategia-general-de-índices).
- Para coincidencias exactas de campos estructurados (DNI, legajo, teléfono, email) se prioriza búsqueda exacta indexada por sobre la búsqueda difusa, dado que son campos donde una coincidencia exacta es mucho más significativa que una aproximada.
- El buscador siempre respeta los permisos del usuario que busca: nunca devuelve, por ejemplo, entradas de `PadronEntrada` a un usuario sin `padron.ver`, aunque el término de búsqueda coincida (ver sección 7).

## 5. Ranking de resultados

Orden de prioridad al mostrar resultados mezclados:

1. Coincidencia exacta de un identificador único (DNI, legajo, email, teléfono).
2. Coincidencia exacta de nombre completo.
3. Coincidencia difusa de nombre/apellido, ordenada por score de similitud descendente.
4. Coincidencias en campos secundarios (observaciones, descripción de actividad).

## 6. Interfaz

- Accesible con un atajo de teclado global (por ejemplo `Cmd/Ctrl+K`) además del ícono de búsqueda siempre visible en la barra superior — ver [`19-ux-ui.md`](./19-ux-ui.md).
- En mobile, el buscador ocupa una vista propia de pantalla completa al activarse (no un dropdown angosto), dado que la mayoría de las búsquedas en el celular ocurren en movimiento y necesitan objetivos táctiles grandes.
- Cada resultado muestra suficiente contexto para reconocer a la persona/actividad correcta sin tener que entrar (ej.: nombre completo + carrera + año para una Persona), reduciendo clics en falso.

## 7. Privacidad en los resultados

El buscador aplica el mismo filtrado de permisos que cualquier otra vista del sistema — no es una vía alternativa para sortear restricciones de acceso. En particular:

- Un usuario sin `padron.ver` nunca ve resultados de `PadronEntrada`, sin importar cuán específico sea su término de búsqueda.
- Los resultados de Persona no exponen el punteo de nadie en la vista previa de resultados, incluso si el término de búsqueda coincidiera casualmente con contenido de un comentario de punteo (que, de todos modos, no está indexado — ver sección 2).

## 8. Permisos relevantes

El buscador no introduce permisos propios: reutiliza `personas.ver`, `actividades.ver` y `padron.ver` para decidir qué tipos de resultado puede ver cada usuario (ver [`10-usuarios-roles-permisos.md`](./10-usuarios-roles-permisos.md)).

---

### Documentos relacionados

- [`04-modelo-datos.md`](./04-modelo-datos.md) — índices que sostienen la búsqueda
- [`08-modulo-punteo-electoral.md`](./08-modulo-punteo-electoral.md) — por qué el punteo queda fuera del índice
- [`19-ux-ui.md`](./19-ux-ui.md) — ubicación e interacción del buscador en la interfaz
