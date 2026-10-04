# Autenticación y backend LYS (Sprint 2)

Código en `Front-Polleria-LYS-main/`, rama `feature/login-validation`, creada desde `dev` (`2d750a7`).

## Ejecutar en Windows / PowerShell

```powershell
git fetch origin
git switch feature/login-validation
cd Front-Polleria-LYS-main
npm install
Copy-Item .env.example .env
npm run dev
```

Completar `.env` con la URL del proyecto y su **Anon/Public Key**. No usar la clave administrativa `ik_...` en variables `VITE_*`: esas variables se incluyen en el navegador. `.env`, `.env.*` y `.insforge` están excluidos de Git; solo se versiona `.env.example`.

La clave anon es opcional para los endpoints de autenticación del SDK; es necesaria para leer datos como usuario anónimo. No se inventó una clave pública ni se incluyó la clave privada facilitada en la conversación.

## Aplicar las migraciones antes de probar el login

El acceso al proyecto remoto estuvo bloqueado por la red durante la implementación. **Las migraciones están verificadas localmente, pero no aplicadas al proyecto remoto.** No se pudo consultar su esquema actual ni obtener su clave pública o configuración OAuth.

El repositorio no incluía el SQL MySQL original; el esquema PostgreSQL se deriva de los modelos y servicios actuales del frontend. Incluye roles, perfiles, categorías, productos, mesas, pedidos, detalles, estados y pagos. Si el proyecto remoto ya tiene tablas con estos nombres, revisar y adaptar con una migración nueva antes de aplicar; no borrar tablas existentes.

Con InsForge CLI, siguiendo su documentación oficial:

```powershell
npx @insforge/cli login
npx @insforge/cli link
npx @insforge/cli db migrations list
npx @insforge/cli db migrations up --all
```

Elegir el proyecto `aep52x8n` al vincularlo. El CLI registra el historial y ejecuta cada archivo dentro de una transacción. Archivos, en orden:

1. `20261004040000_lys_schema.sql`: tablas, claves foráneas, restricciones e índices; RLS activado desde la creación.
2. `20261004040100_lys_seed.sql`: 4 categorías, 17 productos y 16 mesas libres, sin usuarios ni pedidos ficticios.
3. `20261004040200_lys_access.sql`: permisos por rol y funciones de inicialización del perfil.

Para un proyecto con historial de migraciones previo, ejecutar primero `npx @insforge/cli db migrations fetch` y revisar las diferencias. No editar archivos ya aplicados: crear otra migración.

## Configuración de autenticación en InsForge

En Auth Methods, habilitar correo/contraseña, verificación de correo, recuperación y Google. Registrar como destinos permitidos:

- `http://localhost:5173/auth/callback`
- `http://localhost:5173/login`
- `http://localhost:5173/reset-password`

Agregar también el origen y las rutas reales del despliegue cuando se publique. Si Vite elige otro puerto, registrar ese puerto. Mantener el mismo host (`localhost` o `127.0.0.1`) durante todo el flujo: el verificador PKCE se guarda en el origen desde el que se inició OAuth.

El redirect URI que se configura en Google es el callback del **backend InsForge** indicado en su panel. `/auth/callback` del frontend es el destino al que InsForge retorna después del proveedor. En producción, configurar el hosting para devolver `index.html` al acceder directamente a las rutas de React.

La aplicación intercambia `insforge_code` una sola vez, carga el perfil y envía al Cliente a `/catalogo`; Mesera a `/mesas`; Cocina a `/cocina`; Caja a `/caja`; Administrador a `/dashboard`. Los códigos del callback se eliminan de la URL incluso si el intercambio falla. La sesión se recupera con el SDK y sus cookies, sin contraseñas ni roles autenticados persistidos en `localStorage`.

Facebook admite una integración independiente en el SDK y backend oficiales consultados. El botón solo aparece si la configuración pública del **proyecto en ejecución** incluye `facebook`. Sus credenciales y su habilitación real no se pudieron verificar desde este entorno. Configurarlo en InsForge y Meta antes de probarlo.

