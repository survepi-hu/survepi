-- Identité visuelle lisible avant connexion (écran de connexion) : seulement ces clés, rien d'autre.
insert into public.settings (key, value) values ('logo', '""') on conflict (key) do nothing;

create or replace function public.public_branding() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from public.settings where key in ('province_nom', 'dps_nom', 'evenement', 'logo')
$$;
revoke all on function public.public_branding() from public;
grant execute on function public.public_branding() to anon, authenticated;

-- Le logo est une petite image (data URL PNG/JPEG redimensionnée dans le navigateur) : on borne sa taille.
create or replace function public.trg_settings_logo() returns trigger language plpgsql as $$
begin
  if new.key = 'logo' and new.value not in ('null'::jsonb, '""'::jsonb) then
    if jsonb_typeof(new.value) <> 'string' or (new.value #>> '{}') !~ '^data:image/(png|jpeg|webp);base64,' then
      raise exception 'Logo : image PNG, JPEG ou WebP attendue' using errcode = 'P0001';
    end if;
    if length(new.value #>> '{}') > 300000 then
      raise exception 'Logo trop lourd (300 Ko maximum)' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists settings_logo on public.settings;
create trigger settings_logo before insert or update on public.settings for each row execute function public.trg_settings_logo();
