const CACHE_TTL = 60_000;
let cache = null;
let cacheTime = 0;

export async function onRequest(context) {
  try {
    const now = Date.now();
    if (cache && now - cacheTime < CACHE_TTL) {
      return new Response(cache, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const url = new URL(context.request.url);
    const ppvPath = url.pathname.replace(/^\/api\/ppv/, '') || '/streams';
    const targetUrl = `https://api.ppv.to/api${ppvPath}`;

    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.text();

    cache = data;
    cacheTime = now;

    return new Response(data, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
