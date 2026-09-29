import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DraftProviderError,
  OpenAiCompatibleDraftProvider,
  readLlmConfig,
  selectProvider,
  TemplateDraftProvider,
  type DraftInput,
} from "@/lib/draft/provider";

/**
 * Tests de la capa de borrador IA. La lógica de selección y el fallback son
 * puros a propósito: el template funciona sin red, y la llamada real se prueba
 * con `fetch` stubeado para no depender de OpenRouter en CI.
 */

function input(overrides: Partial<DraftInput> = {}): DraftInput {
  return {
    reviewId: "rv-1",
    restaurantName: "El Rincón",
    locationName: "Palermo",
    rating: 4,
    text: "La comida estuvo excelente.",
    ...overrides,
  };
}

describe("RN-07 — readLlmConfig", () => {
  it("devuelve null sin API key, o con key en blanco", () => {
    expect(readLlmConfig({})).toBeNull();
    expect(readLlmConfig({ LLM_API_KEY: "   " })).toBeNull();
  });

  it("usa defaults cuando solo hay key", () => {
    const config = readLlmConfig({ LLM_API_KEY: "sk-test" });

    expect(config).not.toBeNull();
    expect(config?.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(config?.model).toBe("anthropic/claude-3.5-haiku");
  });

  it("respeta la configuración explícita y limpia la barra final", () => {
    const config = readLlmConfig({
      LLM_API_KEY: "sk-test",
      LLM_MODEL: "modelo-de-prueba",
      LLM_BASE_URL: "https://api.example.com/v1/",
    });

    expect(config?.model).toBe("modelo-de-prueba");
    expect(config?.baseUrl).toBe("https://api.example.com/v1");
  });
});

describe("RN-07 — selectProvider", () => {
  it("cae al template cuando no hay configuración", () => {
    expect(selectProvider(null)).toBeInstanceOf(TemplateDraftProvider);
  });

  it("usa el proveedor real cuando hay configuración", () => {
    const config = readLlmConfig({ LLM_API_KEY: "sk-test" });

    expect(selectProvider(config)).toBeInstanceOf(OpenAiCompatibleDraftProvider);
  });
});

describe("TemplateDraftProvider", () => {
  it("genera texto guardable y siempre marca fallback", async () => {
    const result = await new TemplateDraftProvider().generate(input());

    expect(result.text.trim().length).toBeGreaterThan(0);
    expect(result.fromFallback).toBe(true);
    expect(result.provider).toBe("template");
  });

  it("agradece sin inventar contenido cuando no hay comentario (RN-04)", async () => {
    const result = await new TemplateDraftProvider().generate(
      input({ text: "", rating: 5 }),
    );

    expect(result.text).toContain("Gracias");
  });
});

describe("OpenAiCompatibleDraftProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envía la config correcta y limpia el markdown", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "**¡Gracias!** Te esperamos de nuevo." } }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiCompatibleDraftProvider(
      readLlmConfig({ LLM_API_KEY: "sk-test" })!,
    );
    const result = await provider.generate(input());

    expect(result.fromFallback).toBe(false);
    expect(result.provider).toBe("anthropic/claude-3.5-haiku");
    expect(result.text).toBe("¡Gracias! Te esperamos de nuevo.");
    expect(result.text).not.toContain("**");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test",
    );
  });

  it("lanza DraftProviderError si el proveedor responde con error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream error", { status: 502 })),
    );

    const provider = new OpenAiCompatibleDraftProvider(
      readLlmConfig({ LLM_API_KEY: "sk-test" })!,
    );

    await expect(provider.generate(input())).rejects.toBeInstanceOf(
      DraftProviderError,
    );
  });

  it("lanza DraftProviderError si no hay red", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const provider = new OpenAiCompatibleDraftProvider(
      readLlmConfig({ LLM_API_KEY: "sk-test" })!,
    );

    await expect(provider.generate(input())).rejects.toBeInstanceOf(
      DraftProviderError,
    );
  });

  it("lanza DraftProviderError si el borrador viene vacío", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ choices: [{ message: { content: "   " } }] }),
            { status: 200 },
          ),
      ),
    );

    const provider = new OpenAiCompatibleDraftProvider(
      readLlmConfig({ LLM_API_KEY: "sk-test" })!,
    );

    await expect(provider.generate(input())).rejects.toBeInstanceOf(
      DraftProviderError,
    );
  });
});