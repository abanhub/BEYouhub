import {
  USER_AGENT,
  resolveInnerTubeConfig,
  buildDefaultContext,
  DEFAULT_LOCALE,
  DEFAULT_VIDEO_ID
} from "./config.js";

const ORIGINS = {
  youtube: "https://www.youtube.com",
  music: "https://music.youtube.com"
};

const DEFAULT_CLIENT_NAME = "WEB";

function getFirst(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const normalized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    normalized[key] = value;
  }
  return normalized;
}

function resolveRequestLocale(payload, explicitLocale = {}) {
  const { context } = payload ?? {};
  const client = context?.client ?? {};

  const explicitHl = getFirst(explicitLocale.hl);
  const explicitGl = getFirst(explicitLocale.gl);
  const clientHl = getFirst(client.hl);
  const clientGl = getFirst(client.gl);

  return {
    hl: explicitHl || clientHl || DEFAULT_LOCALE.hl,
    gl: explicitGl || clientGl || DEFAULT_LOCALE.gl
  };
}

function resolveVideoId(payload, fallback) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  return (
    getFirst(payload.videoId) ||
    getFirst(payload.playlistId) ||
    getFirst(payload.channelId) ||
    getFirst(payload.browseId) ||
    fallback
  );
}

function buildHeaders(clientVersion, origin, hl) {
  const acceptLanguage = hl ? `${hl},en;q=0.9` : "en-US,en;q=0.9";
  return {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
    "Accept-Language": acceptLanguage,
    "Content-Type": "application/json",
    "X-Youtube-Client-Name": "1",
    "X-Youtube-Client-Version": clientVersion,
    "Origin": origin,
    "Referer": `${origin}/`,
    "Cookie": "CONSENT=YES+cb;"
  };
}

function applyContext(payload, config) {
  const baseContext = buildDefaultContext(config).context;
  const overrideContext = payload.context || {};

  const mergedClient = {
    ...baseContext.client,
    ...(overrideContext.client || {})
  };

  if (!mergedClient.clientName) {
    mergedClient.clientName = DEFAULT_CLIENT_NAME;
  }
  if (!mergedClient.clientVersion) {
    mergedClient.clientVersion = config.clientVersion;
  }
  if (!mergedClient.hl) {
    mergedClient.hl = config.hl;
  }
  if (!mergedClient.gl) {
    mergedClient.gl = config.gl;
  }

  return {
    ...baseContext,
    ...overrideContext,
    client: mergedClient
  };
}

export async function proxyInnerTube({
  endpoint,
  payload = {},
  locale = {},
  videoId,
  useMusic = false
}) {
  if (!endpoint) {
    throw new Error("proxyInnerTube: endpoint is required");
  }

  const normalizedPayload = normalizePayload(payload);
  const requestLocale = resolveRequestLocale(normalizedPayload, locale);
  const targetVideoId = videoId || resolveVideoId(normalizedPayload, DEFAULT_VIDEO_ID);

  const config = await resolveInnerTubeConfig({
    videoId: targetVideoId,
    hl: requestLocale.hl,
    gl: requestLocale.gl
  });

  const finalContext = applyContext(normalizedPayload, config);
  const { context: _unused, ...rest } = normalizedPayload;
  const body = {
    ...rest,
    context: finalContext
  };

  const origin = useMusic ? ORIGINS.music : ORIGINS.youtube;
  const url = `${origin}/youtubei/v1/${endpoint}?key=${config.apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(
      finalContext.client.clientVersion || config.clientVersion,
      origin,
      finalContext.client.hl
    ),
    body: JSON.stringify(body)
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const error = new Error(`InnerTube request failed: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
