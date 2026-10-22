// src/lib/theme.ts
//
// Tema claro / oscuro.
//
// Hasta ahora el <html> venía con data-theme="dark" escrito a mano: los
// tokens del tema claro existían en globals.css pero no había forma de
// llegar a ellos. Esto es lo que faltaba para que el botón sirva.
//
// La preferencia se guarda en localStorage y no en el perfil a propósito:
// es de este dispositivo. La misma persona puede querer claro en la notebook
// del aula y oscuro en casa.

export type Theme = 'light' | 'dark'

export const THEME_KEY = 'docenteapp-theme'

/** Lo que el navegador dice que prefiere el sistema. */
export function themeDelSistema(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** Tema elegido, o el del sistema si nunca se eligió. */
export function temaActual(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const guardado = localStorage.getItem(THEME_KEY)
    if (guardado === 'light' || guardado === 'dark') return guardado
  } catch {
    // Modo privado o almacenamiento bloqueado: no es motivo para romper.
  }
  return themeDelSistema()
}

export function aplicarTema(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
  try { localStorage.setItem(THEME_KEY, t) } catch { /* ver arriba */ }
}

/**
 * Script que corre ANTES de pintar, inyectado en el <head>.
 *
 * Sin esto la página aparece con el tema por defecto y recién al hidratar
 * React cambia al elegido: un flash blanco de medio segundo en cada carga,
 * que en un sitio estático servido desde Hostinger se nota especialmente.
 * Por eso es una cadena y no un componente.
 */
export const SCRIPT_TEMA = `(function(){try{
var t=localStorage.getItem('${THEME_KEY}');
if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}
document.documentElement.setAttribute('data-theme',t);
}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`
