import { Router } from "express";
import { proxyInnerTube } from "./innerTube.js";
import { transformResponse } from "./transformers.js";

const router = Router();

function buildPayload(req) {
  if (req.method === "GET" || req.method === "HEAD") {
    return { ...req.query };
  }

  if (req.is("application/json") && typeof req.body === "object" && req.body !== null) {
    return req.body;
  }

  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      throw new Error("Invalid JSON payload");
    }
  }

  return {};
}

router.all("/youtubei/v1/*", async (req, res) => {
  try {
    const endpoint = req.path.replace(/^\/youtubei\/v1\//, "");
    if (!endpoint) {
      return res.status(400).json({ error: "Endpoint path is required" });
    }

    const payload = buildPayload(req);
    const locale = {
      hl: req.query.hl || payload?.context?.client?.hl,
      gl: req.query.gl || payload?.context?.client?.gl
    };

    const videoId = req.query.videoId || payload.videoId;
    const useMusic = endpoint.startsWith("music/");
    const raw = req.query.raw === "true" || req.query.raw === "1";

    const response = await proxyInnerTube({
      endpoint,
      payload,
      locale,
      videoId,
      useMusic
    });

    if (typeof response === "string") {
      return res.type("text/plain").send(response);
    }

    if (raw) {
      return res.json(response);
    }

    const transformed = transformResponse(endpoint, response, payload);
    res.json(transformed ?? response);
  } catch (error) {
    const status = error.status || 500;
    if (error.data) {
      if (typeof error.data === "string") {
        res.status(status).type("text/plain").send(error.data);
      } else {
        res.status(status).json(error.data);
      }
    } else {
      res.status(status).json({ error: error.message });
    }
  }
});

export default router;


