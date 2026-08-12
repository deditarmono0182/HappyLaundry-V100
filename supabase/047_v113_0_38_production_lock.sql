-- HappyLaundry V113.0.38 Production Lock
-- Mengunci seluruh RPC reset aplikasi untuk role publik/anon/authenticated.
do $$
declare r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and (p.proname ilike '%reset%' or p.proname='v113034_reset_operational_data')
  loop
    execute format('revoke all on function %I.%I(%s) from public',r.nspname,r.proname,r.args);
    execute format('revoke all on function %I.%I(%s) from anon',r.nspname,r.proname,r.args);
    execute format('revoke all on function %I.%I(%s) from authenticated',r.nspname,r.proname,r.args);
  end loop;
end $$;
notify pgrst,'reload schema';
