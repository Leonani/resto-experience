/**
 * Gate de métricas: verifica que el fixture produce exactamente los valores de
 * la tabla de referencia de PLAN_EJECUCION.md.
 *
 * Corre sin base de datos. Es la red que detecta que un cambio en la lógica de
 * métricas rompió un caso sucio antes de que el gerente lo note en pantalla.
 *
 *   npm run verify:metrics
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { dedupeReviews } from '../lib/import/dedupe';
import { calculateLocationSummary } from '../lib/metrics';
import { isResponded, type ReviewsFile, type Review } from '../lib/types/review';

type Expected = {
  locationId: string;
  locationName: string;
  totalReviews: number;
  ratedReviews: number;
  averageRating: number | null;
  repliedCount: number;
  replyPercentage: number;
};

/** Espejo de la tabla de referencia. Si cambia uno, cambia el otro. */
const REFERENCE: Expected[] = [
  {
    locationId: 'loc-1',
    locationName: 'Palermo',
    totalReviews: 9,
    ratedReviews: 8,
    averageRating: 3.63,
    repliedCount: 2,
    replyPercentage: 22.2,
  },
  {
    locationId: 'loc-3',
    locationName: 'Centro',
    totalReviews: 6,
    ratedReviews: 6,
    averageRating: 3.67,
    repliedCount: 1,
    replyPercentage: 16.7,
  },
  {
    locationId: 'loc-2',
    locationName: 'Belgrano',
    totalReviews: 0,
    ratedReviews: 0,
    averageRating: null,
    repliedCount: 0,
    replyPercentage: 0,
  },
];

function main(): void {
  const filePath = path.join(process.cwd(), 'data', 'reviews.json');
  const file = JSON.parse(readFileSync(filePath, 'utf-8')) as ReviewsFile;

  // Se replica el pipeline del importador: dedup (RN-01) y descarte de sede
  // inexistente (RN-02). Verificar solo las métricas sobre el archivo crudo
  // dejaría pasar los casos sucios, que es justo lo que este script vigila.
  const { unique, duplicates } = dedupeReviews(file.reviews);
  const validLocationIds = new Set(file.locations.map((l) => l.id));

  const reviews: Review[] = [];
  const skipped: string[] = [];

  for (const r of unique) {
    if (!validLocationIds.has(r.location_id)) {
      skipped.push(r.id);
      continue;
    }
    reviews.push({
      id: r.id,
      location_id: r.location_id,
      author: r.author,
      rating: r.rating,
      text: r.text,
      published_at: r.published_at,
      updated_at: r.updated_at,
      reply_text: r.reply?.text ?? null,
      replied_at: r.reply?.replied_at ?? null,
    });
  }

  const failures: string[] = [];

  // El catálogo no debe crecer por datos sucios (RN-02).
  if (file.locations.length !== 3) {
    failures.push(`El catálogo tiene ${file.locations.length} sedes, se esperaban 3.`);
  }

  // El duplicado conocido tiene que estar en el archivo.
  if (duplicates !== 1) {
    failures.push(`Se esperaban 1 duplicado (rv-205), se encontraron ${duplicates}.`);
  }

  // El descarte conocido tiene que estar en el archivo.
  if (skipped.length !== 1 || skipped[0] !== 'rv-301') {
    failures.push(
      `Se esperaba descartar rv-301, se descartaron: ${skipped.join(', ') || 'ninguna'}.`,
    );
  }

  for (const expected of REFERENCE) {
    const actual = calculateLocationSummary(expected.locationId, reviews);

    const checks: [keyof Expected, unknown, unknown][] = [
      ['totalReviews', actual.totalReviews, expected.totalReviews],
      ['ratedReviews', actual.ratedReviews, expected.ratedReviews],
      ['averageRating', actual.averageRating, expected.averageRating],
      ['repliedCount', actual.repliedCount, expected.repliedCount],
      ['replyPercentage', actual.replyPercentage, expected.replyPercentage],
    ];

    for (const [key, got, want] of checks) {
      if (got !== want) {
        failures.push(
          `${expected.locationName} (${expected.locationId}) → ${key}: ` +
            `esperado ${String(want)}, obtenido ${String(got)}`,
        );
      }
    }
  }

  // RN-05: el promedio de Belgrano tiene que ser null, no 0.
  const belgrano = calculateLocationSummary('loc-2', reviews);
  if (belgrano.averageRating === 0) {
    failures.push('Belgrano devuelve 0 en vez de null. RN-05 violado: 0.0 es un dato falso.');
  }

  // Coherencia del código con la definición de "respondida".
  const conTextoVacio = reviews.filter(
    (r) => typeof r.reply_text === 'string' && r.reply_text.trim() === '',
  );
  if (conTextoVacio.some(isResponded)) {
    failures.push('Hay reseñas con respuesta vacía que se cuentan como respondidas.');
  }

  // Resumen legible antes del veredicto.
  console.log('\n  Sede      Total  Calif.  Promedio   Respondidas');
  console.log('  ' + '-'.repeat(52));
  for (const expected of REFERENCE) {
    const s = calculateLocationSummary(expected.locationId, reviews);
    const promedio = s.averageRating === null ? 'Sin datos' : s.averageRating.toFixed(2);
    console.log(
      `  ${expected.locationName.padEnd(9)} ${String(s.totalReviews).padStart(4)} ` +
        `${String(s.ratedReviews).padStart(7)}  ${promedio.padStart(9)}   ` +
        `${s.repliedCount}/${s.totalReviews} (${s.replyPercentage}%)`,
    );
  }
  console.log(
    `\n  Deduplicadas: ${duplicates} · Descartadas: ${skipped.length} (${skipped.join(', ') || '—'})`,
  );

  if (failures.length > 0) {
    console.error('\n  GATE FALLIDO\n');
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    console.error('');
    process.exit(1);
  }

  console.log('\n  GATE OK — las métricas coinciden con la tabla de referencia.\n');
}

main();
