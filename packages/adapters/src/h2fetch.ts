import http2 from 'node:http2';
import zlib from 'node:zlib';

/**
 * Minimal fetch over HTTP/2 (node:http2). Some marketplaces' CDNs (OLX on CloudFront since Oct 2026)
 * answer every HTTP/1.1 request with "403 Request blocked"; Node's built-in fetch only speaks HTTP/1.1.
 * Falls back to the global fetch for http:// URLs and for servers that do not offer h2.
 */
const IDLE_MS = 30_000;

export interface H2FetchOptions {
  /** Extra trusted CA certificates (tests use a self-signed server). */
  ca?: string | Buffer;
}

/** Builds a fetch-compatible function that talks HTTP/2 to https origins. */
export function createH2Fetch(options: H2FetchOptions = {}): typeof fetch {
  const sessions = new Map<
    string,
    { session: http2.ClientHttp2Session; timer: NodeJS.Timeout | null }
  >();

  function getSession(origin: string): Promise<http2.ClientHttp2Session> {
    const cached = sessions.get(origin);
    if (cached && !cached.session.closed && !cached.session.destroyed) {
      if (cached.timer) clearTimeout(cached.timer);
      cached.timer = null;
      return Promise.resolve(cached.session);
    }
    return new Promise((resolve, reject) => {
      const session = http2.connect(origin, {
        ALPNProtocols: ['h2'],
        ...(options.ca ? { ca: options.ca } : {}),
      });
      const fail = (error: Error) => {
        sessions.delete(origin);
        reject(error);
      };
      session.once('error', fail);
      session.once('connect', () => {
        session.off('error', fail);
        session.on('error', () => sessions.delete(origin));
        session.on('close', () => sessions.delete(origin));
        sessions.set(origin, { session, timer: null });
        resolve(session);
      });
    });
  }

  function release(origin: string) {
    const cached = sessions.get(origin);
    if (!cached) return;
    if (cached.timer) clearTimeout(cached.timer);
    cached.timer = setTimeout(() => {
      cached.session.close();
      sessions.delete(origin);
    }, IDLE_MS);
    cached.timer.unref();
  }

  function decode(body: Buffer, encoding: string | undefined): Buffer {
    if (encoding === 'gzip') return zlib.gunzipSync(body);
    if (encoding === 'br') return zlib.brotliDecompressSync(body);
    if (encoding === 'deflate') return zlib.inflateSync(body);
    return body;
  }

  function headerRecord(init?: RequestInit): Record<string, string> {
    const out: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      if (!['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade'].includes(key))
        out[key] = value;
    });
    return out;
  }

  async function once(url: URL, init?: RequestInit): Promise<Response> {
    const session = await getSession(url.origin);
    try {
      return await new Promise<Response>((resolve, reject) => {
        const stream = session.request({
          ':method': init?.method ?? 'GET',
          ':path': `${url.pathname}${url.search}`,
          'accept-encoding': 'gzip, deflate, br',
          ...headerRecord(init),
        });
        const signal = init?.signal;
        const onAbort = () => {
          stream.close(http2.constants.NGHTTP2_CANCEL);
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        };
        if (signal?.aborted) return onAbort();
        signal?.addEventListener('abort', onAbort, { once: true });
        const chunks: Buffer[] = [];
        let head: http2.IncomingHttpHeaders = {};
        stream.on('response', (headers) => {
          head = headers;
        });
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('error', (error) => {
          signal?.removeEventListener('abort', onAbort);
          reject(error);
        });
        stream.on('end', () => {
          signal?.removeEventListener('abort', onAbort);
          try {
            const status = Number(head[':status'] ?? 0);
            const headers = new Headers();
            for (const [key, value] of Object.entries(head)) {
              if (
                key.startsWith(':') ||
                value == null ||
                key === 'content-encoding' ||
                key === 'content-length'
              )
                continue;
              headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
            }
            const body = decode(
              Buffer.concat(chunks),
              head['content-encoding'] as string | undefined,
            );
            const nullBody = status === 204 || status === 304 || (status >= 100 && status < 200);
            const response = new Response(nullBody ? null : body, { status, headers });
            Object.defineProperty(response, 'url', { value: url.toString() });
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
        if (init?.body != null) stream.end(init.body as string);
        else stream.end();
      });
    } finally {
      release(url.origin);
    }
  }

  return async (input, init) => {
    let url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== 'https:') return fetch(input, init);
    const manual = init?.redirect === 'manual';
    for (let hop = 0; ; hop += 1) {
      let response: Response;
      try {
        response = await once(url, init);
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') throw error;
        // No h2 on this server (ALPN refused) or a protocol error: use the normal HTTP/1.1 fetch.
        return fetch(url, init);
      }
      const location = response.headers.get('location');
      if (manual || response.status < 300 || response.status >= 400 || !location) return response;
      if (hop >= 5) return response;
      url = new URL(location, url);
    }
  };
}

export const h2fetch: typeof fetch = createH2Fetch();
