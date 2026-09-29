import { describe, expect, it } from 'vitest';

import { formatRelativeDate } from '@/components/star-rating';

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Instante de referencia fijo y lejano del reloj real. */
const AHORA = Date.parse('2026-09-29T12:00:00.000Z');

const hace = (ms: number) => new Date(AHORA - ms).toISOString();

describe('formatRelativeDate', () => {
  it('usa el instante que recibe, no el reloj del runtime', () => {
    // Si la función volviera a llamar a `new Date()`, este test falla: el
    // resultadoaría del reloj real y no de AHORA. Es el que atrapa una
    // regresión hacia la versión que rompía la hidratación.
    expect(formatRelativeDate(hace(5 * MIN), AHORA)).toBe('hace 5 min');
  });

  it('nunca muestra "hace 0 min"', () => {
    expect(formatRelativeDate(hace(0), AHORA)).toBe('hace 1 min');
    expect(formatRelativeDate(new Date(AHORA - 30_000).toISOString(), AHORA)).toBe('hace 1 min');
  });

  it('corta por hora al pasar la hora', () => {
    expect(formatRelativeDate(hace(59 * MIN), AHORA)).toBe('hace 59 min');
    expect(formatRelativeDate(hace(60 * MIN), AHORA)).toBe('hace 1 h');
    expect(formatRelativeDate(hace(23 * HORA), AHORA)).toBe('hace 23 h');
  });

  it('usa "ayer" entre las 24 y las 48 horas', () => {
    expect(formatRelativeDate(hace(24 * HORA), AHORA)).toBe('ayer');
    expect(formatRelativeDate(hace(47 * HORA), AHORA)).toBe('ayer');
  });

  it('cuenta días a partir de las 48 horas', () => {
    expect(formatRelativeDate(hace(48 * HORA), AHORA)).toBe('hace 2 días');
    expect(formatRelativeDate(hace(29 * DIA), AHORA)).toBe('hace 29 días');
  });

  describe('a partir de 30 días pasa a fecha absoluta', () => {
    it('omite el año cuando es el mismo', () => {
      expect(formatRelativeDate(hace(30 * DIA), AHORA)).toBe('30/08');
    });

    it('incluye el año cuando cambia', () => {
      expect(formatRelativeDate('2025-03-04T12:00:00.000Z', AHORA)).toBe('04/03/2025');
    });

    it('es la misma cadena sin importar la zona horaria del runtime', () => {
      // 4 de marzo a las 23:30 UTC: en un runtime en UTC-3 todavía es el día 4,
      // y en uno en UTC+3 ya es el 5. Fijar la zona del proceso y comparar
      // ambas pruebas es lo que prueba que el formato no se mueve.
      const iso = '2025-03-04T23:30:00.000Z';
      const original = process.env.TZ;

      try {
        process.env.TZ = 'UTC';
        const enUtc = formatRelativeDate(iso, AHORA);

        process.env.TZ = 'America/New_York';
        const enNuevaYork = formatRelativeDate(iso, AHORA);

        process.env.TZ = 'Asia/Tokyo';
        const enTokio = formatRelativeDate(iso, AHORA);

        expect(enNuevaYork).toBe(enUtc);
        expect(enTokio).toBe(enUtc);
        expect(enUtc).toBe('04/03/2025');
      } finally {
        process.env.TZ = original;
      }
    });
  });

  it('devuelve siempre la misma salida para la misma entrada', () => {
    const iso = hace(3 * DIA);
    const primera = formatRelativeDate(iso, AHORA);

    for (let i = 0; i < 50; i++) {
      expect(formatRelativeDate(iso, AHORA)).toBe(primera);
    }
  });
});
