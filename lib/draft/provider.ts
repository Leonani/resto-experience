import 'server-only';

/**
 * Capa de borrador IA.
 *
 * La interfaz existe para que el proveedor sea intercambiable y para que la
 * app sea plenamente operativa sin él. Con `LLM_API_KEY` ausente, el
 * `TemplateDraftProvider` genera un borrador real, coherente con el tono según
 * el puntaje, y guardable. La IA es una mejora, no un requisito.
 */

export type DraftTone = 'positive' | 'neutral' | 'negative';

export type DraftInput = {
  reviewId: string;
  restaurantName: string;
  locationName: string;
  rating: number | null;
  /** Texto de la reseña. Vacío es un caso válido (RN-04). */
  text: string;
};

export type DraftOutput = {
  text: string;
  provider: string;
  fromFallback: boolean;
};

export interface DraftProvider {
  generate(input: DraftInput): Promise<DraftOutput>;
}

/**
 * El tono depende del puntaje, no del texto. Un 1 con un comentario educado
 * sigue siendo una queja, y un 5 con un comentario molesto sigue siendo una
 * buena experiencia. Interpretar el texto es trabajo del modelo; el fallback
 * solo necesita no equivocarse de tono.
 *
 * `rating: null` (RN-03) no es "0 estrellas": es "el cliente no interfirió".
 * Tratarlo como neutro o como mala experiencia sería afirmar algo que el dato no
 * dice. Se agradece la visita.
 */
export function toneFor(rating: number | null): DraftTone {
  if (rating === null) return 'positive';
  if (rating >= 4) return 'positive';
  if (rating === 3) return 'neutral';
  return 'negative';
}

/**
 * Proveedor local determinístico. Sin red, sin API key, sin coste.
 *
 * Es texto real y guardable, no un placeholder de "próximamente". Si el
 * fallback fuera un texto vacío, la app dependería del proveedor para funcionar.
 */
export class TemplateDraftProvider implements DraftProvider {
  async generate(input: DraftInput): Promise<DraftOutput> {
    const tone = toneFor(input.rating);
    const name = input.restaurantName;

    // RN-04: si no hay texto, no se puede hacer referencia al contenido.
    // Se agradece la puntuación sin inventar sobre qué fue el praise.
    const hasText = input.text.trim().length > 0;

    let text: string;

    if (tone === 'positive') {
      text = hasText
        ? `¡Muchas gracias, ${name}! Nos alegra mucho saber que la experiencia fue de lo mejor. ` +
          `Leer esto nos incentiva a seguir mejorando cada día. Te esperamos para que nos vuelvas a visitar.`
        : `¡Gracias por tu tiempo, ${name}! Tu valoración es el mejor regalo para nuestro equipo. ` +
          `Nos alegra que la experiencia haya sido positiva. ¡Esperamos verte de nuevo!`;
    } else if (tone === 'neutral') {
      text = hasText
        ? `Hola, gracias por escribirnos. Tu opinión es útil y la estamos teniendo en cuenta. ` +
          `Queremos seguir mejorando y tu comentario nos ayuda a saber en qué enfocarnos. ` +
          `Si querés contarnos más en detalle, escribinos y lo vamos a revisar.`
        : `Hola, gracias por tu valoración. Seguimos trabajando para mejorar, y tu opinión ` +
          `nos sirve para saber en qué enfocarnos. ¡Gracias!`;
    } else {
      text = hasText
        ? `Lamentamos mucho tu experiencia en ${name}, y lamentamos que no haya estado a la altura. ` +
          `Tomamos en serio cada detalle que nos mencionás, y es algo que estamos revisando para ` +
          `corregirlo. Si querés, escribinos por acá con el detalle y lo vamos a tratar de forma ` +
          `directa. Gracias por avisarnos.`
        : `Lamentamos que la experiencia en ${name} no haya estado a la altura. ` +
          `Tu valoración nos sirve para mejorar. Si querés contarnos qué pasó, escribinos y lo ` +
          `revisamos. Gracias por avisarnos.`;
    }

    return { text, provider: 'template', fromFallback: true };
  }
}

/* -------------------------------------------------------------------------- */
/* Proveedor real: API compatible con OpenAI (OpenRouter por defecto)          */
/* -------------------------------------------------------------------------- */

/**
 * Error de un proveedor externo. Se distingue de un bug propio para poder
 * caer al template sin tragarse el stack trace, pero sin fingir que la IA
 * funcionó: el mensaje viaja hasta la interfaz.
 */
export class DraftProviderError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'DraftProviderError';
  }
}

