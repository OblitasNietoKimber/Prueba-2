import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { routeForRole } from '../services/authRoutes';

export default function AuthCallbackPage() {
  const { user, loading, error } = useAuth();
  if (loading) return <div className="lys-root login-page"><div className="login-page__card"><p role="status">Completando el inicio de sesión...</p></div></div>;
  if (user && !error) return <Navigate to={routeForRole(user.rol)} replace />;
  return <div className="lys-root login-page"><div className="login-page__card">
    <h1 className="login-page__title">No pudimos iniciar sesión</h1>
    <p className="login-page__form-error" role="alert">{error || 'No se pudo recuperar tu sesión. Inténtalo nuevamente.'}</p>
    <Link className="btn-ember login-page__submit" to="/login">Volver a iniciar sesión</Link>
  </div></div>;
}
