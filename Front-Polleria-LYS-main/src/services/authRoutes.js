export function routeForRole(role) {
  return { cliente: '/catalogo', mesera: '/mesas', cocina: '/cocina', caja: '/caja', admin: '/dashboard' }[role] || '/profile';
}
