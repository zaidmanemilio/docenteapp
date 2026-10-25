-- ✅ APLICADA EN PRODUCCIÓN el 2026-10-25.
-- Se conserva como referencia del cambio. NO hace falta volver a correrla.
--
-- El encuentro 0 es la ficha del curso ("ESTRUCTURA DEL CURSO"), no una clase
-- que se dicte. Quedaba en estado 'pendiente', y por eso un curso con todas
-- sus clases dadas nunca llegaba al 100% en el Panel: la ficha arrastraba el
-- conteo hacia abajo, y además aparecía en la lista de clases por dar, donde
-- no tiene nada que hacer.
--
-- Lo tenían en 'pendiente' los tres cursos activos (Datos-Cooperativa,
-- END - Agilidad y Maestría en TD - UNNOBA); el archivado ya estaba en 'dada'.
--
-- El cronograma ahora fuerza 'dada' al guardar cualquier encuentro 0
-- (ScheduleClient, handleSave), así que esto solo arregla los que ya estaban.
update public.sessions
set status = 'dada', updated_at = now()
where class_number = 0
  and status <> 'dada';