## Registro, perfil y recuperación

Un registro que exige verificar correo no intenta iniciar sesión antes de la verificación. Acepta enlace o código recibido por correo. Los datos personales pendientes se guardan temporalmente en `sessionStorage`, vinculados al ID y correo registrados; no incluyen contraseña ni rol. Al verificar/iniciar sesión en ese navegador, se guardan en `perfiles`. Si el usuario verifica en otro dispositivo o cierra esa sesión del navegador, debe completar nombre, apellido y teléfono desde Mi perfil.

La función `lys_asegurar_perfil` crea un perfil como Cliente para la identidad autenticada. No acepta un ID ni un rol enviados por el navegador. RLS impide leer otros perfiles y los permisos de columnas impiden modificar `rol` o `activo`. Para asignar personal, usar el SQL Editor administrativo, por ejemplo:

```sql
UPDATE public.perfiles SET rol = 'caja' WHERE id = '<UUID-del-usuario>';
```

Los roles válidos son `cliente`, `mesera`, `cocina`, `caja` y `admin`. Volver a iniciar sesión tras cambiar un rol. La cuenta debe haber iniciado sesión al menos una vez para tener su perfil de negocio.

La recuperación admite código de correo (intercambio por token) o enlace con token. Nunca muestra un código demo. Un enlace vencido pide solicitar otro correo. El token se elimina de la URL al abrir la pantalla. El cambio de contraseña desde Mi perfil utiliza este mismo proceso de verificación por correo.

Al inicializar la aplicación, se eliminan las claves antiguas `lys_users`, `lys_session` y `lys_reset_requests`; las cuentas de prueba ya no se crean.

## Alcance y permisos

La autenticación y los perfiles usan InsForge. Los servicios operativos de pedidos, cocina, caja, mesas y productos conservan sus simulaciones actuales; migrar esos servicios corresponde a sus próximos epics. Los pedidos locales del cliente ahora quedan asociados a su UUID y solo se muestran al propietario; los pedidos demo antiguos no se asignan a usuarios reales.

Las tablas nuevas están preparadas con permisos de base de datos. Clientes leen sus pedidos, detalles y pagos; el personal tiene acceso según su rol. Cocina y Caja solo pueden modificar el estado del pedido, sin cambiar sus importes ni propietario. El catálogo público solo muestra productos disponibles de categorías activas. El alta de pedidos de clientes requiere un futuro RPC/backend que calcule importes; se deniega la inserción directa con totales enviados desde el navegador. Esto no convierte la pasarela de pagos simulada en una pasarela real.

## Validación

```powershell
npm test
npm run build
npm run lint
```

24 pruebas automatizadas: sesiones, verificación pendiente, OAuth, recuperación, aislamiento entre clientes y permisos RLS. Las migraciones se ejecutan en PostgreSQL embebido con PGlite y roles reales `anon`/`authenticated`. Estas pruebas no reemplazan una prueba real con Google, SMTP ni el esquema remoto.

`dev` ya tenía 15 errores y una advertencia de ESLint. Los archivos de esta implementación se validan por separado; no se modifican componentes ajenos para ocultar problemas existentes.

Documentación oficial consultada:

- https://github.com/InsForge/InsForge-sdk-js/blob/main/SDK-REFERENCE.md
- https://github.com/InsForge/InsForge/blob/main/docs/core-concepts/database/migrations.mdx
- https://github.com/InsForge/InsForge/blob/main/backend/.agents/docs/insforge-instructions-sdk.md

El MCP se instaló mediante `@insforge/install` y se intentó invocar `fetch-docs`. Su arranque no pudo superar la conexión a `/api/health` por el bloqueo de red. Las instrucciones y referencias se consultaron desde el código oficial; no se afirma que hubo una respuesta exitosa del MCP.
