export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
export const FALLBACK_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
export const FALLBACK_CLIENT_VERSION = "2.20231219.04.00";
export const DEFAULT_VIDEO_ID = "dQw4w9WgXcQ";
export const DEFAULT_LOCALE = { hl: "en", gl: "US" };

const CACHE_TTL = 1000 * 60 * 30; // 30 minutes
const configCache = new Map();

function extractValue(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1] : null;
}

export async function resolveInnerTubeConfig(options = {}) {
  const {
    videoId = DEFAULT_VIDEO_ID,
    hl = DEFAULT_LOCALE.hl,
    gl = DEFAULT_LOCALE.gl
  } = options;

  const cacheKey = `${hl}|${gl}`;
  const cached = configCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.config;
  }

  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=${hl}&gl=${gl}`;
    const response = await fetch(watchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": `${hl},en-US;q=0.8`,
        "Cookie": "CONSENT=YES+cb;"
      }
    });

    const html = await response.text();
    const apiKey = extractValue(html, /"INNERTUBE_API_KEY":"([^"]+)"/);
    const clientVersion = extractValue(html, /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
    const resolvedHl = extractValue(html, /"hl":"([^"]+)"/) || hl;
    const resolvedGl = extractValue(html, /"gl":"([^"]+)"/) || gl;

    if (!apiKey || !clientVersion) {
      throw new Error("InnerTube config not found on watch page");
    }

    const config = {
      apiKey,
      clientVersion,
      hl: resolvedHl,
      gl: resolvedGl
    };

    configCache.set(cacheKey, { config, timestamp: Date.now() });
    return config;
  } catch (error) {
    console.warn("resolveInnerTubeConfig: using fallback", error.message);
    const fallbackConfig = {
      apiKey: FALLBACK_API_KEY,
      clientVersion: FALLBACK_CLIENT_VERSION,
      hl,
      gl
    };

    configCache.set(cacheKey, { config: fallbackConfig, timestamp: Date.now() });
    return fallbackConfig;
  }
}

export function buildDefaultContext(config) {
  const { clientVersion, hl = DEFAULT_LOCALE.hl, gl = DEFAULT_LOCALE.gl } = config;

  return {
    context: {
      client: {
        clientName: "WEB",
        clientVersion,
        hl,
        gl,
        utcOffsetMinutes: -new Date().getTimezoneOffset()
      }
    }
  };
}
