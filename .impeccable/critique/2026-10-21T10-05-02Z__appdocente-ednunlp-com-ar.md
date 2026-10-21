---
target: "https://appdocente.ednunlp.com.ar/"
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 5
target_identity: "url:https://appdocente.ednunlp.com.ar/"
timestamp: 2026-10-21T10-05-02Z
slug: appdocente-ednunlp-com-ar
---
# Crítica de diseño — DocenteApp

Método: dual-agente (A: revisión de diseño · B: detector + evidencia de navegador).
Objetivo del usuario: que se vea más linda y transmita contenido premium.
Modo: Operate. Superficies: login en producción + reconstrucción fiel de Cronograma / Dashboard / estado vacío con el CSS compilado real y datos reales.

## Salud de diseño: 19/40

| # | Heurística | Puntaje | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 2 | "Cargando…" en texto plano; guardar cierra sin confirmar; renumerar hace N escrituras sin progreso. |
| 2 | Correspondencia con el mundo real | 3 | Vocabulario docente excelente; permisos en enum crudo inglés (full/edit/read). |
| 3 | Control y libertad | 2 | Sin deshacer en renumerar, replicar horario ni borrado masivo. |
| 4 | Consistencia y estándares | 1 | 5 vocabularios para el mismo enum; 2 sets de etiquetas de rol contradictorios; 776 estilos inline vs 150 clases. |
| 5 | Prevención de errores | 2 | Buenas guardas de datos, pero bulkChangeResponsible es prompt() de texto libre. |
| 6 | Reconocer antes que recordar | 2 | 6 pestañas con ~30 campos sin indicar cuáles tienen contenido. |
| 7 | Flexibilidad y eficiencia | 3 | Features potentes (pin, masiva, ICS, CSV); cero soporte de teclado. |
| 8 | Estética y minimalismo | 2 | SQL crudo en pantalla; emojis mezclados con Tabler; 22 matices compitiendo. |
| 9 | Recuperación de errores | 1 | alert() con el mensaje crudo de Postgres; syncUsers manda a correr SQL en Supabase. |
| 10 | Ayuda y documentación | 1 | La definición de permisos vive en Configuración, no en Usuarios y permisos. |

## Veredicto de especificidad

El contenido es específico; la forma es genérica. El modelo de datos conoce la docencia (tipos de encuentro, encuentro 0, review post-clase con tiempo estimado vs real, checklist Moodle). La interfaz no heredó nada: el Cronograma es una tabla de 10 columnas sin eje temporal, sin agrupación por mes, sin marca de "hoy", sin distinguir pasado de futuro. Cambiando sustantivos es un gestor de incidencias.

Sobre "premium": el problema no es falta de pulido sino de jerarquía. 17 tamaños tipográficos, 77% de las declaraciones entre 11 y 13px, el texto más grande es un KPI de 26px. 22 matices a la misma saturación. Premium = rango de escala + una sola voz de color + una cosa obviamente principal. No hay ninguna de las tres.

## Evidencia mecánica

Detector sobre markup: limpio (0 hallazgos en 6 objetivos, 14 archivos; 1 en globals.css:174 `side-tab`). Verificado que no es un no-op ni hay supresiones.
Detector sobre render: 31 hallazgos — 16 low-contrast, 6 undersized-ui-text, 4 side-tab, 2 nested-cards, 2 tiny-text, 1 cramped-padding.

Contraste medido (WCAG, tema oscuro real):
- blanco sobre --accent #818cf8 = **2.98:1** FALLA (todos los botones primarios, incl. "Ingresar")
- #555575 sobre sidebar = **2.62:1** FALLA · sobre tarjeta login = **2.19:1** FALLA
- #888 sobre tarjeta login = **4.41:1** FALLA
- Corrección: --text-muted SÍ pasa (5.71-7.30:1) y los placeholders también (5.13:1).

Accesibilidad de formularios (sistémico): **94 controles, 0 con aria-label, 0 con htmlFor, 1 con id**. En el login, ningún input tiene nombre programático. El login no emite ningún landmark.
Tap targets a 390px: 14 de 18 bajo 44px en Cronograma (7 botones de 16×40). Login: botón 268×41.
Anillo de foco: PASA en todos los tipos, contraste 4.21-6.28:1.
Sin overflow horizontal. Sin errores de consola. h1 = marca a 13px, menor que el h2 de página a 20px (jerarquía invertida).

## Fortalezas

1. **Review post-clase + checklist Moodle**: codifica el ciclo real de dar clase y se cierra con alertas accionables en el Dashboard. Un CRUD genérico no puede tener esto.
2. **Motor de alertas del Dashboard**: 10 reglas de dominio, condicionadas por tipo de encuentro, pluralizadas, con degradación a "¡Todo en orden!". Es el único lugar que dice qué hacer, no qué hay.
3. **Bloque de accesibilidad de globals.css**: focus-visible global, piso táctil de 40px en punteros gruesos. Pensamiento de sistema — pero es el 20% del CSS.

