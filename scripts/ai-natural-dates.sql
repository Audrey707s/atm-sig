create or replace function public.wa_natural_timestamp(p_text text) returns text
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare value text:=lower(btrim(p_text)); m text[]; day date; hour integer; minute integer;
begin
 value:=regexp_replace(value,'^(mulai|tenggat|deadline|tanggal|mulainya|tenggatnya)(\s+tanggal)?\s+','','i');
 value:=regexp_replace(value,'\s+wib$','','i');
 if value ~ '^\d{4}-\d{2}-\d{2}[ t]\d{2}:\d{2}$' then return replace(value,'t',' ');end if;
 m:=regexp_match(value,'^(hari ini|besok|lusa)\s+(jam|pukul)\s+([0-9]{1,2})([:.]([0-9]{2}))?(\s+(pagi|siang|sore|malam))?$');
 if m is not null then
  day:=(now() at time zone 'Asia/Jakarta')::date+case m[1] when 'besok' then 1 when 'lusa' then 2 else 0 end;
  hour:=m[3]::integer;minute:=coalesce(m[5],'0')::integer;
  if m[7] in ('siang','sore','malam') and hour between 1 and 11 then hour:=hour+12;end if;
  if hour not between 0 and 23 or minute not between 0 and 59 then return null;end if;
  return day::text||' '||lpad(hour::text,2,'0')||':'||lpad(minute::text,2,'0');
 end if;
 return null;
end $$;
revoke all on function public.wa_natural_timestamp(text) from public,anon,authenticated;
grant execute on function public.wa_natural_timestamp(text) to service_role;
