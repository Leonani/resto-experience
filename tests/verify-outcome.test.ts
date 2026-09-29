import { describe, expect, it } from 'vitest';

import { classifyVerifyResponse, VERIFY_NETWORK_ERROR } from '@/lib/verify-outcome';

const ok = (data: unknown) => ({ success: 'ok', data, message: 'Sesión válida.' });

describe('clasificación de /api/auth/verify', () => {
  describe('sesión válida', () => {
    it('reconoce la sesión y pasa el usuario', () => {
      const out = classifyVerifyResponse({
        ok: true,
        status: 200,
        body: ok({ user: 'owner', expiresAt: '2026-01-01T00:00:00.000Z' }),
      });

      expect(out).toEqual({
        kind: 'autenticado',
        user: 'owner',
        expiresAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('tolera que expiresAt venga ausente o con forma rara', () => {
      const sinExpiracion = classifyVerifyResponse({
        ok: true,
        status: 200,
        body: ok({ user: 'owner' }),
      });

      expect(sinExpiracion).toEqual({ kind: 'autenticado', user: 'owner', expiresAt: null });

      const conNumero = classifyVerifyResponse({
        ok: true,
        status: 200,
        body: ok({ user: 'owner', expiresAt: 12345 }),
      });

      expect(conNumero).toEqual({ kind: 'autenticado', user: 'owner', expiresAt: null });
    });
  });

  describe('sin sesión: es normal, no es error', () => {
    it('trata el 401 como anónimo', () => {
      const out = classifyVerifyResponse({
        ok: false,
        status: 401,
        body: { success: 'error', data: null, message: 'Sesión no válida o vencida.' },
      });

      expect(out).toEqual({ kind: 'anonimo' });
    });

    it('trata el 401 como anónimo aunque el body no se pueda leer', () => {
      const out = classifyVerifyResponse({ ok: false, status: 401, body: null });

      expect(out).toEqual({ kind: 'anonimo' });
    });

    it('no confunde un 404 con "no hay sesión"', () => {
      const out = classifyVerifyResponse({ ok: false, status: 404, body: null });

      expect(out.kind).toBe('error');
    });
  });

  describe('el servidor no pudo responder: NO es "anónimo"', () => {
    it('detecta la mala configuración del servidor (500 sin cuerpo JSON)', () => {
      // Es lo que pasa si falta SUPABASE_SERVICE_ROLE_KEY: createClientAdmin()
      // tira antes de poder responder y Next devuelve HTML, no el contrato.
      const out = classifyVerifyResponse({ ok: false, status: 500, body: null });

      expect(out.kind).toBe('error');
      expect(out.kind === 'error' && out.message).toBe(
        'El servidor respondió 500 sin un cuerpo válido.',
      );
    });

    it('reporta un 500 aunque venga con un cuerpo no-JSON', () => {
      const out = classifyVerifyResponse({ ok: false, status: 500, body: '<html>Error</html>' });

      expect(out.kind).toBe('error');
    });

    it('usa el message del contrato cuando el servidor sí lo manda', () => {
      const out = classifyVerifyResponse({
        ok: false,
        status: 500,
        body: { success: 'error', data: null, message: 'No se pudo verificar el usuario.' },
      });

      expect(out.kind === 'error' && out.message).toBe('No se pudo verificar el usuario.');
    });

    it('cae en error con un 403 (no es falta de sesión)', () => {
      const out = classifyVerifyResponse({
        ok: false,
        status: 403,
        body: { success: 'error', data: null, message: 'Origen de la solicitud no permitido.' },
      });

      expect(out.kind === 'error' && out.message).toBe('Origen de la solicitud no permitido.');
    });

    it('el string de red es explícito y no parece un fallo de sesión', () => {
      expect(VERIFY_NETWORK_ERROR).toContain('No se pudo conectar');
    });
  });

  describe('respuesta 200 con forma inesperada', () => {
    it('no se autentica si success no es "ok"', () => {
      const out = classifyVerifyResponse({
        ok: true,
        status: 200,
        body: { success: 'error', data: { user: 'owner' }, message: 'algo' },
      });

      expect(out.kind).toBe('error');
    });

    it('no se autentica si falta data', () => {
      const out = classifyVerifyResponse({
        ok: true,
        status: 200,
        body: { success: 'ok', data: null, message: 'Sesión válida.' },
      });

      expect(out.kind).toBe('error');
    });

    it('no se autentica si user no es un string', () => {
      const out = classifyVerifyResponse({
        ok: true,
        status: 200,
        body: ok({ user: 42 }),
      });

      expect(out.kind).toBe('error');
    });

    it('no se autentica si user viene vacío', () => {
      const out = classifyVerifyResponse({ ok: true, status: 200, body: ok({ user: '' }) });

      expect(out.kind).toBe('error');
    });

    it('no se autentica con un body que no es objeto', () => {
      for (const body of [null, 'sesión', 42, []]) {
        expect(classifyVerifyResponse({ ok: true, status: 200, body }).kind).toBe('error');
      }
    });
  });
});
