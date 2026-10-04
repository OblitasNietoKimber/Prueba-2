-- SCRUM-249/253/258. El rol de negocio se obtiene del servidor, nunca de metadata editable.
CREATE FUNCTION public.lys_rol() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT rol FROM public.perfiles WHERE id = auth.uid() AND activo;
$$;
REVOKE ALL ON FUNCTION public.lys_rol() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lys_rol() TO authenticated;

-- Inicialización idempotente del perfil desde la identidad autenticada.
-- Un OAuth nuevo y un registro verificado reciben siempre el rol Cliente.
CREATE FUNCTION public.lys_asegurar_perfil() RETURNS public.perfiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE resultado public.perfiles;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión requerida'; END IF;
  INSERT INTO public.perfiles (id,nombre)
  SELECT id, COALESCE(profile->>'name','') FROM auth.users WHERE id = auth.uid()
  ON CONFLICT (id) DO NOTHING;
  SELECT * INTO resultado FROM public.perfiles WHERE id = auth.uid();
  IF resultado.id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
  RETURN resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.lys_asegurar_perfil() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lys_asegurar_perfil() TO authenticated;

REVOKE ALL ON public.roles,public.perfiles,public.categorias,public.productos,
  public.mesas,public.estados,public.pedidos,public.detalles_pedido,public.pagos FROM anon,authenticated;
GRANT SELECT ON public.categorias,public.productos TO anon,authenticated;
GRANT SELECT ON public.roles,public.estados,public.perfiles,public.mesas,
  public.pedidos,public.detalles_pedido,public.pagos TO authenticated;
GRANT UPDATE (nombre,apellido,telefono,preferencias) ON public.perfiles TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.categorias,public.productos,public.mesas,
  public.pedidos,public.detalles_pedido,public.pagos TO authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.productos_id_seq,public.mesas_id_seq,
  public.detalles_pedido_id_seq TO authenticated;

CREATE POLICY roles_lectura ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY estados_lectura ON public.estados FOR SELECT TO authenticated USING (true);
CREATE POLICY perfiles_lectura ON public.perfiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.lys_rol() = 'admin');
CREATE POLICY perfiles_edicion ON public.perfiles FOR UPDATE TO authenticated
  USING ((id = auth.uid() AND public.lys_rol() IS NOT NULL) OR public.lys_rol() = 'admin')
  WITH CHECK ((id = auth.uid() AND public.lys_rol() IS NOT NULL) OR public.lys_rol() = 'admin');
CREATE POLICY categorias_publicas ON public.categorias FOR SELECT TO anon,authenticated USING (activo);
CREATE POLICY productos_publicos ON public.productos FOR SELECT TO anon,authenticated
  USING (disponible AND EXISTS (SELECT 1 FROM public.categorias c WHERE c.id = categoria_id AND c.activo));
CREATE POLICY categorias_admin ON public.categorias FOR ALL TO authenticated
  USING (public.lys_rol() = 'admin') WITH CHECK (public.lys_rol() = 'admin');
CREATE POLICY productos_admin ON public.productos FOR ALL TO authenticated
  USING (public.lys_rol() = 'admin') WITH CHECK (public.lys_rol() = 'admin');
CREATE POLICY mesas_personal ON public.mesas FOR SELECT TO authenticated
  USING (public.lys_rol() IN ('mesera','cocina','caja','admin'));
CREATE POLICY mesas_edicion ON public.mesas FOR UPDATE TO authenticated
  USING (public.lys_rol() IN ('mesera','admin')) WITH CHECK (public.lys_rol() IN ('mesera','admin'));
CREATE POLICY mesas_admin ON public.mesas FOR ALL TO authenticated
  USING (public.lys_rol() = 'admin') WITH CHECK (public.lys_rol() = 'admin');
CREATE POLICY pedidos_lectura ON public.pedidos FOR SELECT TO authenticated
  USING ((cliente_id = auth.uid() AND public.lys_rol() = 'cliente') OR public.lys_rol() IN ('mesera','cocina','caja','admin'));
CREATE POLICY pedidos_creacion ON public.pedidos FOR INSERT TO authenticated
  WITH CHECK (public.lys_rol() IN ('mesera','admin') AND creado_por = auth.uid());
CREATE POLICY pedidos_edicion ON public.pedidos FOR UPDATE TO authenticated
  USING (public.lys_rol() IN ('mesera','cocina','caja','admin'))
  WITH CHECK (public.lys_rol() IN ('mesera','cocina','caja','admin'));
CREATE POLICY pedidos_borrado ON public.pedidos FOR DELETE TO authenticated USING (public.lys_rol() = 'admin');
CREATE POLICY detalles_lectura ON public.detalles_pedido FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id));
CREATE POLICY detalles_personal ON public.detalles_pedido FOR ALL TO authenticated
  USING (public.lys_rol() IN ('mesera','admin')) WITH CHECK (public.lys_rol() IN ('mesera','admin'));
CREATE POLICY pagos_lectura ON public.pagos FOR SELECT TO authenticated
  USING (public.lys_rol() IN ('caja','admin') OR EXISTS (
    SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.cliente_id = auth.uid() AND public.lys_rol() = 'cliente'
  ));
CREATE POLICY pagos_creacion ON public.pagos FOR INSERT TO authenticated
  WITH CHECK (public.lys_rol() IN ('caja','admin') AND registrado_por = auth.uid());
CREATE POLICY pagos_edicion ON public.pagos FOR UPDATE TO authenticated
  USING (public.lys_rol() IN ('caja','admin')) WITH CHECK (public.lys_rol() IN ('caja','admin'));
CREATE POLICY pagos_borrado ON public.pagos FOR DELETE TO authenticated USING (public.lys_rol() = 'admin');

-- Cocina y Caja pueden actualizar el estado, sin alterar importes ni propietario.
CREATE FUNCTION public.lys_limitar_pedido() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF public.lys_rol() IN ('cocina','caja') AND
    (to_jsonb(NEW) - 'estado_id') IS DISTINCT FROM (to_jsonb(OLD) - 'estado_id') THEN
    RAISE EXCEPTION 'Tu rol solo puede cambiar el estado del pedido';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lys_pedido_campos BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.lys_limitar_pedido();
REVOKE ALL ON FUNCTION public.lys_limitar_pedido() FROM PUBLIC;
