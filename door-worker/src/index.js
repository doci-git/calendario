'use strict';

const SHELLY_URL = 'https://shelly-73-eu.shelly.cloud/v2/devices/api/set/switch';
const DEVICE_ID = '3494547ab161';
const LOCAL_DEV_ORIGINS = new Set([
  'http://127.0.0.1:5500',
  'http://localhost:5500'
]);

function reply(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (origin !== env.ALLOWED_ORIGIN && !LOCAL_DEV_ORIGINS.has(origin)) {
      return Response.json({ error: 'Origine non autorizzata.' }, { status: 403 });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin'
        }
      });
    }
    if (request.method !== 'POST') {
      return reply({ error: 'Metodo non supportato.' }, 405, origin);
    }
    if (!env.SHELLY_AUTH_KEY) {
      return reply({ error: 'Configura il secret SHELLY_AUTH_KEY.' }, 503, origin);
    }

    try {
      const shellyResponse = await fetch(
        `${SHELLY_URL}?auth_key=${encodeURIComponent(env.SHELLY_AUTH_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: DEVICE_ID,
            channel: 0,
            on: true,
            toggle_after: 1
          }),
          signal: AbortSignal.timeout(10000)
        }
      );
      if (!shellyResponse.ok) {
        console.error('Shelly command rejected', { status: shellyResponse.status });
        return reply({ error: 'Shelly non ha accettato il comando.' }, 502, origin);
      }
      return reply({ ok: true }, 200, origin);
    } catch (error) {
      console.error('Shelly request failed', { name: error.name });
      return reply({ error: 'Servizio Shelly non raggiungibile.' }, 502, origin);
    }
  }
};
