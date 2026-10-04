import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, error } = useAuth();
  const location = useLocation();
  if (loading) return <p role="status">Comprobando tu sesión...</p>;
  if (error) return <div role="alert"><p>{error}</p><button onClick={() => window.location.reload()}>Reintentar</button></div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (allowedRoles && !allowedRoles.includes(user.rol)) return <Navigate to="/profile" replace />;
  return children;
}
export default ProtectedRoute;
