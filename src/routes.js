import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { proxyInnerTube } from './innerTube.js';
import { transformResponse } from './transformers.js';

const router = new Hono();

function normalizeQueries(entries) {
  const result = {};
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      result[key] = value.length > 1 ? value : value[0];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function getFirst(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

async function buildPayload(c, query) {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD') {
    return { ...query };
  }

  const contentType = c.req.header('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const body = await c.req.json();
      if (body && typeof body === 'object') {
        return body;
      }
      return {};
    } catch (error) {
      throw new HTTPException(400, { message: 'Invalid JSON payload' });
    }
  }

  const rawBody = await c.req.text();
  if (rawBody && rawBody.trim()) {
    try {
      return JSON.parse(rawBody);
    } catch (error) {
      throw new HTTPException(400, { message: 'Invalid JSON payload' });
    }
  }

  return {};
}

router.all('/youtubei/v1/:endpoint{.*}', async (c) => {
  try {
    const endpoint = c.req.param('endpoint');
    if (!endpoint) {
      throw new HTTPException(400, { message: 'Endpoint path is required' });
    }

    const queries = c.req.queries();
    const normalizedQuery = normalizeQueries(queries);
    const payload = await buildPayload(c, normalizedQuery);

    const locale = {
      hl: getFirst(queries.hl) || payload?.context?.client?.hl,
      gl: getFirst(queries.gl) || payload?.context?.client?.gl
    };

    const videoId = getFirst(queries.videoId) || payload.videoId;
    const useMusic = endpoint.startsWith('music/');
    const raw = ['true', '1'].includes((getFirst(queries.raw) || '').toLowerCase());

    const response = await proxyInnerTube({
      endpoint,
      payload,
      locale,
      videoId,
      useMusic
    });

    if (typeof response === 'string') {
      return c.text(response);
    }

    if (raw) {
      return c.json(response);
    }

    const transformed = transformResponse(endpoint, response, payload);
    return c.json(transformed ?? response);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    const status = error.status || 500;
    if (error.data) {
      if (typeof error.data === 'string') {
        return c.text(error.data, status);
      }
      return c.json(error.data, status);
    }

    const message = error instanceof Error ? error.message : 'Unexpected error';
    return c.json({ error: message }, status);
  }
});

export default router;
