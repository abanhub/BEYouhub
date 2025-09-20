import 'dotenv/config';
import express from "express";
import cors from "cors";

import innerTubeRouter from "./routes.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "youtubei-proxy",
    message: "Forward requests to /youtubei/v1/{endpoint}"
  });
});

app.use(innerTubeRouter);

const PORT = process.env.PORT || 3009;

app.listen(PORT, () => {
  console.log(`YouTube InnerTube raw proxy listening on http://localhost:${PORT}`);
});