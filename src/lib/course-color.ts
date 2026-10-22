// src/lib/course-color.ts
//
// Un color estable por curso, derivado de su id.
//
// La misma paleta la calculaban por separado el calendario unificado y la
// lista de usuarios, cada una con su propio arreglo. Ahora sale de acá, así
// el punto del menú superior, el riel bajo la barra y el color del curso en
// el calendario son siempre el mismo.
//
// Son colores de identificación, no de estado: solo se usan como punto,
// riel o barra lateral, nunca como fondo de texto.
const COLORES = [
  '#6366f1', // índigo
  '#0d9488', // teal
  '#be185d', // magenta
  '#d97706', // ámbar
  '#059669', // verde
  '#7c3aed', // violeta
  '#0284c7', // celeste
  '#c2410c', // naranja quemado
]

export function colorDeCurso(id: string): string {
  let n = 0
  for (const c of id) n += c.charCodeAt(0)
  return COLORES[n % COLORES.length]
}
