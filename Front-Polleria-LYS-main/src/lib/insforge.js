import { createClient } from '@insforge/sdk';

// URL pública del backend de este proyecto; puede reemplazarse mediante .env.
const DEFAULT_INSFORGE_URL = 'https://aep52x8n.us-east.insforge.app';
let client;

export function getInsforge() {
  if (client) return client;
  const baseUrl = import.meta.env.VITE_INSFORGE_URL?.trim() || DEFAULT_INSFORGE_URL;
  const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY?.trim();
  if (anonKey?.startsWith('ik_')) {
    throw new Error('Usa la clave pública anon; la API_KEY administrativa no pertenece al frontend.');
  }
  client = createClient({ baseUrl, anonKey: anonKey || undefined, auth: { detectOAuthCallback: false } });
  return client;
}
