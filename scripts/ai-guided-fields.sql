create or replace function public.atm_ai_guided_fields(p_actor uuid,p_op text,p_data jsonb,p_target text default null) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d jsonb:=coalesce(p_data,'{}'); spec jsonb:=public.wa_operation_catalog()->p_op; field text; question text; options jsonb:='[]'; result jsonb;
 actor_level integer; actor_org integer; owner_id uuid:=p_actor; owner_org integer; matches uuid[]; value text; section_id integer;
 old_role text:=current_user; old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 select u.org_unit_id,r.level into actor_org,actor_level from public.users u join public.roles r on r.id=u.role_id where u.id=p_actor and u.status='aktif';
 if actor_level is null or spec is null or actor_level<(spec->>'minimumRole')::integer then return jsonb_build_object('ok',false,'message','Aksi berada di luar hak akses Anda.');end if;
 for field in select jsonb_object_keys(d) loop if not (spec->'fields')?field then return jsonb_build_object('ok',false,'message','Isian tidak tersedia untuk aksi ini.');end if;end loop;
 field:=null;
 <<dates>> begin
  if p_op in ('task_create','task_duplicate','task_deadline','task_update') then
   for value in select key from jsonb_each_text(d) where key in ('mulai','tenggat') loop
    if d->>value !~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$' then
     d:=jsonb_set(d,array[value],to_jsonb(public.wa_natural_timestamp(d->>value)));
     if d is null or d->value='null'::jsonb then d:=coalesce(d,p_data)-value;field:=value;question:='Kapan '||case value when 'mulai' then 'mulainya' else 'tenggatnya' end||'? Balas seperti “besok jam 8 pagi” atau tanggal dan jam WIB.';exit dates;end if;
    end if;
    begin perform (d->>value)::timestamp;exception when invalid_datetime_format or datetime_field_overflow then d:=d-value;field:=value;question:='Tanggal atau jam itu belum valid. Kapan '||value||' yang benar?';exit dates;end;
   end loop;
   if d?'mulai' and d?'tenggat' and (d->>'tenggat')::timestamp<=(d->>'mulai')::timestamp then d:=d-'tenggat';field:='tenggat';question:='Tenggat harus setelah waktu mulai. Kapan tenggat barunya?';exit dates;end if;
  end if;
 end dates;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',p_actor::text,true);perform set_config('role','authenticated',true);
 <<guided>> begin
  if field is not null then exit guided;end if;
  if p_op in ('task_create','task_duplicate','template_create','task_reassign') and d?'pic' and lower(d->>'pic')<>'saya' then
   select array_agg(u.id) into matches from public.users u join public.roles r on r.id=u.role_id where u.status='aktif' and r.level>=2 and (lower(u.name)=lower(btrim(d->>'pic')) or lower(u.email)=lower(btrim(d->>'pic')));
   if coalesce(cardinality(matches),0)<>1 then d:=d-'pic';field:='pic';question:='PIC belum cocok dengan satu akun aktif. Siapa PIC-nya? Sebutkan nama lengkap atau email.';exit guided;end if;
   owner_id:=matches[1];
  end if;
  if p_op in ('task_create','task_duplicate','template_create') then
   if actor_level=2 and owner_id<>p_actor then result:=jsonb_build_object('ok',false,'message','Role PIC hanya dapat membuat pekerjaan untuk dirinya sendiri.');exit guided;end if;
   select org_unit_id into owner_org from public.users where id=owner_id;
   if not d?'seksi' and exists(select 1 from public.org_units where id=owner_org and type='section') then d:=d||jsonb_build_object('seksi',owner_org::text);end if;
  end if;
  if p_op='template_create' and d?'judul' and not d?'nama' then d:=d||jsonb_build_object('nama',d->>'judul');end if;
  if d?'seksi' then
   select min(o.id) into section_id from public.org_units o where o.type='section' and (o.id::text=d->>'seksi' or lower(o.name)=lower(btrim(d->>'seksi'))) having count(*)=1;
   if section_id is null then d:=d-'seksi';
   elsif not public.can_manage_org_unit(section_id) then result:=jsonb_build_object('ok',false,'message','Seksi atau PIC berada di luar cakupan pengelolaan akun Anda.');exit guided;end if;
  end if;
  if p_op='template_create' and d?'kategori' and section_id is not null and not exists(select 1 from public.task_categories where org_unit_id=section_id and is_active and lower(name)=lower(btrim(d->>'kategori'))) then d:=d-'kategori';end if;
  select key into field from (select x.value as key,x.n from jsonb_array_elements_text(spec->'required') with ordinality x(value,n)) required where coalesce(btrim(d->>key),'')='' order by n limit 1;
  if p_op='template_create' then
   select key into field from unnest(array['judul','seksi','kategori','frekuensi','hari','mulai','tenggat']) with ordinality x(key,n) where coalesce(btrim(d->>key),'')='' order by n limit 1;
  end if;
  if p_op='task_update' and d='{}'::jsonb then field:='update';end if;
  if p_op='task_create' and field is null and section_id is null then field:='seksi';end if;
  if p_op='task_deadline' and actor_level=2 and coalesce(d->>'alasan','')='' then field:='alasan';end if;
  if p_op='task_review' and lower(d->>'keputusan')='revisi' and coalesce(d->>'komentar','')='' then field:='komentar';end if;
  if p_op like 'template_%' then
   if d?'frekuensi' and d->>'frekuensi' not in ('weekly','monthly') then field:='frekuensi';d:=d-'frekuensi';end if;
   for value in select key from jsonb_each_text(d) where key in ('hari','mulai','tenggat') loop
    if d->>value !~ '^[0-9]+$' then field:=value;d:=d-value;exit;end if;
   end loop;
   if d?'hari' and ((d->>'hari')::integer<1 or (d->>'hari')::integer>case when d->>'frekuensi'='weekly' then 7 else 31 end) then d:=d-'hari';field:='hari';end if;
   if d?'mulai' and (d->>'mulai')::integer not between 0 and 365 then d:=d-'mulai';field:='mulai';end if;
   if d?'tenggat' and ((d->>'tenggat')::integer not between 1 and 366 or (d?'mulai' and (d->>'tenggat')::integer<=(d->>'mulai')::integer)) then d:=d-'tenggat';field:='tenggat';end if;
  end if;
 end guided;
 if result is null then
  if field='seksi' then
   select coalesce(jsonb_agg(jsonb_build_object('label',o.name,'value',o.id::text) order by o.id),'[]') into options from public.org_units o where o.type='section' and public.can_manage_org_unit(o.id);
  elsif field='kategori' and section_id is not null then
   select coalesce(jsonb_agg(jsonb_build_object('label',c.name,'value',c.name) order by c.name),'[]') into options from public.task_categories c where c.org_unit_id=section_id and c.is_active;
  elsif field='frekuensi' then options:='[{"label":"Mingguan","value":"weekly"},{"label":"Bulanan","value":"monthly"}]';end if;
  question:=coalesce(question,case field
   when 'judul' then 'Apa judul tugasnya? Balas dengan judul saja.' when 'nama' then 'Apa nama yang ingin digunakan?'
   when 'pic' then 'Siapa PIC tujuannya? Sebutkan nama atau email.' when 'alasan' then 'Apa alasan pemindahan atau perubahan ini?'
   when 'seksi' then 'Tugas ini untuk seksi mana? Sebutkan nama seksi atau pilih nomor di bawah.'
   when 'kategori' then case when jsonb_array_length(options)=0 then 'Belum ada kategori aktif pada seksi ini. Sebutkan kategori yang sudah tersedia, atau buat kategori melalui halaman Kategori Tasks.' else 'Kategori tugasnya yang mana? Pilih nomor atau sebutkan namanya.' end
   when 'frekuensi' then 'Tugas ini berulang mingguan atau bulanan?'
   when 'hari' then case when d->>'frekuensi'='weekly' then 'Setiap hari apa? Misalnya “setiap Senin”.' else 'Setiap tanggal berapa dalam sebulan? Misalnya “tanggal 5”.' end
   when 'mulai' then case when p_op like 'template_%' then 'Mulai berapa hari setelah jadwal? Misalnya “hari yang sama” atau “satu hari setelah jadwal”.' else 'Kapan mulai? Misalnya “besok jam 8 pagi”.' end
   when 'tenggat' then case when p_op like 'template_%' then 'Tenggat berapa hari setelah jadwal? Misalnya “dua hari setelah jadwal”.' else 'Kapan tenggatnya? Misalnya “lusa jam 4 sore”.' end
   when 'update' then 'Bagian mana yang ingin diubah? Misalnya “ganti PIC-nya menjadi Nata”, “ganti judul jadi ...”, atau prioritas/tenggat.'
   when 'progres' then 'Berapa persen progresnya sekarang?' when 'komentar' then 'Apa isi komentar atau alasan revisinya?'
   when 'deskripsi' then 'Apa deskripsi yang ingin dicatat?' when 'penerima' then 'Siapa yang dimintai bantuan? Sebutkan nama atau email.'
   else 'Mohon lengkapi '||coalesce(spec->'fields'->>field,field)||'.' end);
  if field is not null and jsonb_array_length(options)>0 then select question||E'\n'||string_agg(x.n||'. '||(x.value->>'label'),E'\n' order by x.n) into question from jsonb_array_elements(options) with ordinality x(value,n);end if;
  result:=jsonb_build_object('ok',true,'data',d,'field',field,'question',question,'options',options);
 end if;
 perform set_config('role',old_role,true);perform set_config('request.jwt.claims',coalesce(old_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 return result;
end $$;
revoke all on function public.atm_ai_guided_fields(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.atm_ai_guided_fields(uuid,text,jsonb,text) to service_role;
