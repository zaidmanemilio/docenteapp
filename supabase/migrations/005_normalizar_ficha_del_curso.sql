-- ✅ APLICADA EN PRODUCCIÓN el 2026-10-25.
-- Se conserva como referencia del cambio. NO hace falta volver a correrla.
--
-- El encuentro 0 es la ficha del curso, no una clase. El modal ahora lo
-- trata como tal: sin fecha, sin tipo, sin estado de dictado, sin modalidad,
-- sin horario y sin review post-clase, y con el título fijo en todos los
-- cursos.
--
-- Esto alinea las filas que ya existían. La única desalineada era la del
-- curso archivado "MDM - Innovación Tecnológica 2026": tenía el título viejo
-- ("ESTRUCTURA DE LOS ENCUENTROS") y una fecha cargada (2026-08-10), con lo
-- cual aparecía en los calendarios como si fuera una clase. Los tres cursos
-- activos ya estaban bien.
update public.sessions
set title      = 'ESTRUCTURA DEL CURSO',
    date       = null,
    status     = 'dada',
    updated_at = now()
where class_number = 0
  and (title <> 'ESTRUCTURA DEL CURSO' or date is not null or status <> 'dada');
