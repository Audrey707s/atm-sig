begin;
create or replace function public.wa_operation_catalog() returns jsonb language sql immutable security invoker set search_path='' as $catalog$ select $json${"task_create": {"label": "Buat tugas", "entity": "tasks", "minimumRole": 2, "fields": {"judul": "Judul tugas", "mulai": "YYYY-MM-DD HH:MM (WIB)", "tenggat": "YYYY-MM-DD HH:MM (WIB)", "prioritas": "rendah / sedang / tinggi", "pic": "SAYA atau nama atau email PIC (opsional)", "seksi": "ID atau nama seksi (opsional)", "kategori": "nama kategori (opsional)", "evidence": "JSON daftar syarat bukti (opsional)", "wbs": "JSON daftar WBS (opsional)"}, "required": ["judul", "mulai", "tenggat"], "task": false}, "task_update": {"label": "Ubah tugas", "entity": "tasks", "minimumRole": 3, "fields": {"judul": "Judul baru (opsional)", "prioritas": "rendah / sedang / tinggi (opsional)", "mulai": "YYYY-MM-DD HH:MM WIB (opsional)", "tenggat": "YYYY-MM-DD HH:MM WIB (opsional)"}, "required": [], "task": true}, "task_delete": {"label": "Hapus tugas beserta data terkait", "entity": "tasks", "minimumRole": 3, "fields": {}, "required": [], "task": true}, "task_duplicate": {"label": "Duplikasi tugas", "entity": "tasks", "minimumRole": 2, "fields": {"judul": "Judul salinan", "mulai": "YYYY-MM-DD HH:MM WIB", "tenggat": "YYYY-MM-DD HH:MM WIB", "pic": "SAYA atau nama atau email PIC (opsional)"}, "required": ["judul", "mulai", "tenggat"], "task": true}, "task_status": {"label": "Ubah status", "entity": "tasks", "minimumRole": 2, "fields": {"status": "To do / In progress / Blocked / Review / Done"}, "required": ["status"], "task": true}, "task_review": {"label": "Putuskan review", "entity": "tasks", "minimumRole": 2, "fields": {"keputusan": "setuju / revisi", "komentar": "Wajib jika revisi"}, "required": ["keputusan"], "task": true}, "task_comment": {"label": "Tambah komentar", "entity": "tasks", "minimumRole": 2, "fields": {"komentar": "Isi komentar"}, "required": ["komentar"], "task": true}, "task_deadline": {"label": "Ubah/ajukan tenggat", "entity": "tasks", "minimumRole": 2, "fields": {"tenggat": "YYYY-MM-DD HH:MM WIB", "alasan": "Alasan perubahan (wajib untuk PIC)"}, "required": ["tenggat"], "task": true}, "task_reassign": {"label": "Pindahkan PIC", "entity": "tasks", "minimumRole": 3, "fields": {"pic": "Nama atau nama atau email PIC tujuan", "alasan": "Alasan pemindahan"}, "required": ["pic", "alasan"], "task": true}, "wbs_add": {"label": "Tambah WBS", "entity": "wbs", "minimumRole": 2, "fields": {"judul": "Judul WBS", "bobot": "Angka 1–100", "induk": "Judul WBS induk (opsional)"}, "required": ["judul", "bobot"], "task": true}, "wbs_toggle": {"label": "Perbarui WBS", "entity": "wbs", "minimumRole": 2, "fields": {"selesai": "ya / tidak"}, "required": ["selesai"], "task": false}, "support_add": {"label": "Minta support", "entity": "supports", "minimumRole": 2, "fields": {"penerima": "Nama atau nama atau email user yang dimintai bantuan", "deskripsi": "Kebutuhan support"}, "required": ["penerima", "deskripsi"], "task": true}, "support_finish": {"label": "Tandai support diberikan", "entity": "supports", "minimumRole": 2, "fields": {}, "required": [], "task": false}, "evidence_requirement": {"label": "Tambah syarat bukti", "entity": "requirements", "minimumRole": 3, "fields": {"deskripsi": "Deskripsi syarat", "wajib": "ya / tidak"}, "required": ["deskripsi"], "task": true}, "evidence_link": {"label": "Tambahkan bukti tautan", "entity": "requirements", "minimumRole": 2, "fields": {"tautan": "URL HTTPS bukti"}, "required": ["tautan"], "task": false}, "deadline_decide": {"label": "Putuskan permohonan tenggat", "entity": "approvals", "minimumRole": 4, "fields": {"keputusan": "setuju / tolak"}, "required": ["keputusan"], "task": false}, "category_create": {"label": "Buat kategori", "entity": "categories", "minimumRole": 3, "fields": {"nama": "Nama kategori", "seksi": "ID atau nama seksi", "aktif": "ya / tidak (opsional)"}, "required": ["nama", "seksi"], "task": false}, "category_update": {"label": "Ubah kategori", "entity": "categories", "minimumRole": 3, "fields": {"nama": "Nama baru (opsional)", "aktif": "ya / tidak (opsional)"}, "required": [], "task": false}, "category_delete": {"label": "Hapus kategori", "entity": "categories", "minimumRole": 3, "fields": {}, "required": [], "task": false}, "template_create": {"label": "Buat tugas berulang", "entity": "templates", "minimumRole": 2, "fields": {"nama": "Nama jadwal", "judul": "Judul tugas", "kategori": "Nama kategori aktif", "seksi": "ID atau nama seksi", "pic": "SAYA atau nama atau email PIC (opsional)", "prioritas": "rendah / sedang / tinggi (opsional)", "frekuensi": "weekly / monthly", "hari": "1–7 mingguan atau 1–31 bulanan", "mulai": "Offset hari mulai, 0–365", "tenggat": "Offset hari tenggat, 1–366"}, "required": ["nama", "judul", "kategori", "seksi", "frekuensi", "hari", "mulai", "tenggat"], "task": false}, "template_update": {"label": "Ubah tugas berulang", "entity": "templates", "minimumRole": 2, "fields": {"nama": "Nama jadwal (opsional)", "judul": "Judul tugas (opsional)", "kategori": "Nama kategori aktif (opsional)", "seksi": "ID atau nama seksi (opsional)", "pic": "SAYA atau nama atau email PIC (opsional) (opsional)", "prioritas": "rendah / sedang / tinggi (opsional) (opsional)", "frekuensi": "weekly / monthly (opsional)", "hari": "1–7 mingguan atau 1–31 bulanan (opsional)", "mulai": "Offset hari mulai, 0–365 (opsional)", "tenggat": "Offset hari tenggat, 1–366 (opsional)"}, "required": [], "task": false}, "template_toggle": {"label": "Aktifkan/nonaktifkan jadwal", "entity": "templates", "minimumRole": 2, "fields": {"aktif": "ya / tidak"}, "required": ["aktif"], "task": false}, "template_delete": {"label": "Hapus tugas berulang", "entity": "templates", "minimumRole": 2, "fields": {}, "required": [], "task": false}, "org_create": {"label": "Tambah organisasi", "entity": "organizations", "minimumRole": 6, "fields": {"nama": "Nama organisasi", "tipe": "department / unit / section", "induk": "ID induk (kosong untuk department)"}, "required": ["nama", "tipe"], "task": false}, "org_update": {"label": "Ubah organisasi", "entity": "organizations", "minimumRole": 6, "fields": {"nama": "Nama baru (opsional)", "tipe": "department / unit / section (opsional)", "induk": "ID induk (opsional)"}, "required": [], "task": false}, "org_delete": {"label": "Hapus organisasi", "entity": "organizations", "minimumRole": 6, "fields": {}, "required": [], "task": false}, "notification_read": {"label": "Tandai notifikasi dibaca", "entity": "notifications", "minimumRole": 1, "fields": {}, "required": [], "task": false}, "notification_all": {"label": "Tandai semua notifikasi dibaca", "entity": "notifications", "minimumRole": 1, "fields": {}, "required": [], "task": false}, "reminder_response": {"label": "Tanggapi reminder", "entity": "reminders", "minimumRole": 2, "fields": {"tanggapan": "progres / support / tenggat"}, "required": ["tanggapan"], "task": false}, "profile_name": {"label": "Ubah nama profil", "entity": "profile", "minimumRole": 1, "fields": {"nama": "Nama baru"}, "required": ["nama"], "task": false}, "task_progress": {"label": "Ubah progres", "entity": "tasks", "minimumRole": 2, "fields": {"progres": "Persentase bilangan bulat 0–100"}, "required": ["progres"], "task": true}}$json$::jsonb $catalog$;
create or replace function public.wa_apply_operation(p_actor uuid,p_op text,p_target text,p_data jsonb,p_validate boolean default false,p_version text default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare spec jsonb; k text; v_level integer; v_old_role text:=current_user; v_old_claims text;v_old_sub text;
 v_before jsonb; v_hash text; v_result jsonb; v_id uuid;v_task uuid;v_owner uuid;v_reviewer uuid;v_org integer;v_cat uuid;v_user public.users%rowtype;
 v_row public.tasks%rowtype;v_template public.task_templates%rowtype;v_matches uuid[];v_changed integer;v_active boolean;v_error text;
 v_start timestamptz;v_due timestamptz;v_evidence jsonb;v_wbs jsonb;v_parent uuid;v_obj text;
begin
 spec:=public.wa_operation_catalog()->p_op;if spec is null then return jsonb_build_object('ok',false,'error','Aksi tidak tersedia');end if;
 select r.level into v_level from public.users u join public.roles r on r.id=u.role_id where u.id=p_actor and u.status='aktif';
 if v_level is null or v_level<(spec->>'minimumRole')::integer then return jsonb_build_object('ok',false,'error','Hak akses tidak mencukupi untuk aksi ini');end if;
 for k in select jsonb_object_keys(p_data) loop if not (spec->'fields')?k then return jsonb_build_object('ok',false,'error','Field tidak dikenal: '||k);end if;end loop;
 for k in select jsonb_array_elements_text(spec->'required') loop if coalesce(btrim(p_data->>k),'')='' then return jsonb_build_object('ok',false,'error','Field wajib: '||k);end if;end loop;
 if p_data='{}'::jsonb and exists(select 1 from jsonb_object_keys(spec->'fields')) then return jsonb_build_object('ok',false,'error','Isi minimal satu field');end if;
 v_old_claims:=current_setting('request.jwt.claims',true);v_old_sub:=current_setting('request.jwt.claim.sub',true);
 begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  perform set_config('role','authenticated',true);
  if p_data?'seksi' and p_data->>'seksi' !~ '^[0-9]+$' then
   select min(id) into v_org from public.org_units where type='section' and lower(name)=lower(btrim(p_data->>'seksi')) having count(*)=1;
   if v_org is null then raise exception 'Nama seksi belum cocok dengan satu seksi. Sebutkan nama lengkap seksi dari Organizations';end if;
   p_data:=p_data||jsonb_build_object('seksi',v_org::text);
  end if;
  if (spec->>'task')::boolean or (spec->>'entity'='tasks' and p_target is not null) then
   v_task:=p_target::uuid;select * into v_row from public.tasks where id=v_task for update;
   if not found then raise exception 'Tugas tidak ditemukan atau berada di luar akses Anda';end if;v_before:=to_jsonb(v_row);
  elsif p_target is not null then
   case spec->>'entity'
    when 'wbs' then select to_jsonb(x),x.task_id into v_before,v_task from public.wbs_items x where id=p_target::uuid for update;
    when 'supports' then select to_jsonb(x),x.task_id into v_before,v_task from public.task_supports x where id=p_target::uuid for update;
    when 'requirements' then select to_jsonb(x),x.task_id into v_before,v_task from public.evidence_requirements x where id=p_target::uuid;
    when 'approvals' then select to_jsonb(x),x.task_id into v_before,v_task from public.deadline_change_requests x where id=p_target::uuid;
    when 'categories' then select to_jsonb(x) into v_before from public.task_categories x where id=p_target::uuid for update;
    when 'templates' then select to_jsonb(x) into v_before from public.task_templates x where id=p_target::uuid for update;
    when 'organizations' then select to_jsonb(x) into v_before from public.org_units x where id=p_target::integer for update;
    when 'notifications' then select to_jsonb(x),x.task_id into v_before,v_task from public.notifications x where id=p_target::uuid and user_id=p_actor for update;
    when 'reminders' then select to_jsonb(x),x.task_id into v_before,v_task from public.task_reminders x where id=p_target::uuid for update;
    else null;
   end case;
   if v_before is null then raise exception 'Data tidak ditemukan atau berada di luar akses Anda';end if;
  end if;
  v_hash:=case when v_before is null then null else md5(v_before::text) end;
  if p_version is not null and v_hash is distinct from p_version then raise exception 'Data berubah sejak pratinjau. Ulangi aksi untuk memeriksa versi terbaru';end if;
  if p_data?'aktif' then
   if lower(p_data->>'aktif') not in ('ya','tidak','true','false') then raise exception 'Aktif harus ya atau tidak';end if;
   v_active:=lower(p_data->>'aktif') in ('ya','true');
  end if;
  if p_op in ('task_create','task_duplicate','template_create','template_update') then
   if p_op='template_update' then v_owner:=(v_before->>'owner_id')::uuid;else v_owner:=p_actor;end if;
   if p_data?'pic' and lower(p_data->>'pic')<>'saya' then
    select array_agg(id) into v_matches from public.users where (lower(email)=lower(btrim(p_data->>'pic')) or lower(name)=lower(btrim(p_data->>'pic'))) and status='aktif';
    if coalesce(cardinality(v_matches),0)<>1 then raise exception 'Nama atau email PIC harus cocok dengan satu akun aktif';end if;v_owner:=v_matches[1];
   elsif lower(p_data->>'pic')='saya' then v_owner:=p_actor;end if;
   select * into v_user from public.users where id=v_owner and status='aktif';
   if not found then raise exception 'PIC tidak aktif';end if;
   if (select level from public.roles where id=v_user.role_id)<2 then raise exception 'PIC tidak dapat menerima task';end if;
   if v_level=2 and v_owner<>p_actor then raise exception 'PIC hanya dapat membuat tugas untuk dirinya sendiri';end if;
   v_reviewer:=case when (select level from public.roles where id=v_user.role_id)>=5 then null else v_user.supervisor_id end;
   if nullif(btrim(p_data->>'seksi'),'') is null then v_org:=coalesce((v_before->>'org_unit_id')::integer,v_user.org_unit_id);
   elsif btrim(p_data->>'seksi') ~ '^[0-9]+$' then v_org:=(p_data->>'seksi')::integer;
   else
    select min(id) into v_org from public.org_units where type='section' and lower(name)=lower(btrim(p_data->>'seksi'))
     having count(*)=1;
    if v_org is null then raise exception 'Nama seksi tidak cocok secara unik. Pilih ID dari ORGANISASI';end if;
   end if;
   if not exists(select 1 from public.org_units where id=v_org and type='section') then raise exception 'Isi seksi dengan ID section. Lihat ORGANISASI untuk daftar ID';end if;
   if p_data?'kategori' then
    select array_agg(id) into v_matches from public.task_categories where org_unit_id=v_org and lower(name)=lower(p_data->>'kategori') and is_active;
    if coalesce(cardinality(v_matches),0)<>1 then raise exception 'Nama kategori harus cocok dengan satu kategori aktif pada seksi';end if;v_cat:=v_matches[1];
   elsif p_op='template_update' then v_cat:=(v_before->>'category_id')::uuid;end if;
  end if;
  case p_op
   when 'task_create','task_duplicate' then
    v_start:=(p_data->>'mulai')::timestamp at time zone 'Asia/Jakarta';v_due:=(p_data->>'tenggat')::timestamp at time zone 'Asia/Jakarta';
    v_evidence:=coalesce((p_data->>'evidence')::jsonb,'[]'::jsonb);v_wbs:=coalesce((p_data->>'wbs')::jsonb,'[]'::jsonb);
    if p_op='task_duplicate' and not p_data?'evidence' then select coalesce(jsonb_agg(jsonb_build_object('description',description,'mandatory',mandatory)),'[]') into v_evidence from public.evidence_requirements where task_id=v_task;end if;
    v_id:=public.create_task_bundle_r03(v_owner,v_reviewer,v_org,null,p_data->>'judul',coalesce(p_data->>'prioritas',v_row.priority::text,'sedang')::public.task_priority,v_start,v_due,v_cat,v_evidence,v_wbs,'[]');v_task:=v_id;
   when 'task_update' then
    if p_data?'judul' and length(btrim(p_data->>'judul')) not between 1 and 200 then raise exception 'Judul maksimal 200 karakter';end if;
    update public.tasks set title=coalesce(p_data->>'judul',title),priority=coalesce((p_data->>'prioritas')::public.task_priority,priority),
     start_date=coalesce((p_data->>'mulai')::timestamp at time zone 'Asia/Jakarta',start_date),due_date=coalesce((p_data->>'tenggat')::timestamp at time zone 'Asia/Jakarta',due_date) where id=v_task returning id into v_id;
   when 'task_delete' then delete from public.tasks where id=v_task returning id into v_id;
   when 'task_progress' then
    if v_row.owner_id<>p_actor then raise exception 'Hanya PIC tugas yang dapat memperbarui progres';end if;
    if coalesce(p_data->>'progres','') !~ '^(100|[1-9]?[0-9])$' then raise exception 'Progres harus bilangan bulat 0–100';end if;
    if v_row.status not in ('To do','In progress','Revisi') then raise exception 'Progres hanya dapat diubah pada tugas aktif; status review atau selesai mengikuti alur persetujuan';end if;
    if exists(select 1 from public.wbs_items where task_id=v_task) then raise exception 'Progres tugas ini dihitung dari WBS. Perbarui penyelesaian item WBS agar progres tetap konsisten';end if;
    update public.tasks set progress_pct=(p_data->>'progres')::integer where id=v_task and owner_id=p_actor returning id into v_id;
   when 'task_status' then
    if p_data->>'status'='Revisi' then raise exception 'Gunakan TINJAU dan isi komentar untuk meminta revisi';end if;
    update public.tasks set status=(p_data->>'status')::public.task_status where id=v_task returning id into v_id;
   when 'task_review' then
    if lower(p_data->>'keputusan') not in ('setuju','revisi') then raise exception 'Keputusan harus setuju atau revisi';end if;
    v_id:=public.review_task(v_task,case when lower(p_data->>'keputusan')='setuju' then 'Done' else 'Revisi' end::public.task_status,nullif(btrim(p_data->>'komentar'),''));
   when 'task_comment' then
    if length(btrim(p_data->>'komentar')) not between 1 and 2000 then raise exception 'Komentar wajib diisi, maksimal 2000 karakter melalui chat';end if;
    insert into public.task_comments(task_id,user_id,body) values(v_task,p_actor,btrim(p_data->>'komentar')) returning id into v_id;
   when 'task_deadline' then
    v_due:=(p_data->>'tenggat')::timestamp at time zone 'Asia/Jakarta';
    if v_due<=now() then raise exception 'Tenggat baru harus di masa depan';end if;
    if v_level>=3 then update public.tasks set due_date=v_due where id=v_task returning id into v_id;
    else
     if v_row.owner_id<>p_actor or coalesce(length(btrim(p_data->>'alasan')),0) not between 1 and 1000 then raise exception 'PIC wajib mengisi alasan perubahan tenggat';end if;
     insert into public.deadline_change_requests(task_id,requested_by,old_due_date,new_due_date,reason) values(v_task,p_actor,v_row.due_date,v_due,p_data->>'alasan') returning id into v_id;
    end if;
   when 'task_reassign' then
    select array_agg(id) into v_matches from public.users where (lower(email)=lower(btrim(p_data->>'pic')) or lower(name)=lower(btrim(p_data->>'pic'))) and status='aktif';if coalesce(cardinality(v_matches),0)<>1 then raise exception 'Nama atau email PIC tujuan tidak cocok';end if;
    v_id:=public.reassign_task(v_task,v_matches[1],p_data->>'alasan');
   when 'wbs_add' then
    if p_data?'induk' then select array_agg(id) into v_matches from public.wbs_items where task_id=v_task and title=p_data->>'induk';if coalesce(cardinality(v_matches),0)<>1 then raise exception 'Judul induk WBS harus unik pada tugas';end if;v_parent:=v_matches[1];end if;
    v_id:=public.add_wbs_item_r03(v_task,p_data->>'judul',(p_data->>'bobot')::numeric,v_parent);
   when 'wbs_toggle' then
    if lower(p_data->>'selesai') not in ('ya','tidak') then raise exception 'Selesai harus ya atau tidak';end if;
    perform public.toggle_wbs_item_r03(v_task,p_target::uuid,lower(p_data->>'selesai')='ya');v_id:=p_target::uuid;
   when 'support_add' then
    if v_row.owner_id<>p_actor then raise exception 'Hanya PIC yang dapat meminta support';end if;
    select array_agg(id) into v_matches from public.users where (lower(email)=lower(btrim(p_data->>'penerima')) or lower(name)=lower(btrim(p_data->>'penerima'))) and status='aktif';
    if coalesce(cardinality(v_matches),0)<>1 or v_matches[1]=p_actor then raise exception 'Penerima harus akun aktif lain';end if;
    if length(btrim(p_data->>'deskripsi')) not between 1 and 1000 then raise exception 'Deskripsi support wajib, maksimal 1000 karakter';end if;
    insert into public.task_supports(task_id,needed_from_id,description,status) values(v_task,v_matches[1],p_data->>'deskripsi','diminta') returning id into v_id;
   when 'support_finish' then
    if (v_before->>'needed_from_id')::uuid<>p_actor then raise exception 'Hanya penerima support yang dapat menandai diberikan';end if;
    update public.task_supports set status='diberikan' where id=p_target::uuid and status='diminta' and needed_from_id=p_actor returning id into v_id;
   when 'evidence_requirement' then
    if length(btrim(p_data->>'deskripsi')) not between 1 and 200 then raise exception 'Deskripsi syarat maksimal 200 karakter';end if;
    if p_data?'wajib' and lower(p_data->>'wajib') not in ('ya','tidak') then raise exception 'Wajib harus ya atau tidak';end if;
    insert into public.evidence_requirements(task_id,description,mandatory) values(v_task,p_data->>'deskripsi',coalesce(lower(p_data->>'wajib')='ya',true)) returning id into v_id;
   when 'evidence_link' then
    if p_data->>'tautan' !~ '^https://[^[:space:]]+$' then raise exception 'Bukti harus berupa tautan HTTPS';end if;
    insert into public.task_evidence(requirement_id,uploader_id,file_or_link) values(p_target::uuid,p_actor,p_data->>'tautan') returning id into v_id;
   when 'deadline_decide' then
    if lower(p_data->>'keputusan') not in ('setuju','tolak') then raise exception 'Keputusan harus setuju atau tolak';end if;
    v_id:=public.decide_deadline_change(p_target::uuid,case when lower(p_data->>'keputusan')='setuju' then 'Disetujui' else 'Ditolak' end::public.deadline_request_status);
   when 'category_create' then
    if not exists(select 1 from public.org_units where id=(p_data->>'seksi')::integer and type='section') then raise exception 'Kategori wajib berada pada seksi';end if;
    if length(btrim(p_data->>'nama')) not between 1 and 80 then raise exception 'Nama kategori maksimal 80 karakter';end if;
    insert into public.task_categories(name,org_unit_id,is_active) values(p_data->>'nama',(p_data->>'seksi')::integer,coalesce(v_active,true)) returning id into v_id;
   when 'category_update' then
    update public.task_categories set name=coalesce(p_data->>'nama',name),is_active=coalesce(v_active,is_active) where id=p_target::uuid returning id into v_id;
   when 'category_delete' then delete from public.task_categories where id=p_target::uuid returning id into v_id;
   when 'template_create','template_update' then
    if p_op='template_create' then
     insert into public.task_templates(org_unit_id,category_id,name,title,priority,owner_id,reviewer_id,recurrence,recurrence_day,start_offset_days,due_offset_days,created_by)
      values(v_org,v_cat,p_data->>'nama',p_data->>'judul',coalesce(p_data->>'prioritas','sedang')::public.task_priority,v_owner,v_reviewer,p_data->>'frekuensi',(p_data->>'hari')::integer,(p_data->>'mulai')::integer,(p_data->>'tenggat')::integer,p_actor) returning id into v_id;
    else
     update public.task_templates set name=coalesce(p_data->>'nama',name),title=coalesce(p_data->>'judul',title),org_unit_id=v_org,category_id=v_cat,owner_id=v_owner,reviewer_id=v_reviewer,priority=coalesce((p_data->>'prioritas')::public.task_priority,priority),recurrence=coalesce(p_data->>'frekuensi',recurrence),recurrence_day=coalesce((p_data->>'hari')::integer,recurrence_day),start_offset_days=coalesce((p_data->>'mulai')::integer,start_offset_days),due_offset_days=coalesce((p_data->>'tenggat')::integer,due_offset_days) where id=p_target::uuid returning id into v_id;
    end if;
   when 'template_toggle' then update public.task_templates set is_active=v_active where id=p_target::uuid returning id into v_id;
   when 'template_delete' then delete from public.task_templates where id=p_target::uuid returning id into v_id;
   when 'org_create','org_update' then
    if p_op='org_create' then
     insert into public.org_units(name,type,parent_id) values(p_data->>'nama',(p_data->>'tipe')::public.org_unit_type,(p_data->>'induk')::integer) returning id::text into v_obj;
    else update public.org_units set name=coalesce(p_data->>'nama',name),type=coalesce((p_data->>'tipe')::public.org_unit_type,type),parent_id=case when p_data?'induk' then (p_data->>'induk')::integer when p_data->>'tipe'='department' then null else parent_id end where id=p_target::integer returning id::text into v_obj;end if;
   when 'org_delete' then delete from public.org_units where id=p_target::integer returning id::text into v_obj;
   when 'notification_read' then update public.notifications set read_at=coalesce(read_at,now()) where id=p_target::uuid and user_id=p_actor returning id into v_id;
   when 'notification_all' then update public.notifications set read_at=now() where user_id=p_actor and read_at is null;get diagnostics v_changed=row_count;v_obj:=v_changed::text;
   when 'reminder_response' then
    if lower(p_data->>'tanggapan') not in ('progres','support','tenggat') then raise exception 'Tanggapan harus progres, support, atau tenggat';end if;
    update public.task_reminders set response=case lower(p_data->>'tanggapan') when 'progres' then 'Masih on progress' when 'support' then 'Butuh support' else 'Ajukan perubahan deadline' end where id=p_target::uuid and response is null returning id into v_id;
   when 'profile_name' then if length(btrim(p_data->>'nama')) not between 2 and 100 then raise exception 'Nama harus 2–100 karakter';end if;perform public.update_my_profile(p_data->>'nama');v_id:=p_actor;
   else raise exception 'Aksi tidak tersedia';
  end case;
  if v_id is null and v_obj is null then raise exception 'Perubahan tidak tersimpan; data tidak ditemukan, sudah diproses, atau akses ditolak';end if;
  v_result:=jsonb_build_object('ok',true,'id',coalesce(v_id::text,v_obj),'taskId',v_task,'version',v_hash,'label',spec->>'label','subject',coalesce(p_data->>'judul',p_data->>'nama',v_before->>'title',v_before->>'name',v_before->>'description',spec->>'label'),'path',
   case when p_op='task_delete' then '/tasks' when spec->>'entity'='notifications' then '/notifications' when v_task is not null then '/tasks/'||v_task::text when spec->>'entity'='templates' then '/tasks/recurring' when spec->>'entity'='categories' then '/task-templates' when spec->>'entity'='organizations' then '/organizations' when spec->>'entity'='notifications' then '/notifications' else '/account' end);
  if p_validate then raise exception using errcode='PWA01',message='Validated preview',detail=v_result::text;end if;
 exception
  when sqlstate 'PWA01' then get stacked diagnostics v_error=PG_EXCEPTION_DETAIL;v_result:=v_error::jsonb;
  when raise_exception then v_result:=jsonb_build_object('ok',false,'error',SQLERRM);
  when insufficient_privilege then v_result:=jsonb_build_object('ok',false,'error','Akses ditolak oleh aturan ATM');
  when unique_violation then v_result:=jsonb_build_object('ok',false,'error','Data duplikat. Gunakan nama atau data lain');
  when foreign_key_violation then v_result:=jsonb_build_object('ok',false,'error','Data masih dipakai atau memiliki referensi yang tidak valid');
  when check_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or invalid_parameter_value or not_null_violation then v_result:=jsonb_build_object('ok',false,'error','Format atau nilai isian tidak valid. Periksa petunjuk form');
 end;
 perform set_config('role',v_old_role,true);
 if (v_result->>'ok')::boolean and not p_validate then insert into public.audit_logs(user_id,action,object,old_value,new_value) values(p_actor,'whatsapp_'||p_op,coalesce('tasks:'||v_task::text,(spec->>'entity')||':'||coalesce(p_target,v_result->>'id','all')),v_before::text,p_data::text);end if;
 perform set_config('request.jwt.claims',coalesce(v_old_claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(v_old_sub,''),true);
 return v_result;
end $$;
create or replace function public.wa_task_create_draft(p_actor uuid,p_previous jsonb,p_text text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare d jsonb:=coalesce(p_previous,'{}'); incoming jsonb; step text; field text; value text;
 owner_id uuid:=p_actor; owner_org integer; actor_org integer; actor_level integer; choices text;
begin
 if coalesce(d->>'judul','')='' then step:='judul';
 elsif coalesce(d->>'mulai','')='' then step:='mulai';
 elsif coalesce(d->>'tenggat','')='' then step:='tenggat';
 else step:='seksi';end if;
 if btrim(coalesce(p_text,''))<>'' then
  if p_text ~* '^\s*(judul|mulai|tenggat|pic|seksi|kategori|prioritas|evidence|wbs)\s*:' then incoming:=public.wa_parse_form(p_text);
  else incoming:=jsonb_build_object(step,btrim(p_text));end if;
  for field,value in select f.key,f.value from jsonb_each_text(incoming) f loop
   if not ((public.wa_operation_catalog()->'task_create'->'fields')?field) then
    return jsonb_build_object('data',d,'prompt','Field tidak dikenal: '||field||'. Kirim ulang dengan field yang tersedia.');end if;
   if field in ('mulai','tenggat') then
    value:=public.wa_natural_timestamp(value);
    if value is null or value !~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$' then
     return jsonb_build_object('data',d,'prompt','Kapan '||field||'? Balas misalnya “besok jam 8 pagi” atau '||to_char(now() at time zone 'Asia/Jakarta','YYYY-MM-DD')||' 08:00.');end if;
    begin perform value::timestamp;exception when invalid_datetime_format or datetime_field_overflow then
     return jsonb_build_object('data',d,'prompt','Tanggal '||field||' tidak valid. Kirim ulang tanggal yang benar.');end;
    incoming:=incoming||jsonb_build_object(field,replace(value,'T',' '));
   end if;
  end loop;
  d:=d||incoming;
 end if;
 if coalesce(d->>'judul','')='' then
  return jsonb_build_object('data',d,'prompt',E'✍️ *Buat tugas — 1/3*\nApa judul tugasnya? Balas judul saja.\n\nKirim field sekaligus juga boleh: judul, mulai, tenggat (satu field: isi per baris).\nKetik BATAL untuk membatalkan.');
 elsif length(d->>'judul')>200 then return jsonb_build_object('data',d-'judul','prompt','Judul maksimal 200 karakter. Kirim judul yang lebih singkat.');
 elsif coalesce(d->>'mulai','')='' then
  return jsonb_build_object('data',d,'prompt',E'📅 *Buat tugas — 2/3*\nKapan mulai? Balas misalnya “besok jam 8 pagi” atau tanggal dan jam WIB: '||to_char(now() at time zone 'Asia/Jakarta','YYYY-MM-DD')||' 08:00');
 elsif coalesce(d->>'tenggat','')='' then
  return jsonb_build_object('data',d,'prompt',E'⏰ *Buat tugas — 3/3*\nKapan tenggatnya? Balas misalnya “lusa jam 4 sore” atau tanggal dan jam WIB. Harus setelah tanggal mulai.');
 end if;
 if (d->>'tenggat')::timestamp<=(d->>'mulai')::timestamp then
  return jsonb_build_object('data',d-'tenggat','prompt','Tenggat harus setelah tanggal mulai. Kirim tenggat baru dengan format YYYY-MM-DD HH:MM.');end if;
 if d?'pic' and lower(d->>'pic')<>'saya' then select (array_agg(id))[1] into owner_id from public.users where (lower(email)=lower(btrim(d->>'pic')) or lower(name)=lower(btrim(d->>'pic'))) and status='aktif' having count(*)=1; if owner_id is null then return jsonb_build_object('data',d-'pic','prompt','Nama PIC belum cocok dengan satu akun aktif. Sebutkan nama lengkap atau email PIC.');end if;end if;
 select org_unit_id into owner_org from public.users where id=owner_id;
 if coalesce(d->>'seksi','')='' and not exists(select 1 from public.org_units where id=owner_org and type='section') then
  select u.org_unit_id,r.level into actor_org,actor_level from public.users u join public.roles r on r.id=u.role_id where u.id=p_actor and u.status='aktif';
  select string_agg(id||' — '||name,E'\n' order by id) into choices from
   (select id,name from public.org_units where type='section' and (actor_level>=5 or id=actor_org or (actor_level=4 and parent_id=actor_org)) order by id limit 20) sections;
  return jsonb_build_object('data',d,'prompt',E'🏢 Pilih seksi untuk tugas ini. Balas ID atau nama seksi:\n'||coalesce(choices,'Tidak ada seksi dalam cakupan Anda.')||E'\n\nPIC tetap akun Anda jika tidak diisi. Pilihan tambahan dapat dikirim sebagai pic: email, kategori: nama, atau prioritas: rendah/sedang/tinggi.\n🔗 https://atm-sig.vercel.app/organizations');
 end if;
 return jsonb_build_object('data',d);
end $$;
create or replace function public.atm_ai_turn(p_actor uuid,p_channel text,p_kind text,p_payload jsonb default '{}',p_token text default null,p_phone text default null,p_receipt text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=p_actor; lv integer; link_time timestamptz; s public.atm_ai_sessions%rowtype; r jsonb; spec jsonb; target text:=nullif(p_payload->>'target',''); candidates jsonb; tok uuid; msg text; lim integer; ins text; op text:=p_payload->>'operation'; f text; inserted text; history jsonb; choice integer; selected text; page_no integer; more boolean;
begin
 if p_channel not in ('web','whatsapp') or octet_length(p_payload::text)>16000 then raise exception 'Invalid request';end if;
 if p_channel='whatsapp' then
  if p_phone !~ '^[1-9][0-9]{7,14}$' or p_receipt !~ '^[a-f0-9]{64}$' then raise exception 'Invalid message';end if;
  select l.user_id,l.linked_at into actor,link_time from public.whatsapp_links l join public.users u on u.id=l.user_id and u.status='aktif' where l.phone=p_phone and l.notifications_enabled and l.linked_at is not null for update of l;
  if actor is distinct from p_actor or link_time is distinct from nullif(p_payload->>'linkGeneration','')::timestamptz then return jsonb_build_object('ok',false,'message','Koneksi berubah. Kirim ulang pesan dari nomor terhubung.');end if;
  if actor is null then return jsonb_build_object('ok',false,'message','Hubungkan akun aktif melalui Profil ATM, lalu ketik MULAI.');end if;
 end if;
 select ro.level into lv from public.users u join public.roles ro on ro.id=u.role_id where u.id=actor and u.status='aktif';
 if lv is null then return jsonb_build_object('ok',false,'message','Akun tidak aktif atau sesi telah berakhir.');end if;
 perform pg_advisory_xact_lock(hashtextextended('atm-ai:'||actor::text,0));
 if p_channel='whatsapp' then
  if exists(select 1 from public.whatsapp_receipts where id=p_receipt) then return jsonb_build_object('duplicate',true);end if;
  insert into public.whatsapp_receipts(id,sender) values(p_receipt,p_phone) on conflict do nothing returning id into inserted;
  if inserted is null then return jsonb_build_object('duplicate',true);end if;
 end if;
 if p_kind='reserve' then
  insert into public.atm_ai_limits(user_id,window_start,requests) values(actor,date_trunc('minute',now()),1)
   on conflict(user_id) do update set window_start=case when atm_ai_limits.window_start<date_trunc('minute',now()) then date_trunc('minute',now()) else atm_ai_limits.window_start end,requests=case when atm_ai_limits.window_start<date_trunc('minute',now()) then 1 else atm_ai_limits.requests+1 end returning requests into lim;
  if lim<=8 and length(coalesce(p_payload->>'message','')) between 1 and 4000 then
   select case when context_at>now()-interval '15 minutes' then case when p_payload->>'contextChannel'='whatsapp' then context_whatsapp else context_web end else '[]'::jsonb end into history from public.atm_ai_limits where user_id=actor;
   history:=coalesce(history,'[]')||jsonb_build_array(left(p_payload->>'message',3000));
   select coalesce(jsonb_agg(value order by n),'[]') into history from jsonb_array_elements(history) with ordinality x(value,n) where n>jsonb_array_length(history)-8;
   update public.atm_ai_limits set context_web=case when p_payload->>'contextChannel'='whatsapp' then context_web else history end,context_whatsapp=case when p_payload->>'contextChannel'='whatsapp' then history else context_whatsapp end,context_at=now() where user_id=actor;
  end if;
  return jsonb_build_object('ok',lim<=8,'history',coalesce(history,'[]'));
 end if;
 if p_channel='whatsapp' and p_kind<>'reserve' then
  delete from public.whatsapp_action_sessions where user_id=actor;
  delete from public.whatsapp_chat_sessions where user_id=actor;
  delete from public.whatsapp_confirmations where user_id=actor;
 end if;
 if p_kind='select' then
  select * into s from public.atm_ai_sessions where user_id=actor and channel=p_channel for update;
  choice:=case when p_payload->>'choice' ~ '^[1-9][0-9]?$' then (p_payload->>'choice')::integer else 0 end;
  if s.token is null and s.expires_at>now() and jsonb_typeof(s.payload->'choices')='array'
   and (p_channel='web' or (s.phone=p_phone and s.linked_at=link_time)) and choice between 1 and jsonb_array_length(s.payload->'choices') then
   selected:=s.payload->'choices'->(choice-1)->>'id';
   p_payload:=jsonb_build_object('operation',s.operation,'target',selected,'data',s.payload->'data');
   op:=s.operation;target:=selected;p_kind:='propose';
  else p_kind:='reply';p_payload:=jsonb_build_object('message','Pilihan tidak valid atau kedaluwarsa. Kirim ulang judul/kata kunci tugas dan perubahan yang diinginkan.');end if;
 end if;
 if p_kind in ('confirm','cancel') then update public.atm_ai_limits set context_web=case when p_channel='web' then '[]'::jsonb else context_web end,context_whatsapp=case when p_channel='whatsapp' then '[]'::jsonb else context_whatsapp end where user_id=actor;end if;
 if p_kind='confirm' then
  select * into s from public.atm_ai_sessions where user_id=actor and channel=p_channel for update;
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel;
  if s.token is null or s.expires_at<=now() or (p_channel='web' and s.token::text is distinct from p_token) or (p_channel='whatsapp' and (s.phone is distinct from p_phone or s.linked_at is distinct from link_time)) then
   r:=jsonb_build_object('ok',false,'message','Konfirmasi tidak valid atau kedaluwarsa. Kirim ulang permintaan.');
  else
   r:=public.wa_safe_operation(actor,s.operation,s.target,s.payload,false,s.version);
   msg:=case when (r->>'ok')::boolean then 'Berhasil: '||(r->>'label')||' — '||(r->>'subject') else coalesce(r->>'error','Perubahan tidak disimpan.') end;
   if (r->>'ok')::boolean then
    insert into public.audit_logs(user_id,action,object,new_value) values(actor,'ai_'||p_channel||'_'||s.operation,coalesce(r->>'id','operation'),'Confirmed by user');
   end if;
   r:=r||jsonb_build_object('message',msg,'changed',coalesce((r->>'ok')::boolean,false));
  end if;
 elsif p_kind='cancel' then
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel;
  r:=jsonb_build_object('ok',true,'message','Perubahan yang belum disimpan dibatalkan.');
 elsif p_kind='propose' then
  -- Every new intent invalidates the older preview, including invalid replacements.
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel;
  spec:=public.wa_operation_catalog()->op;
  if spec is null or lv<(spec->>'minimumRole')::integer then r:=jsonb_build_object('ok',false,'message','Permintaan berada di luar hak akses Anda.');
  else
   candidates:=null;
   if target is not null then
    if (spec->>'task')::boolean then candidates:=public.atm_ai_tasks(actor,target,'list');
    elsif spec->>'entity' in ('wbs','supports','requirements','categories','templates','organizations','notifications','reminders','approvals') then
     candidates:=public.atm_ai_named_records(actor,spec->>'entity',target);
    end if;
    if candidates is not null then
     -- Prefer an explicit ID/exact title; otherwise require a unique substring match.
     select coalesce(jsonb_agg(value),'[]') into history from jsonb_array_elements(candidates) where value->>'id'=target;
     if jsonb_array_length(history)=1 then candidates:=history;end if;
     if jsonb_array_length(candidates)=1 then target:=candidates->0->>'id';else target:=null;end if;
    end if;
   end if;
   if target is null and ((spec->>'task')::boolean or op not in ('task_create','category_create','template_create','org_create','notification_all','profile_name')) then
    if coalesce(jsonb_array_length(candidates),0)>1 and jsonb_array_length(candidates)<=10 then
     insert into public.atm_ai_sessions(user_id,channel,operation,payload,phone,linked_at,expires_at)
      values(actor,p_channel,op,jsonb_build_object('data',coalesce(p_payload->'data','{}'),'choices',candidates),p_phone,link_time,now()+interval '5 minutes');
     r:=jsonb_build_object('ok',true,'selection',true,'rows',candidates,'path','/tasks','message','Ada beberapa data yang cocok. Balas nomor pilihan (misalnya “pilih 2”). Perubahan belum disimpan; setelah memilih akan ada pratinjau dan konfirmasi.');
    elsif coalesce(jsonb_array_length(candidates),0)>20 then
     r:=jsonb_build_object('ok',false,'message','Ada lebih dari 10 hasil yang cocok. Tambahkan kata kunci yang lebih spesifik agar saya dapat menampilkan pilihan. Belum ada perubahan.');
    else r:=jsonb_build_object('ok',false,'message','Tidak ditemukan data yang cocok dalam hak akses Anda. Coba kata kunci lain atau lihat daftar tugas. Belum ada perubahan.');end if;
   else
    r:=public.wa_safe_operation(actor,op,target,coalesce(p_payload->'data','{}'),true,null);
    if (r->>'ok')::boolean then
     tok:=gen_random_uuid();
     insert into public.atm_ai_sessions(user_id,channel,token,operation,target,payload,version,phone,linked_at,expires_at) values(actor,p_channel,tok,op,target,coalesce(p_payload->'data','{}'),r->>'version',p_phone,link_time,now()+interval '5 minutes');
     msg:='Pratinjau: '||(r->>'label')||' — '||(r->>'subject');
     for f in select key||': '||value from jsonb_each_text(coalesce(p_payload->'data','{}')) loop msg:=msg||E'\n'||f;end loop;
     r:=r||jsonb_build_object('message',msg||E'\nBelum disimpan. Konfirmasi dalam 5 menit atau batalkan.','pending',true,'token',tok);
    else r:=r||jsonb_build_object('message',coalesce(r->>'error','Isian belum valid.'));end if;
   end if;
  end if;
 elsif p_kind='read' then
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel;
  if p_payload->>'entity'='tasks' then
   page_no:=case when p_payload->>'page' ~ '^[1-9][0-9]{0,3}$' then (p_payload->>'page')::integer else 1 end;
   candidates:=public.atm_ai_task_page(actor,left(coalesce(p_payload->>'query',''),200),coalesce(p_payload->>'mode','list'),page_no);
   more:=case when jsonb_typeof(candidates)='array' then jsonb_array_length(candidates)>5 else false end;
   if more then select jsonb_agg(value order by n) into candidates from jsonb_array_elements(candidates) with ordinality x(value,n) where n<=5;end if;
   msg:=case p_payload->>'mode' when 'mine' then 'Tugas saya sebagai PIC' when 'mine_open' then 'Tugas saya yang masih open' when 'open' then 'Tugas open sesuai hak akses Anda' when 'review' then 'Tugas yang ditugaskan untuk saya review' else 'Daftar tugas sesuai hak akses Anda' end;
   if jsonb_typeof(candidates)='array' then msg:=msg||' — halaman '||page_no||case when more then E'\nMasih ada tugas berikutnya. Ketik LANJUT atau “'||case when p_payload->>'mode' in ('mine','mine_open') then 'tugas saya' when p_payload->>'mode'='review' then 'review saya' else 'daftar tugas' end||case when p_payload->>'mode' in ('mine_open','open') then ' open' else '' end||case when coalesce(p_payload->>'query','')<>'' then '” atau gunakan “cari tugas '||(p_payload->>'query')||' halaman '||(page_no+1)||'” untuk hasil berikutnya.' else ' halaman '||(page_no+1)||'”.' end else '' end;end if;
   r:=jsonb_build_object('ok',true,'rows',candidates,'hasMore',more,'page',page_no,'path',case when p_payload->>'mode' in ('mine','mine_open') then '/tasks?mine=1' when p_payload->>'mode'='review' then '/review-inbox' else '/tasks' end,'message',msg);

   if more then insert into public.atm_ai_sessions(user_id,channel,payload,phone,linked_at,expires_at) values(actor,p_channel,jsonb_build_object('lastRead',p_payload||jsonb_build_object('page',page_no)),p_phone,link_time,now()+interval '15 minutes');end if;
  else
   r:=public.wa_read_feature(actor,p_payload->>'entity',nullif(p_payload->>'task','')::uuid,greatest(1,least(1000,coalesce((p_payload->>'page')::integer,1))));
   r:=r||jsonb_build_object('message',case when (r->>'ok')::boolean then 'Data dalam cakupan akses Anda' else coalesce(r->>'error','Akses ditolak.') end);
  end if;
 elsif p_kind='reply' then
  delete from public.atm_ai_sessions where user_id=actor and channel=p_channel;
  r:=jsonb_build_object('ok',true,'message',left(p_payload->>'message',2500),'path',p_payload->>'path');
 else raise exception 'Invalid action';end if;
 if p_channel='whatsapp' then
  msg:=coalesce(r->>'message','Permintaan tidak dapat diproses.');
  if jsonb_typeof(r->'rows')='array' then
   choice:=0;
   for candidates in select value from jsonb_array_elements(r->'rows') limit 20 loop
    choice:=choice+1;
    msg:=msg||E'\n\n'||choice||'. '||left(coalesce(candidates->>'title',candidates->>'label','Data'),80)||E'\n'||coalesce(candidates->>'status',candidates->>'details','')||case when candidates?'due' then E'\nTenggat: '||(candidates->>'due')||' WIB' else '' end||case when candidates?'progress_pct' then ' · '||(candidates->>'progress_pct')||'%' else '' end||E'\nID: '||(candidates->>'id');
   end loop;
   if jsonb_array_length(r->'rows')=0 then msg:=msg||E'\nTidak ada hasil.';end if;
  elsif jsonb_typeof(r->'rows')='object' then msg:=msg||E'\nTotal: '||(r->'rows'->>'total')||' · Selesai: '||(r->'rows'->>'done')||' · Review: '||(r->'rows'->>'review')||' · Lewat tenggat: '||(r->'rows'->>'overdue');end if;
  if r->>'pending'='true' then msg:=msg||E'\nKetik YA untuk menyimpan atau BATAL.';end if;
  msg:=left(msg,3000);
  if r->>'path' like '/%' and r->>'path' not like '//%' then msg:=msg||E'\n\nhttps://atm-sig.vercel.app'||(r->>'path');end if;
  insert into public.whatsapp_outbox(receipt_id,user_id,phone,body) values(p_receipt,actor,p_phone,left(msg,3500));
 end if;
 return r;
end $$;
notify pgrst,'reload schema';
commit;
