import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';

import innerTubeRouter from './routes.js';

const app = new Hono();

app.use('*', cors());

app.get('/', (c) =>
  c.json({
    name: 'youtubei-proxy',
    message: 'Forward requests to /youtubei/v1/{endpoint}'
  })
);

app.route('/', innerTubeRouter);

const PORT = Number(process.env.PORT) || 3009;

serve(
  {
    fetch: app.fetch,
    port: PORT
  },
  (info) => {
    const address = info?.address || 'localhost';
    const displayPort = info?.port || PORT;
    console.log(
      'YouTube InnerTube raw proxy listening on http://' + address + ':' + displayPort
    );
  }
);
