begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema if not exists navana_private;
revoke all on schema navana_private from public, anon, authenticated;
grant usage on schema navana_private to authenticated;

alter table public.staff
  add column auth_user_id uuid unique references auth.users(id) on delete set null;

-- Link the existing confirmed Auth accounts before restricting access.
update public.staff as staff
set auth_user_id = users.id
from public.staff_credentials as credentials
join auth.users as users
  on lower(users.email) = 'staff-' || regexp_replace(credentials.phone, '[^0-9]', '', 'g')
     || '@navana-rest-house.internal'
where staff.id = credentials.staff_id
  and users.email_confirmed_at is not null
  and nullif(users.encrypted_password, '') is not null
  and users.deleted_at is null
  and (users.banned_until is null or users.banned_until < now());

do $$
begin
  if exists (select 1 from public.staff where auth_user_id is null)
     or not exists (select 1 from public.staff where is_admin and auth_user_id is not null) then
    raise exception 'Every existing staff member must have a confirmed Auth account and a linked administrator must remain.';
  end if;
end;
$$;

create function navana_private.is_staff() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff where auth_user_id = (select auth.uid()));
$$;

create function navana_private.is_admin() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff where auth_user_id = (select auth.uid()) and is_admin
  );
$$;

revoke all on function navana_private.is_staff(), navana_private.is_admin() from public, anon;
grant execute on function navana_private.is_staff(), navana_private.is_admin() to authenticated;

-- Restrictive policies require a linked staff account in addition to the normal RLS policy.
do $$
declare
  app_table text;
begin
  foreach app_table in array array[
    'active_stays', 'bookings', 'customer_history', 'expense_categories', 'expenses',
    'hotel_profile', 'inventory_assets', 'inventory_consumables', 'inventory_damage_lost',
    'inventory_stock_in', 'inventory_stock_out', 'notification_log', 'notification_prefs',
    'rooms', 'stay_deposits'
  ] loop
    execute format('revoke all on table public.%I from anon', app_table);
    execute format(
      'create policy navana_linked_staff on public.%I as restrictive for all to authenticated
       using ((select navana_private.is_staff())) with check ((select navana_private.is_staff()))',
      app_table
    );
  end loop;
end;
$$;

-- A regular signed-in user cannot create or promote a staff administrator.
revoke all on table public.staff from anon;
alter policy authenticated_only on public.staff
using ((select navana_private.is_admin())) with check ((select navana_private.is_admin()));
create policy navana_staff_read on public.staff for select to authenticated
using ((select navana_private.is_admin()) or auth_user_id = (select auth.uid()));

revoke all on table public.staff_credentials, public.admin_settings from public, anon, authenticated;

-- Keep the current admin confirmation password working while replacing the plaintext.
alter table public.admin_settings rename column password to password_hash;
update public.admin_settings
set password_hash = extensions.crypt(encode(extensions.digest(password_hash, 'sha256'), 'hex'),
                                     extensions.gen_salt('bf', 12))
where password_hash is not null;

create or replace function public.admin_password_is_set() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select navana_private.is_staff() and exists (
    select 1 from public.admin_settings where id = 1 and password_hash is not null
  );
$$;

create or replace function public.set_admin_password(new_password text) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not navana_private.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if new_password is null or length(new_password) < 8 or length(new_password) > 256 then
    raise exception 'Choose a password between 8 and 256 characters.' using errcode = '22023';
  end if;
  insert into public.admin_settings (id, password_hash)
  values (1, extensions.crypt(encode(extensions.digest(new_password, 'sha256'), 'hex'),
                              extensions.gen_salt('bf', 12)))
  on conflict (id) do update set password_hash = excluded.password_hash;
end;
$$;

create or replace function public.verify_admin_password(input text) returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
begin
  if not navana_private.is_admin() or input is null or length(input) > 256 then
    return false;
  end if;
  return exists (
    select 1 from public.admin_settings
    where id = 1 and password_hash =
      extensions.crypt(encode(extensions.digest(input, 'sha256'), 'hex'), password_hash)
  );
end;
$$;

create or replace function public.get_staff_phone(p_staff_id text) returns text
  language sql stable security definer set search_path = ''
as $$
  select phone from public.staff_credentials
  where staff_id = p_staff_id and navana_private.is_admin();
$$;

-- Keep the legacy UI operational for the signed-in administrator during the rollout.
create or replace function public.set_staff_credentials(
  p_staff_id text, p_phone text default null, p_password text default null
) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if not navana_private.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  insert into public.staff_credentials (staff_id, phone, password_hash)
  values (p_staff_id, coalesce(p_phone, ''),
          coalesce(extensions.crypt(p_password, extensions.gen_salt('bf')), ''))
  on conflict (staff_id) do update
  set phone = coalesce(p_phone, staff_credentials.phone),
      password_hash = coalesce(extensions.crypt(p_password, extensions.gen_salt('bf')),
                               staff_credentials.password_hash);
end;
$$;

revoke execute on function public.admin_password_is_set(), public.set_admin_password(text),
  public.verify_admin_password(text), public.get_staff_phone(text),
  public.set_staff_credentials(text, text, text) from public, anon, authenticated;
grant execute on function public.admin_password_is_set(), public.set_admin_password(text),
  public.verify_admin_password(text), public.get_staff_phone(text),
  public.set_staff_credentials(text, text, text) to authenticated;

commit;
