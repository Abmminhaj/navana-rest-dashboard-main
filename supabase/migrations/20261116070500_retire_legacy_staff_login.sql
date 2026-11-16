begin;

-- Apply after the Supabase Auth client has been deployed and checked.
revoke execute on function public.staff_login(text, text),
  public.set_staff_credentials(text, text, text)
from public, anon, authenticated;

commit;
