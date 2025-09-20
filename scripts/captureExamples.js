import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { proxyInnerTube } from "../src/innerTube.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, "../api_response");

const context = {
  tokens: {}
};

function findCommentContinuation(data) {
  const stack = [data];

  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;

    const maybeSection = node.itemSectionRenderer;
    if (maybeSection?.sectionIdentifier === "comment-item-section") {
      const contents = maybeSection.contents || [];
      for (const item of contents) {
        const continuation = item?.continuationItemRenderer?.continuationEndpoint;
        if (!continuation) continue;

        const commandToken = continuation.continuationCommand?.token;
        if (commandToken) {
          return commandToken;
        }

        const reloadToken = continuation.reloadContinuationData?.continuation;
        if (reloadToken) {
          return reloadToken;
        }

        const nextToken = continuation.nextContinuationData?.continuation;
        if (nextToken) {
          return nextToken;
        }
      }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const item of value) stack.push(item);
      } else if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return null;
}

const scenarios = [
  {
    name: "search",
    endpoint: "search",
    description: "Global search results for a keyword",
    payload: {
      query: "lofi girl",
      params: "EgIQAQ%3D%3D"
    }
  },
  {
    name: "player",
    endpoint: "player",
    description: "Video metadata and playback information",
    payload: {
      videoId: "dQw4w9WgXcQ",
      playbackContext: {
        contentPlaybackContext: {
          html5Preference: "HTML5_PREF_WANTS"
        }
      },
      racyCheckOk: true,
      contentCheckOk: true
    }
  },
  {
    name: "next",
    endpoint: "next",
    description: "Watch-next rail with related videos, comments, and engagement metadata",
    payload: {
      videoId: "dQw4w9WgXcQ"
    },
    onResult: ({ data }) => {
      const token = findCommentContinuation(data);
      if (token) {
        context.tokens.firstCommentContinuation = token;
      }
    }
  },
  {
    name: "comments_page1",
    endpoint: "next",
    description: "Top-level comments fetched via continuation token",
    buildPayload: () => {
      const token = context.tokens.firstCommentContinuation;
      if (!token) {
        return null;
      }
      return { continuation: token };
    },
    skipIfMissing: "No comment continuation token discovered in previous step"
  },
  {
    name: "comments_continuation",
    endpoint: "next",
    description: "Placeholder: additional comments require continuations collected at runtime",
    skip: true
  },
  {
    name: "search_suggestions",
    endpoint: "search",
    description: "Search suggestions served by a different public API",
    skip: true
  },
  {
    name: "guide",
    endpoint: "guide",
    description: "Sidebar guide (subscriptions, library)",
    payload: {}
  },
  {
    name: "home",
    endpoint: "browse",
    description: "Home feed using browseId FEwhat_to_watch",
    payload: {
      browseId: "FEwhat_to_watch"
    }
  },
  {
    name: "trending",
    endpoint: "browse",
    description: "Trending feed using browseId FEtrending",
    payload: {
      browseId: "FEtrending"
    }
  },
  {
    name: "browse_channel",
    endpoint: "browse",
    description: "Channel page tabs (Google Developers)",
    payload: {
      browseId: "UC_x5XG1OV2P6uZZ5FSM9Ttw"
    }
  },
  {
    name: "playlist",
    endpoint: "browse",
    description: "Playlist metadata and videos",
    payload: {
      browseId: "VLPLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI"
    }
  }
];

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function writeScenarioResult(scenario, data, payload) {
  const filePath = path.join(OUTPUT_DIR, `${scenario.name}.json`);
  const sanitizedPayload = payload && typeof payload === "object" ? { ...payload } : payload;

  if (sanitizedPayload && typeof sanitizedPayload === "object" && sanitizedPayload.continuation === "") {
    delete sanitizedPayload.continuation;
  }

  const snapshot = {
    meta: {
      endpoint: scenario.endpoint,
      description: scenario.description,
      fetchedAt: new Date().toISOString(),
      locale: scenario.locale || null,
      useMusic: Boolean(scenario.useMusic)
    },
    requestPayload: sanitizedPayload || null,
    data
  };

  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf8");
  return filePath;
}

function shouldSkipScenario(scenario) {
  if (!scenario.skip) {
    return null;
  }
  return scenario.note || "marked as skip";
}

async function runScenario(scenario) {
  const skipReason = shouldSkipScenario(scenario);
  if (skipReason) {
    console.log(`- Skipping ${scenario.name}: ${skipReason}`);
    return;
  }

  let payload = scenario.payload;
  if (typeof scenario.buildPayload === "function") {
    payload = scenario.buildPayload(context);
  }

  if (!payload || (typeof payload === "object" && !Object.keys(payload).length && scenario.skipIfMissing)) {
    console.log(`- Skipping ${scenario.name}: ${scenario.skipIfMissing}`);
    return;
  }

  try {
    const data = await proxyInnerTube({
      endpoint: scenario.endpoint,
      payload,
      locale: scenario.locale,
      videoId: payload?.videoId,
      useMusic: scenario.useMusic
    });

    const filePath = await writeScenarioResult(scenario, data, payload);
    console.log(`[OK] ${scenario.name} -> ${path.relative(process.cwd(), filePath)}`);

    if (typeof scenario.onResult === "function") {
      scenario.onResult({ data, payload, filePath });
    }
  } catch (error) {
    console.error(`[FAIL] ${scenario.name}: ${error.message}`);
    throw error;
  }
}

async function run() {
  await ensureOutputDir();

  const failures = [];
  for (const scenario of scenarios) {
    try {
      await runScenario(scenario);
    } catch (error) {
      failures.push({ scenario, error: error.data || error.message || error });
    }
  }

  if (failures.length) {
    console.error(`\n${failures.length} scenario(s) failed.`);
    failures.forEach(({ scenario, error }) => {
      console.error(`- ${scenario.name}:`, typeof error === "string" ? error.slice(0, 200) : error);
    });
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("Unexpected failure", error);
  process.exit(1);
});