export type LlmConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Identificador de la app en el proveedor, para que aparezca en el dashboard. */
  appTitle: string;
  appUrl: string;
};

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'anthropic/claude-3.5-haiku';
const TIMEOUT_MS = 15_000;

/**
 * Lee la configuración del entorno. Devuelve `null` si no hay key, que es la
 * señal de "operá con el template" en vez de un error.
 *
 * Se pasa `env` por parámetro para que sea testeable sin mutar `process.env`.
 */
export function readLlmConfig(
  env: Record<string, string | undefined> = process.env,
): LlmConfig | null {
  const apiKey = env.LLM_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    apiKey,
    model: env.LLM_MODEL?.trim() || DEFAULT_MODEL,
    baseUrl: (env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    appTitle: env.LLM_APP_TITLE?.trim() || 'Resto Experience',
    appUrl: env.LLM_APP_URL?.trim() || 'http://localhost:3000',
  };
}

const SYSTEM_PROMPT = [
  'Sos un redactor profesional que responde reseñas públicas de un restaurante.',
  '',
  'Reglas que no se negocian:',
  '- Escribí en español rioplatense, con voseo ("querés", "gracias", "avisanos").',
  '- Entre 2 y 4 oraciones. Es una respuesta pública, no un correo.',
  '- Texto plano: nada de markdown, negritas, viñetas, emojis ni encabezados.',
  '- NO prometas nada que el restaurante no haya confirmado: ni descuentos, ni',
  '  reintegros, ni compensaciones, ni plazos. Este texto se publica sin revisión.',
  '- NO inventes datos del pedido: si la reseña menciona algo que no está en los',
  '  datos que te pasé, no lo repitas como hecho.',
  '- NO digas que sos una IA ni menciones que el texto fue generado.',
  '- Tono según la calificación: cálido y agradecido si es alta, neutro y',
  '  abierto en el medio, empático y sin defender a la empresa si es baja.',
  '- Si la reseña no tiene comentario, agradecé la calificación sin inventar qué',
  '  fue lo que gustó.',
].join('\n');

function buildUserPrompt(input: DraftInput): string {
  const lines = [
    `Restaurante: ${input.restaurantName}`,
    `Sede: ${input.locationName}`,
    `Calificación: ${input.rating === null ? 'Sin calificación (el cliente no dejó estrellas)' : `${input.rating} de 5 estrellas`}`,
  ];

  if (input.text.trim().length > 0) {
    lines.push('', 'Comentario del cliente:', input.text.trim());
  } else {
    lines.push('', 'El cliente no dejó comentario, solo dejó la calificación.');
  }

  lines.push('', 'Escribí la respuesta pública.');
  return lines.join('\n');
}

/** Quita markdown que el modelo pueda colar igual. Va a texto público. */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

type ChatCompletionResponse = {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string; code?: number };
};

export class OpenAiCompatibleDraftProvider implements DraftProvider {
  constructor(private readonly config: LlmConfig) {}

  async generate(input: DraftInput): Promise<DraftOutput> {
    const { apiKey, model, baseUrl, appTitle, appUrl } = this.config;

    let response: Response;

    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-Title': appTitle,
          'X-URL': appUrl,
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_tokens: 400,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(input) },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      // AbortError por timeout, DNS caído, sin red. Todos son "no se pudo".
      const isTimeout = cause instanceof Error && cause.name === 'TimeoutError';
      throw new DraftProviderError(
        isTimeout ? 'El proveedor tardó demasiado en responder.' : 'No se pudo contactar al proveedor.',
        cause instanceof Error ? cause.message : String(cause),
      );
    }

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      throw new DraftProviderError(
        `El proveedor respondió ${response.status}.`,
        raw.slice(0, 300),
      );
    }

    const body = (await response.json().catch(() => null)) as ChatCompletionResponse | null;

    if (body?.error?.message) {
      throw new DraftProviderError('El proveedor rechazó la solicitud.', body.error.message);
    }

    const raw = body?.choices?.[0]?.message?.content ?? '';
    const text = stripMarkdown(raw);

    if (text.length === 0) {
      throw new DraftProviderError('El proveedor devolvió un borrador vacío.');
    }

    return { text, provider: model, fromFallback: false };
  }
}

/**
 * Elige el proveedor según el entorno. Función pura y sin I/O: es la parte
 * que se testea, no la llamada de red.
 */
export function selectProvider(config: LlmConfig | null): DraftProvider {
  return config ? new OpenAiCompatibleDraftProvider(config) : new TemplateDraftProvider();
}