## Problemas prioritarios

### P1 — El 89% de los usuarios aterriza en un callejón sin salida
41 de 46 docentes (verificado en base) no tienen ningún curso. Ven una sola línea gris. Los 8 ítems de navegación se pintan activos y responden al clic, pero navigate() hace return silencioso (verificado, Sidebar.tsx). La copy los manda a "Cursos archivados", que está detrás de {isAdmin &&} — instrucción imposible. El fallback de lista vacía dice "Sin cursos de Posgrado" aunque el filtro esté en Todos (verificado, Sidebar.tsx:224).
Fix: destino por defecto = Calendario unificado (global, sin permisos de curso); estado inicial con nombre y rol; mailto prellenado al admin; atenuar y desactivar la navegación sin curso.

### P2 — El botón primario falla contraste en toda la app, incluido producción
blanco sobre #818cf8 = 2.98:1. Un primario lavado se lee como deshabilitado: es lo contrario de premium y es lo primero que ve todo el mundo.
Fix: separar accent de superficie del accent de texto. --accent-solid #4f46e5 para fondos (6.29:1); dejar #818cf8 solo para texto/íconos.

### P3 — Cinco vocabularios para el mismo permiso, y el modelo de dos ejes nunca se nombra
full/edit/read crudos en un select, "Lectura (read)" en otro, "Todas · read" en un badge, "Full/Edición/Lectura" en Presentación, y la única definición escondida en Configuración. Dos sets contradictorios de etiquetas de rol global en la misma pantalla. Además la lista dice "Sin acceso a este curso" a usuarios que sí tienen acceso por rol global.
Datos: 2 guests con permiso de escritura (contradice "lectura global"), 8 permisos redundantes de admin, 34 de 49 perfiles muestran un email donde va el nombre.
Fix: un único PERMISSION_LABELS por lo que habilita ("Co-titular — puede eliminar"); mostrar permiso efectivo con su origen; mover la explicación a Usuarios y permisos; reemplazar el prompt() por el select existente.

### P4 — Las operaciones de más riesgo viven en diálogos nativos
48 alert/confirm/prompt. Renumerar: prompt + confirm con lista en texto plano + N escrituras sin progreso + posible fallo parcial sin deshacer. Dar permiso: prompt pidiendo tipear un enum en inglés. Una app cuidada no muestra un window.prompt del sistema.
Fix: ConfirmDialog reutilizando .modal-overlay/.modal-panel, con preview renderizado, etiqueta que nombre la acción, progreso i de N y deshacer de 10s.

### P5 — El Cronograma no sabe que es un cronograma
Sin eje temporal, sin "hoy", sin agrupar por mes. La columna Ver usa ícono de play. La columna Links pinta cuadrados grises deshabilitados en cada fila. .filter-row está definida en CSS y usada 0 veces (verificado): es CSS muerto escrito justo para arreglar el apilado de la barra de botones.
Fix: aplicar .filter-row; separadores de mes sticky; regla de 2px en accent entre pasado y próximo; pasado a opacity .6; cambiar el ícono play; no renderizar links vacíos.

## Banderas por persona

- **Docente sin curso (41 de 46)**: 8 clics muertos, instrucción a una pantalla que no puede ver, mensaje de lista vacía incorrecto.
- **Colaborador con edit**: puede renumerar los 30 encuentros y sobreescribir todos los horarios (protegidos por canEdit), pero no borrar uno solo. Nunca ve cuál es su propio permiso.
- **Admin en inicio de cuatrimestre**: prompt() uno por uno para 46 personas; la pantalla Usuarios y permisos no muestra de qué curso es; un bloque de SQL crudo renderizado en producción.

## Observaciones menores

archiveCourse() declarada dos veces en ConfigClient (94 y 193): por hoisting gana la segunda y el confirm más explicativo es código muerto (verificado). Mezcla usted/vos. #f3f4f6 de tema claro usado como borde sobre superficies oscuras. Tema claro completo definido y nunca ejecutable (no hay toggle). 3 implementaciones de modal. Cero manejo de teclado ni Escape. La pestaña Review avisa que se completa al estar "Dada" pero no deshabilita los campos.

## Conflicto entre evaluaciones

A reportó que la barra de botones se sale de pantalla a 390px; B midió scrollWidth == clientWidth (sin overflow del documento). Ambas son correctas: el contenido se recorta dentro de .app-main (que tiene overflow propio) en vez de desbordar el documento, así que no hay scroll pero sí contenido inalcanzable — peor que un overflow visible.
