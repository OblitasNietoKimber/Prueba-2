import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import * as authService from '../services/authService';
import { validateLoginForm } from '../services/validators';
import { routeForRole } from '../services/authRoutes';
import Logo from '../components/common/Logo';
import '../styles/login.css';

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState([]);
  useEffect(() => {
    let active = true;
    authService.getEnabledOAuthProviders().then(enabled => {
      if (active) setProviders(enabled);
    }).catch(() => { /* Los formularios siguen disponibles si falla la consulta de proveedores. */ });
    return () => { active = false; };
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: null,
      }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (loading) return;

    setFormError('');

    const fieldErrors = validateLoginForm(form);
    setErrors(fieldErrors);

    if (Object.keys(fieldErrors).length > 0) return;

    setLoading(true);

    try {
  const loggedUser = await authService.login(form);
  navigate(routeForRole(loggedUser.rol), { replace: true });
} catch (err) {
  setFormError(
    err.message || 'No se pudo iniciar sesión. Inténtalo nuevamente.'
  );
} finally {
  setLoading(false);
}
  }

  async function handleProviderLogin(provider) {
    if (loading) return;
    setLoading(true);
    setFormError('');
    try { await authService.signInWithProvider(provider); }
    catch (error) { setFormError(error.message); setLoading(false); }
  }

  return (
    <div className="lys-root login-page">
      <div className="login-page__card">
        <div className="login-page__logo">
          <Logo size="md" />
        </div>

        <h1 className="font-display login-page__title">
          Bienvenido de vuelta
        </h1>

        <p className="login-page__subtitle">
          Inicia sesión para continuar en Leñas y Sabores.
        </p>

        {new URLSearchParams(location.search).get('insforge_status') === 'success' && (
          <p className="login-page__success" role="status">Tu correo fue verificado. Ya puedes iniciar sesión.</p>
        )}
        <form onSubmit={handleSubmit} noValidate>
          <label
            htmlFor="login-email"
            className="login-page__label"
          >
            Correo electrónico
          </label>

          <input
            id="login-email"
            className={`lys-input login-page__input ${
              errors.email ? 'err' : ''
            }`}
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="tucorreo@ejemplo.com"
            autoComplete="email"
          />

          {errors.email && (
            <p className="login-page__field-error">
              {errors.email}
            </p>
          )}

          <label
            htmlFor="login-password"
            className="login-page__label"
          >
            Contraseña
          </label>

          <input
            id="login-password"
            className={`lys-input login-page__input ${
              errors.password ? 'err' : ''
            }`}
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="••••••••"
            autoComplete="current-password"
          />

          {errors.password && (
            <p className="login-page__field-error">
              {errors.password}
            </p>
          )}

          <div className="login-page__forgot">
            <Link
              to="/forgot-password"
              className="login-page__link login-page__forgot-link"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          {formError && (
            <p className="login-page__form-error" role="alert">
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="btn-ember login-page__submit"
            disabled={loading}
          >
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
          <div className="login-page__divider"><span>o</span></div>
          <button type="button" className="login-page__google" onClick={() => handleProviderLogin('google')} disabled={loading}>
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.86 46.98 24.55z" />
              <path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.28-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            <span>Iniciar sesión con Google</span>
          </button>
          {providers.includes('facebook') && (
            <button type="button" className="login-page__facebook" disabled={loading}
              onClick={() => handleProviderLogin('facebook')}>
              <span aria-hidden="true" className="login-page__facebook-icon">f</span>
              Iniciar sesión con Facebook
            </button>
          )}
        </form>

        <p className="login-page__register">
          ¿Aún no tienes cuenta?{' '}
          <Link to="/register" className="login-page__link">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;