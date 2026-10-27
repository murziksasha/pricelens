export function serverBase(): string {
  return (localStorage.getItem('pricelens.server') || '').replace(/\/$/, '');
}

export function authToken(): string {
  return localStorage.getItem('pricelens.token') || '';
}

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const token = authToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`${serverBase()}${path}`, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    let code = 'http_error';
    try {
      code = (await response.json()).error || code;
    } catch {
      /* ignore */
    }
    throw new ApiError(code);
  }
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) return response.json() as Promise<T>;
  return response as unknown as T;
}

export async function download(path: string, filename: string) {
  const headers = new Headers();
  const token = authToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`${serverBase()}${path}`, { headers, credentials: 'include' });
  if (!response.ok) throw new ApiError('download_failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
