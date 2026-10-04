import { getInsforge } from '../lib/insforge';

const PENDING_PROFILE = 'lys_pending_profile';
let snapshot = { user: null, loading: true, error: '' };
let initialization;
let generation = 0;
const listeners = new Set();

function publish(patch) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach(listener => listener());
}
export const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const getAuthSnapshot = () => snapshot;
export const getCurrentUser = () => snapshot.user;
export const isAuthenticated = () => Boolean(snapshot.user);

function resultOrThrow({ data, error }) {
  if (error) throw new Error(error.message || 'No se pudo conectar con InsForge.');
  return data;
}
const normalizeEmail = email => (email || '').trim().toLowerCase();
const personalFields = data => ({
  nombre: (data.nombre || '').trim(), apellido: (data.apellido || '').trim(),
  telefono: (data.telefono || '').trim(),
});
function pendingProfile() {
  try { return JSON.parse(sessionStorage.getItem(PENDING_PROFILE) || 'null'); }
  catch { return null; }
}

async function loadProfile(authUser) {
  const client = getInsforge();
  const ensured = resultOrThrow(await client.database.rpc('lys_asegurar_perfil'));
  let profile = Array.isArray(ensured) ? ensured[0] : ensured;
  if (!profile?.activo) throw new Error('Tu cuenta está desactivada. Contacta al administrador.');
  const pending = pendingProfile();
  if (pending?.id === authUser.id && pending.email === authUser.email) {
    const rows = resultOrThrow(await client.database.from('perfiles')
      .update(personalFields(pending)).eq('id', authUser.id).select());
    profile = rows[0];
    sessionStorage.removeItem(PENDING_PROFILE);
  }
  return { ...profile, email: authUser.email, creadoEn: profile.creado_en };
}

export function initializeAuth() {
  if (initialization) return initialization;
  initialization = (async () => {
    try {
      const client = getInsforge();
      client.auth.onAuthStateChange(event => {
        if (event === 'signedOut') { generation++; publish({ user: null, loading: false, error: '' }); }
      });
      const version = generation;
      const params = new URLSearchParams(window.location.search);
      if (window.location.pathname === '/auth/callback') {
        try {
          if (params.get('error') || params.get('insforge_error')) {
            throw new Error('El inicio de sesión con el proveedor fue cancelado o rechazado. Inténtalo nuevamente.');
          }
          const code = params.get('insforge_code');
          if (!code) throw new Error('No recibimos el código de inicio de sesión. Vuelve a intentarlo.');
          resultOrThrow(await client.auth.exchangeOAuthCode(code));
        } finally {
          window.history.replaceState(window.history.state, '', '/auth/callback');
        }
      }
      const { data, error } = await client.auth.getCurrentUser();
      // Una visita sin sesión es normal. Un fallo de red debe poder reintentarse.
      if (error && ![401, 403].includes(error.statusCode ?? error.status)) {
        throw new Error('No se pudo recuperar tu sesión. Comprueba tu conexión e intenta nuevamente.');
      }
      const user = data?.user ? await loadProfile(data.user) : null;
      if (version === generation) publish({ user, loading: false, error: '' });
      return user;
    } catch (error) {
      publish({ user: null, loading: false, error: error.message });
      return null;
    }
  })();
  return initialization;
}

export async function refreshCurrentUser() {
  const version = ++generation;
  const data = resultOrThrow(await getInsforge().auth.getCurrentUser());
  const user = data?.user ? await loadProfile(data.user) : null;
  if (version === generation) publish({ user, loading: false, error: '' });
  return user;
}

export async function login({ email, password }) {
  const version = ++generation;
  const data = resultOrThrow(await getInsforge().auth.signInWithPassword({ email: normalizeEmail(email), password }));
  try {
    const user = await loadProfile(data.user);
    if (version === generation) publish({ user, loading: false, error: '' });
    return user;
  } catch (error) {
    await getInsforge().auth.signOut();
    publish({ user: null, loading: false, error: '' });
    throw error;
  }
}

