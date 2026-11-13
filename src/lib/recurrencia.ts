// src/lib/recurrencia.ts
//
// Genera las fechas de un cronograma que se repite: "martes, jueves y
// viernes durante dos semanas, y después un jueves dos semanas más tarde".
//
// Hasta ahora, para cargar un curso había dos caminos: importar un CSV que
// ya tenías armado, o dar de alta los encuentros de a uno. Cuando sabés los
// días de antemano —que es lo normal al abrir un curso— las dos opciones
// son trabajo de más.
//
// Esto es solo el cálculo de fechas, sin React ni base de datos, para poder
// probarlo aparte: es la parte donde se esconden los errores de huso horario
// y de fin de mes.

/** Lunes = 0 … domingo = 6. Es la convención que ya usa el calendario. */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

export type Frecuencia = 'diaria' | 'semanal' | 'mensual'

export type Fin =
  | { tipo: 'cantidad'; cantidad: number }
  | { tipo: 'fecha'; hasta: string }

export interface Recurrencia {
  /** Primer día posible, 'YYYY-MM-DD'. */
  desde: string
  frecuencia: Frecuencia
  /** Cada cuántos días / semanas / meses. */
  cada: number
  /** Solo para la frecuencia semanal. */
  dias: DiaSemana[]
  fin: Fin
}

/** Tope duro: ningún curso tiene 400 encuentros, y evita un bucle infinito. */
export const MAX_ENCUENTROS = 400

// ── Fechas ───────────────────────────────────────────────────────────────
// Se trabaja con Date al MEDIODÍA local. Si se usara la medianoche, en los
// países que cambian la hora un "+1 día" puede caer a las 23:00 del mismo
// día y la fecha sale corrida; al mediodía hay doce horas de colchón.

function aFecha(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d, 12, 0, 0, 0)
}

export function aIso(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

function sumarDias(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0, 0)
}

/** Lunes = 0 … domingo = 6, a partir del getDay() de JS (domingo = 0). */
export function diaSemanaDe(iso: string): DiaSemana {
  return ((aFecha(iso).getDay() + 6) % 7) as DiaSemana
}

// ── Generación ───────────────────────────────────────────────────────────

/**
 * Las fechas de la recurrencia, ordenadas y sin repetir.
 * Devuelve [] si la configuración no produce ninguna (por ejemplo, "hasta"
 * anterior a "desde", o semanal sin ningún día elegido).
 */
export function generarFechas(r: Recurrencia): string[] {
  if (!r.desde) return []

  const cada = Math.max(1, Math.floor(r.cada) || 1)
  const maximo = r.fin.tipo === 'cantidad'
    ? Math.max(1, Math.min(Math.floor(r.fin.cantidad) || 1, MAX_ENCUENTROS))
    : MAX_ENCUENTROS
  const hasta = r.fin.tipo === 'fecha' ? r.fin.hasta : null
  if (hasta && hasta < r.desde) return []

  const fechas: string[] = []
  let cortar = false

  /** Suma una fecha. Devuelve false cuando ya no hay que seguir. */
  function agregar(d: Date) {
    const iso = aIso(d)
    if (iso < r.desde) return          // antes del arranque: se descarta
    if (hasta && iso > hasta) { cortar = true; return }
    fechas.push(iso)
    if (fechas.length >= maximo) cortar = true
  }

  const inicio = aFecha(r.desde)

  if (r.frecuencia === 'diaria') {
    let d = inicio
    for (let i = 0; i < MAX_ENCUENTROS * 2 && !cortar; i++) {
      agregar(d)
      d = sumarDias(d, cada)
    }
  }

  if (r.frecuencia === 'semanal') {
    // Sin días elegidos no hay nada que generar: quien llama decide si
    // preseleccionar el día de la fecha de inicio.
    const dias = [...new Set(r.dias)].sort((a, b) => a - b)
    if (dias.length === 0) return []

    // Lunes de la semana en la que cae el arranque.
    let lunes = sumarDias(inicio, -diaSemanaDe(r.desde))
    // 520 semanas = diez años; con el tope de encuentros alcanza y sobra.
    for (let semana = 0; semana < 520 && !cortar; semana++) {
      for (const dia of dias) {
        if (cortar) break
        agregar(sumarDias(lunes, dia))
      }
      lunes = sumarDias(lunes, 7 * cada)
    }
  }

  if (r.frecuencia === 'mensual') {
    const diaDelMes = inicio.getDate()
    for (let i = 0; i < 240 && !cortar; i++) {
      const base = new Date(inicio.getFullYear(), inicio.getMonth() + i * cada, 1, 12)
      // Si el mes no llega a ese día (31 en febrero), se usa el último.
      const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
      agregar(new Date(base.getFullYear(), base.getMonth(), Math.min(diaDelMes, ultimo), 12))
    }
  }

  return [...new Set(fechas)].sort()
}

/** Una línea que describe la repetición, para confirmar antes de generar. */
export function describir(r: Recurrencia): string {
  const cada = Math.max(1, Math.floor(r.cada) || 1)
  let cuando: string

  if (r.frecuencia === 'diaria') {
    cuando = cada === 1 ? 'Todos los días' : `Cada ${cada} días`
  } else if (r.frecuencia === 'mensual') {
    cuando = cada === 1 ? 'Una vez por mes' : `Cada ${cada} meses`
  } else {
    const dias = [...new Set(r.dias)].sort((a, b) => a - b)
    if (dias.length === 0) return 'Elegí al menos un día de la semana.'
    const nombres = dias.map(d => DIAS_LARGOS[d])
    const lista = nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
    cuando = cada === 1 ? `Todos los ${lista}` : `Cada ${cada} semanas, los ${lista}`
  }

  const fin = r.fin.tipo === 'cantidad'
    ? `hasta completar ${r.fin.cantidad} ${r.fin.cantidad === 1 ? 'encuentro' : 'encuentros'}`
    : `hasta el ${r.fin.hasta.split('-').reverse().join('/')}`

  return `${cuando}, ${fin}.`
}
