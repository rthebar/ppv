const PPV_API_URL = 'https://api.ppv.to';
const CACHE_TTL = 60_000;
let cache = null;
let cacheTime = 0;

export default function ppvProxyPlugin() {
  return {
    name: 'ppv-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ppv', async (req, res) => {
        try {
          const now = Date.now();
          if (cache && now - cacheTime < CACHE_TTL) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(cache);
            return;
          }

          const url = new URL(`/api${req.url}`, PPV_API_URL);
          const response = await fetch(url.toString(), {
            signal: AbortSignal.timeout(10000),
          });
          const data = await response.text();

          cache = data;
          cacheTime = now;

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(data);
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}
