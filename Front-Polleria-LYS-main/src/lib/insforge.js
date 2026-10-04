import { createClient } from '@insforge/sdk';

let client;

export function getInsforge() {
  if (client) return client;
  const baseUrl = import.meta.env.VITE_INSFORGE_URL?.trim();
  const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY?.trim();
  if (!baseUrl) throw new Error('Configura VITE_INSFORGE_URL en tu archivo .env.');
  if (anonKey?.startsWith('ik_')) {
    throw new Error('Usa la clave pública anon; la API_KEY administrativa no pertenece al frontend.');
  }
  client = createClient({ baseUrl, anonKey: anonKey || undefined, auth: { detectOAuthCallback: false } });
  return client;
}
