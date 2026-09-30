/**
 * Frontend Environment Configuration
 * 
 * Configures API and WebSocket endpoints dynamically for:
 * - Local development (defaults to relative /api and /ws using Vite dev proxy)
 * - Production deployments (e.g., Vercel frontend + Render backend)
 */

/**
 * Resolves the HTTP API base URL.
 * - If VITE_API_URL is set (e.g., "https://collaborative-codespace-backend.onrender.com"):
 *   ensures the URL points to the API route (appends "/api" if not present).
 * - Otherwise defaults to "/api" for local dev proxying.
 */
export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_URL || '').trim();
  if (!envUrl) {
    return '/api';
  }
  const clean = envUrl.replace(/\/+$/, '');
  return clean.endsWith('/api') ? clean : `${clean}/api`;
}

/**
 * Resolves the WebSocket URL for real-time collaboration.
 * - If VITE_WS_URL is set (e.g., "wss://collaborative-codespace-backend.onrender.com"):
 *   connects directly to the specified WebSocket host.
 * - If VITE_API_URL is set (e.g., "https://collaborative-codespace-backend.onrender.com"):
 *   automatically converts http(s) -> ws(s) and connects to /ws/<roomCode>?token=<token>.
 * - Otherwise falls back to window.location (for local development with Vite dev server proxy).
 */
export function getWebSocketUrl(roomCode: string, token: string): string {
  const encodedRoom = encodeURIComponent(roomCode.toUpperCase().trim());
  const encodedToken = encodeURIComponent(token);
  const path = `/ws/${encodedRoom}?token=${encodedToken}`;

  const explicitWs = (import.meta.env.VITE_WS_URL || '').trim();
  if (explicitWs) {
    const cleanWs = explicitWs.replace(/\/+$/, '').replace(/\/ws\/?$/, '');
    return `${cleanWs}${path}`;
  }

  const apiUrl = (import.meta.env.VITE_API_URL || '').trim();
  if (apiUrl) {
    let base = apiUrl.replace(/\/+$/, '');
    if (base.endsWith('/api')) {
      base = base.slice(0, -4);
    }
    const wsBase = base
      .replace(/^http:\/\//i, 'ws://')
      .replace(/^https:\/\//i, 'wss://');
    return `${wsBase}${path}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}${path}`;
}

export const API_BASE = getApiBaseUrl();
