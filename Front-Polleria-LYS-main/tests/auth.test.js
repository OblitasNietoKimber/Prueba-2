import { beforeEach, describe, expect, it, vi } from 'vitest';

const id = '00000000-0000-4000-8000-000000000001';
const user = { id, email: 'ana@example.com' };
const profile = { id, nombre: 'Ana', apellido: 'Torres', telefono: '987654321', rol: 'cliente', activo: true };
let client, service, pending, replaceState, assign;
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: vi.fn(key => values.delete(key)) };
}
beforeEach(async () => {
  vi.resetModules();
  pending = storage();
  replaceState = vi.fn(); assign = vi.fn();
  vi.stubGlobal('sessionStorage', pending);
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5173', pathname: '/', search: '', assign }, history: { state: {}, replaceState } });
  client = { auth: {
    onAuthStateChange: vi.fn(), getCurrentUser: vi.fn().mockResolvedValue({ data: {user: null}, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {user}, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: {user}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    exchangeOAuthCode: vi.fn().mockResolvedValue({ data: {user}, error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: {url: 'https://accounts.google.com/'}, error: null }),
    sendResetPasswordEmail: vi.fn().mockResolvedValue({ data: {success: true}, error: null }),
    exchangeResetPasswordToken: vi.fn().mockResolvedValue({ data: {token: 'reset-token'}, error: null }),
    resetPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    getPublicAuthConfig: vi.fn().mockResolvedValue({ data: {oAuthProviders:['google']}, error: null }),
  }, database: { rpc: vi.fn().mockResolvedValue({ data: profile, error: null }), from: vi.fn() } };
  vi.doMock('../src/lib/insforge', () => ({ getInsforge: () => client }));
  service = await import('../src/services/authService');
});

describe('autenticación', () => {
  it('no acepta sesiones simuladas y elimina las credenciales antiguas', async () => {
    localStorage.setItem('lys_session', JSON.stringify({...profile, rol:'admin'}));
    await service.initializeAuth();
    expect(service.getCurrentUser()).toBeNull();
    expect(localStorage.getItem('lys_session')).toBeNull();
    expect(localStorage.removeItem).toHaveBeenCalledWith('lys_users');
  });
  it('espera la sesión real y obtiene el rol desde PostgreSQL', async () => {
    client.auth.getCurrentUser.mockResolvedValue({data:{user:{...user, rol:'admin'}},error:null});
    await service.initializeAuth();
    expect(service.getCurrentUser().rol).toBe('cliente');
    expect(service.getAuthSnapshot().loading).toBe(false);
  });
  it('normaliza el correo y publica el perfil al iniciar sesión', async () => {
    await service.login({email:' ANA@example.com ',password:'Clave123'});
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({email:user.email,password:'Clave123'});
    expect(service.getCurrentUser().id).toBe(id);
  });
  it('rechaza una cuenta desactivada y cierra la sesión SDK', async () => {
    client.database.rpc.mockResolvedValue({data:{...profile,activo:false},error:null});
    await expect(service.login({email:user.email,password:'Clave123'})).rejects.toThrow('desactivada');
    expect(service.getCurrentUser()).toBeNull();
    expect(client.auth.signOut).toHaveBeenCalled();
  });
  it('no inicia sesión automáticamente si el registro requiere verificar correo', async () => {
    const result = await service.register({...profile,email:user.email,password:'Clave123',rol:'admin'});
    expect(result.requiresVerification).toBe(true);
    expect(service.getCurrentUser()).toBeNull();
    const pendingData = JSON.parse(pending.getItem('lys_pending_profile'));
    expect(pendingData).not.toHaveProperty('password');
    expect(pendingData).not.toHaveProperty('rol');
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it('no deja un perfil autenticado cuando falla la consulta de roles', async () => {
    client.database.rpc.mockResolvedValue({data:null,error:{message:'Faltan migraciones'}});
    await expect(service.login({email:user.email,password:'Clave123'})).rejects.toThrow('migraciones');
    expect(service.getCurrentUser()).toBeNull();
  });
  it('completa el callback una sola vez aunque se inicialice dos veces', async () => {
    window.location.pathname='/auth/callback'; window.location.search='?insforge_code=code';
    client.auth.getCurrentUser.mockResolvedValue({data:{user},error:null});
    await Promise.all([service.initializeAuth(),service.initializeAuth()]);
    expect(client.auth.exchangeOAuthCode).toHaveBeenCalledTimes(1);
    expect(service.getCurrentUser().id).toBe(id);
    expect(replaceState).toHaveBeenCalledWith({},'', '/auth/callback');
  });
  it('muestra un fallo de OAuth y nunca redirige con una sesión antigua', async () => {
    window.location.pathname='/auth/callback'; window.location.search='?error=access_denied';
    client.auth.getCurrentUser.mockResolvedValue({data:{user},error:null});
    await service.initializeAuth();
    expect(service.getCurrentUser()).toBeNull();
    expect(service.getAuthSnapshot().error).toContain('cancelado');
  });
  it('usa la ruta de callback del origen actual', async () => {
    await service.signInWithProvider('google');
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith('google',{redirectTo:'http://localhost:5173/auth/callback',skipBrowserRedirect:true});
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/');
  });
  it('no devuelve un código de recuperación en pantalla', async () => {
    const data = await service.requestPasswordReset(user.email);
    expect(data).not.toHaveProperty('code');
    expect(client.auth.sendResetPasswordEmail).toHaveBeenCalledWith({email:user.email,redirectTo:'http://localhost:5173/reset-password'});
  });
  it('intercambia el código por un token antes de cambiar la contraseña', async () => {
    await service.resetPassword({email:user.email,code:'123456',password:'Nueva123'});
    expect(client.auth.resetPassword).toHaveBeenCalledWith({newPassword:'Nueva123',otp:'reset-token'});
  });
  it('acepta un enlace sin solicitar código ni correo', async () => {
    await service.resetPassword({token:'email-link-token',password:'Nueva123'});
    expect(client.auth.exchangeResetPasswordToken).not.toHaveBeenCalled();
    expect(client.auth.resetPassword).toHaveBeenCalledWith({newPassword:'Nueva123',otp:'email-link-token'});
  });
  it('no restablece una contraseña con un código inválido', async () => {
    client.auth.exchangeResetPasswordToken.mockResolvedValue({data:null,error:{message:'Código inválido'}});
    await expect(service.resetPassword({email:user.email,code:'000000',password:'Nueva123'})).rejects.toThrow('inválido');
    expect(client.auth.resetPassword).not.toHaveBeenCalled();
  });
  it('ignora una actualización de perfil que termina después de cerrar sesión', async () => {
    await service.login({email:user.email,password:'Clave123'});
    let finish;
    const update = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn(() => new Promise(resolve => { finish=resolve; })) };
    client.database.from.mockReturnValue(update);
    const updating = service.updateProfile(profile);
    await service.logout();
    finish({data:[profile],error:null});
    await expect(updating).rejects.toThrow('sesión cambió');
    expect(service.getCurrentUser()).toBeNull();
    expect(update.update.mock.calls[0][0]).not.toHaveProperty('rol');
  });
});
