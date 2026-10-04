import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db;
const ids = Object.fromEntries(['cliente','otro','admin','cocina','caja','mesera'].map((rol,index) => [rol,`00000000-0000-4000-8000-00000000000${index+1}`]));
const pedido = '10000000-0000-4000-8000-000000000001';
const pedidoOtro = '10000000-0000-4000-8000-000000000002';
async function asUser(rol, sql) {
  await db.exec('BEGIN');
  try {
    await db.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${ids[rol]}',true);`);
    const result = await db.query(sql);
    await db.exec('COMMIT');
    return result.rows;
  } catch (error) { await db.exec('ROLLBACK'); throw error; }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,profile jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
  const folder = new URL('../migrations/',import.meta.url);
  for (const file of readdirSync(folder).sort()) await db.exec(readFileSync(new URL(file,folder),'utf8'));
  for (const [rol,id] of Object.entries(ids)) {
    await db.exec(`INSERT INTO auth.users VALUES ('${id}','{"name":"${rol}"}'); INSERT INTO public.perfiles(id,nombre,rol) VALUES ('${id}','${rol}','${rol==='otro'?'cliente':rol}');`);
  }
  await db.exec(`INSERT INTO public.pedidos(id,codigo,cliente_id,creado_por,tipo,subtotal,total) VALUES
    ('${pedido}','P-001','${ids.cliente}','${ids.mesera}','recojo',42.90,42.90),
    ('${pedidoOtro}','P-002','${ids.otro}','${ids.mesera}','recojo',24.90,24.90);
    INSERT INTO public.detalles_pedido(pedido_id,producto_id,nombre_producto,cantidad,precio_unitario) VALUES
    ('${pedido}',1,'Pollo',1,42.90),('${pedidoOtro}',2,'Medio pollo',1,24.90);`);
},30000);
afterAll(async () => { await db?.close(); });

describe('migraciones y RLS en PostgreSQL', () => {
  it('crea el catálogo y las mesas sin pedidos ficticios en el seed',async () => {
    expect((await db.query('SELECT count(*)::int n FROM public.productos')).rows[0].n).toBe(17);
    expect((await db.query("SELECT count(*)::int n FROM public.mesas WHERE estado='libre'")).rows[0].n).toBe(16);
  });
  it('permite lectura pública del catálogo, pero oculta perfiles',async () => {
    await db.exec('BEGIN; SET LOCAL ROLE anon');
    expect((await db.query('SELECT count(*)::int n FROM public.productos')).rows[0].n).toBe(17);
    await expect(db.query('SELECT * FROM public.perfiles')).rejects.toThrow('permission denied');
    await db.exec('ROLLBACK');
  });
  it('cada cliente ve solo sus pedidos y sus detalles',async () => {
    expect((await asUser('cliente','SELECT id FROM public.pedidos')).map(row=>row.id)).toEqual([pedido]);
    expect(await asUser('cliente',`SELECT * FROM public.detalles_pedido WHERE pedido_id='${pedidoOtro}'`)).toEqual([]);
    expect(await asUser('cliente',`SELECT * FROM public.perfiles WHERE id='${ids.otro}'`)).toEqual([]);
  });
  it('permite editar datos personales y prohíbe asignarse Admin',async () => {
    await asUser('cliente',`UPDATE public.perfiles SET telefono='987654321' WHERE id='${ids.cliente}'`);
    await expect(asUser('cliente',`UPDATE public.perfiles SET rol='admin' WHERE id='${ids.cliente}'`)).rejects.toThrow('permission denied');
    await expect(asUser('cliente',`UPDATE public.perfiles SET activo=false WHERE id='${ids.cliente}'`)).rejects.toThrow('permission denied');
  });
  it('el cliente no puede registrar pagos ni crear pedidos con importes arbitrarios',async () => {
    await expect(asUser('cliente',`INSERT INTO public.pagos(pedido_id,registrado_por,metodo,monto) VALUES ('${pedido}','${ids.cliente}','efectivo',1)`)).rejects.toThrow('row-level security');
    await expect(asUser('cliente',`INSERT INTO public.pedidos(codigo,creado_por,tipo,subtotal,total) VALUES ('FAKE','${ids.cliente}','recojo',0,0)`)).rejects.toThrow('row-level security');
  });
  it('Cocina cambia el estado y no altera los importes',async () => {
    await asUser('cocina',`UPDATE public.pedidos SET estado_id='preparacion' WHERE id='${pedido}'`);
    await expect(asUser('cocina',`UPDATE public.pedidos SET subtotal=1,total=1 WHERE id='${pedido}'`)).rejects.toThrow('solo puede cambiar');
    expect(await asUser('cocina','SELECT * FROM public.pagos')).toEqual([]);
  });
  it('Caja puede registrar el pago y Mesera no puede hacerlo',async () => {
    await asUser('caja',`INSERT INTO public.pagos(pedido_id,registrado_por,metodo,monto) VALUES ('${pedido}','${ids.caja}','efectivo',42.90)`);
    await expect(asUser('mesera',`INSERT INTO public.pagos(pedido_id,registrado_por,metodo,monto) VALUES ('${pedido}','${ids.mesera}','efectivo',42.90)`)).rejects.toThrow('row-level security');
    expect((await asUser('cliente','SELECT * FROM public.pagos')).length).toBe(1);
    expect(await asUser('otro','SELECT * FROM public.pagos')).toEqual([]);
  });
  it('un cliente no puede modificar productos y Admin sí',async () => {
    expect(await asUser('cliente',"UPDATE public.productos SET precio=1 WHERE id=1 RETURNING id")).toEqual([]);
    expect((await asUser('admin',"UPDATE public.productos SET descripcion='Verificado' WHERE id=1 RETURNING id")).length).toBe(1);
  });
  it('un perfil nuevo se crea como Cliente e inicializarlo no cambia su rol',async () => {
    const nuevo='00000000-0000-4000-8000-000000000099';
    await db.exec(`INSERT INTO auth.users VALUES ('${nuevo}','{"name":"Nuevo","rol":"admin"}')`);
    await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${nuevo}',true)`);
    const rows=(await db.query('SELECT (public.lys_asegurar_perfil()).*')).rows;
    expect(rows[0].rol).toBe('cliente');
    await db.exec('COMMIT');
    expect((await asUser('admin','SELECT (public.lys_asegurar_perfil()).*'))[0].rol).toBe('admin');
  });
  it('un usuario desactivado pierde acceso a pedidos',async () => {
    await db.exec(`UPDATE public.perfiles SET activo=false WHERE id='${ids.otro}'`);
    expect(await asUser('otro','SELECT * FROM public.pedidos')).toEqual([]);
  });
});
