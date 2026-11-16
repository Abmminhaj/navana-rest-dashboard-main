begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function navana_private.can_use_pages(page_paths text[]) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff
    where auth_user_id = (select auth.uid()) and (is_admin or allowed_pages && page_paths)
  );
$$;
revoke execute on function navana_private.can_use_pages(text[]) from public, anon;
grant execute on function navana_private.can_use_pages(text[]) to authenticated;

-- Check authorization for direct API calls as well as route navigation.
do $$
declare
  rule record;
begin
  for rule in select * from (values
    ('bookings', array['/', '/booking', '/reports'], array['/booking']),
    ('active_stays', array['/', '/booking', '/checkout', '/rooms', '/reports'], array['/booking', '/checkout']),
    ('stay_deposits', array['/', '/booking', '/checkout', '/reports', '/rooms'], array['/checkout']),
    ('customer_history', array['/', '/booking', '/checkout', '/customers', '/reports'], array['/checkout', '/customers']),
    ('expenses', array['/', '/expenses', '/reports'], array['/expenses']),
    ('expense_categories', array['/expenses'], array['/expenses']),
    ('inventory_assets', array['/inventory'], array['/inventory']),
    ('inventory_consumables', array['/inventory'], array['/inventory']),
    ('inventory_damage_lost', array['/inventory'], array['/inventory']),
    ('inventory_stock_in', array['/inventory'], array['/inventory']),
    ('inventory_stock_out', array['/inventory'], array['/inventory']),
    ('rooms', array['/', '/booking', '/checkout', '/rooms', '/reports'], array['/booking', '/checkout', '/rooms']),
    ('hotel_profile', null::text[], array[]::text[]),
    ('notification_prefs', null::text[], array[]::text[]),
    ('notification_log', array['/', '/booking', '/checkout', '/customers', '/reports'],
      array['/', '/booking', '/checkout', '/customers', '/reports'])
  ) as rules(table_name, readers, writers) loop
    if rule.readers is not null then
      execute format(
        'create policy navana_route_read on public.%I as restrictive for select to authenticated
         using ((select navana_private.can_use_pages(%L::text[])))',
        rule.table_name, rule.readers
      );
    end if;
    execute format(
      'create policy navana_route_insert on public.%I as restrictive for insert to authenticated
       with check ((select navana_private.can_use_pages(%L::text[])))',
      rule.table_name,
      case rule.table_name
        when 'active_stays' then array['/booking']
        when 'customer_history' then array['/checkout']
        when 'rooms' then array[]::text[]
        else rule.writers
      end
    );
    execute format(
      'create policy navana_route_update on public.%I as restrictive for update to authenticated
       using ((select navana_private.can_use_pages(%L::text[])))
       with check ((select navana_private.can_use_pages(%L::text[])))',
      rule.table_name,
      case rule.table_name
        when 'customer_history' then array['/customers']
        else rule.writers
      end,
      case rule.table_name
        when 'bookings' then array[]::text[]
        when 'active_stays' then array[]::text[]
        when 'stay_deposits' then array[]::text[]
        when 'customer_history' then array['/customers']
        else rule.writers
      end
    );
    execute format(
      'create policy navana_route_delete on public.%I as restrictive for delete to authenticated
       using ((select navana_private.can_use_pages(%L::text[])))',
      rule.table_name,
      case rule.table_name
        when 'bookings' then array[]::text[]
        when 'active_stays' then array['/checkout']
        when 'stay_deposits' then array[]::text[]
        when 'customer_history' then array[]::text[]
        when 'rooms' then array[]::text[]
        else rule.writers
      end
    );
  end loop;
end;
$$;

-- Reception staff can change occupancy through booking and checkout.
create function navana_private.protect_room_fields() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not navana_private.is_admin()
     and not navana_private.can_use_pages(array['/rooms'])
     and (to_jsonb(new) - array['status', 'updated_at']) <> (to_jsonb(old) - array['status', 'updated_at']) then
    raise exception 'Room settings access required.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger protect_room_fields before update on public.rooms
for each row execute function navana_private.protect_room_fields();

create function navana_private.protect_own_admin() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if old.is_admin and old.auth_user_id = (select auth.uid()) and
      (tg_op = 'DELETE' or new.is_admin is distinct from true
       or new.auth_user_id is distinct from old.auth_user_id) then
    raise exception 'Administrators cannot remove their own access.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger protect_own_admin before update or delete on public.staff
for each row execute function navana_private.protect_own_admin();

create function public.save_staff_profile(
  p_id text, p_name text, p_role text, p_email text, p_phone text,
  p_is_admin boolean, p_allowed_pages text[]
) returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  account_id uuid;
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if not navana_private.is_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if digits !~ '^[0-9]{6,15}$' or nullif(trim(p_name), '') is null
     or nullif(trim(p_role), '') is null or nullif(trim(p_email), '') is null then
    raise exception 'Staff name, role, email and mobile number are required.' using errcode = '22023';
  end if;

  select id into account_id from auth.users
  where lower(email) = 'staff-' || digits || '@navana-rest-house.internal'
    and email_confirmed_at is not null and nullif(encrypted_password, '') is not null
    and deleted_at is null and (banned_until is null or banned_until < now());
  if account_id is null then
    raise exception 'Create and confirm a Supabase Auth user for this mobile number first.' using errcode = '22023';
  end if;

  insert into public.staff (id, name, role, email, is_admin, allowed_pages, auth_user_id)
  values (p_id, trim(p_name), trim(p_role), trim(p_email), coalesce(p_is_admin, false),
          coalesce(p_allowed_pages, array[]::text[]), account_id)
  on conflict (id) do update set
    name = excluded.name, role = excluded.role, email = excluded.email,
    is_admin = excluded.is_admin, allowed_pages = excluded.allowed_pages,
    auth_user_id = excluded.auth_user_id;

  insert into public.staff_credentials (staff_id, phone, password_hash)
  values (p_id, digits, '')
  on conflict (staff_id) do update set phone = excluded.phone;
end;
$$;

revoke execute on function public.save_staff_profile(text, text, text, text, text, boolean, text[])
from public, anon, authenticated;
grant execute on function public.save_staff_profile(text, text, text, text, text, boolean, text[])
to authenticated;

commit;