export async function register(form) {
  const email = normalizeEmail(form.email);
  const data = resultOrThrow(await getInsforge().auth.signUp({
    email, password: form.password, name: `${form.nombre.trim()} ${form.apellido.trim()}`,
    redirectTo: `${window.location.origin}/login`,
  }));
  if (!data?.user) throw new Error('InsForge no devolvió el usuario registrado.');
  // Solo datos personales temporales: nunca contraseña ni rol.
  sessionStorage.setItem(PENDING_PROFILE, JSON.stringify({ id: data.user.id, email, ...personalFields(form) }));
  if (!data.accessToken) return { requiresVerification: true, email };
  const user = await loadProfile(data.user);
  publish({ user, loading: false, error: '' });
  return { user, requiresVerification: false };
}

export async function verifyRegistration({ email, code }) {
  resultOrThrow(await getInsforge().auth.verifyEmail({ email: normalizeEmail(email), otp: code.trim() }));
  return refreshCurrentUser();
}
export async function resendVerification(email) {
  resultOrThrow(await getInsforge().auth.resendVerificationEmail({ email: normalizeEmail(email), redirectTo: `${window.location.origin}/login` }));
}

export async function logout() {
  const { error } = await getInsforge().auth.signOut();
  if (error) throw new Error('No se pudo cerrar la sesión. Inténtalo nuevamente.');
  generation++;
  publish({ user: null, loading: false, error: '' });
}

export async function updateProfile(data) {
  if (!snapshot.user) throw new Error('Debes iniciar sesión.');
  const rows = resultOrThrow(await getInsforge().database.from('perfiles')
    .update(personalFields(data)).eq('id', snapshot.user.id).select());
  if (!rows?.[0]) throw new Error('No se pudo actualizar tu perfil.');
  const user = { ...snapshot.user, ...rows[0] };
  publish({ user });
  return user;
}
export async function updatePreferences(preferencias) {
  if (!snapshot.user) throw new Error('Debes iniciar sesión.');
  const rows = resultOrThrow(await getInsforge().database.from('perfiles')
    .update({ preferencias: {
      notificacionesEmail: Boolean(preferencias.notificacionesEmail),
      notificacionesPromos: Boolean(preferencias.notificacionesPromos),
    } }).eq('id', snapshot.user.id).select());
  if (!rows?.[0]) throw new Error('No se pudieron guardar tus preferencias.');
  const user = { ...snapshot.user, ...rows[0] };
  publish({ user });
  return user;
}

export default { register, login, logout, getCurrentUser, isAuthenticated, updateProfile, updatePreferences };

export async function requestPasswordReset(email) {
  resultOrThrow(await getInsforge().auth.sendResetPasswordEmail({
    email: normalizeEmail(email), redirectTo: `${window.location.origin}/reset-password`,
  }));
  return { email: normalizeEmail(email) };
}
export async function resetPassword({ email, code, password, token }) {
  let otp = token;
  if (!otp) {
    const data = resultOrThrow(await getInsforge().auth.exchangeResetPasswordToken({ email: normalizeEmail(email), code: code.trim() }));
    otp = data?.token;
  }
  if (!otp) throw new Error('El enlace o código de recuperación no es válido. Solicita uno nuevo.');
  resultOrThrow(await getInsforge().auth.resetPassword({ newPassword: password, otp }));
  await getInsforge().auth.signOut();
  generation++;
  publish({ user: null, loading: false, error: '' });
}


export async function signInWithProvider(provider) {
  const { data, error } = await getInsforge().auth.signInWithOAuth(provider, {
    redirectTo: `${window.location.origin}/auth/callback`,
    skipBrowserRedirect: true,
  });
  if (error) throw new Error(error.message || 'No se pudo iniciar sesión con el proveedor.');
  if (!data?.url) throw new Error('El proveedor no está configurado en InsForge.');
  window.location.assign(data.url);
}
