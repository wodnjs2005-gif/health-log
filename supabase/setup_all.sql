-- 나의 건강일지 · 새 Supabase 프로젝트 한 번에 설정하기
-- 자동으로 만든 파일입니다. 직접 고치지 말고 supabase/migrations/ 를 고친 뒤 npm run build:sql 하세요.
-- 이미 쓰던 데이터베이스라면 이 파일 대신 아직 실행하지 않은 migrations 파일만 순서대로 실행하세요.
-- 실행한 뒤 첫 관리자 계정을 꼭 만드세요:
--   select admin_create('admin', '여기에-8자-이상-비밀번호', '관리자');

-- ================= 다시 실행해도 되도록: 이 앱의 함수 지우기 (표·기록은 그대로) =================

do $$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname = any(array['_assign','_chat_at','_chat_page','_chat_put','_chat_ring','_chat_ring_to','_chat_seen','_chat_staff_key','_check_measure','_check_photo','_check_test_item','_clean_days','_clean_foods','_clean_nutri','_client_ip','_code_blocked','_code_fail','_extra_data','_gid','_guardians','_j_chat','_j_custom_food','_j_ex','_j_lesson','_j_meal','_j_measure','_j_member','_j_member_staff','_j_member_trainer','_j_note','_j_notice','_j_prog','_j_test','_j_test_category','_j_test_item','_j_trainer','_j_view','_kst_today','_lesson_data','_meal_total','_mid','_need_admin','_need_assigned','_need_staff','_need_trainer','_new_code','_new_session','_new_trainer_code','_norm_rank','_nutri_num','_photo_key','_photo_ver','_photo_vers','_put_photo','_role','_staff_label','_staff_ok','_token_hash','admin_add_test_category','admin_add_test_item','admin_add_trainer','admin_change_password','admin_create','admin_del_food','admin_del_test_category','admin_del_test_item','admin_del_trainer','admin_food_requests','admin_login','admin_new_trainer_code','admin_save_food','admin_set_member_trainer','admin_set_trainer_rank','admin_update_test_category','admin_update_test_item','custom_foods_get','guardian_get','guardian_photos','guardian_set_photo','guardian_set_relation','staff_add_lesson','staff_add_measure','staff_add_member','staff_add_note','staff_add_notice','staff_add_program','staff_chat_get','staff_chat_list','staff_chat_seen','staff_check','staff_del_lesson','staff_del_measure','staff_del_member','staff_del_note','staff_del_notice','staff_del_program','staff_get','staff_login','staff_logout','staff_new_code','staff_new_guardian_code','staff_photos','staff_set_attendance','staff_set_attendance_many','staff_set_birth','staff_set_offday','staff_set_photo','staff_set_program_members','staff_set_tags','staff_update_lesson','trainer_chat_send','trainer_del_tests','trainer_login','trainer_save_tests','user_add_ex','user_add_meal','user_add_measure','user_add_view','user_chat_get','user_chat_seen','user_chat_send','user_chat_status','user_del_ex','user_del_meal','user_del_measure','user_get','user_photos','user_set_photo'])
  loop
    execute 'drop function if exists ' || f.sig || ' cascade';
  end loop;
end $$;

-- ================= 20260925000000_healthlog_init.sql =================

-- 나의 건강일지 · Supabase 설정
-- 1) 아래 '1234'를 직원(트레이너·관리자) 비밀번호로 바꾸세요.
-- 2) Supabase > SQL Editor 에 전체를 붙여넣고 Run.
-- 다시 실행해도 기존 데이터는 지워지지 않습니다(비밀번호만 새 값으로 바뀜).

create extension if not exists pgcrypto with schema extensions;

create table if not exists settings(key text primary key, value text not null);
create table if not exists members(
  id uuid primary key default gen_random_uuid(), code text unique not null, name text not null, age int,
  created_at timestamptz not null default now());
create table if not exists exercises(
  id uuid primary key default gen_random_uuid(), member_id uuid not null references members(id) on delete cascade,
  date date not null, kind text not null, min int not null, level text not null default '보통', memo text not null default '',
  program_id uuid, created_at timestamptz not null default now());
create table if not exists meals(
  id uuid primary key default gen_random_uuid(), member_id uuid not null references members(id) on delete cascade,
  date date not null, meal text not null, menu text not null, amount text not null default '보통', memo text not null default '',
  created_at timestamptz not null default now());
create table if not exists programs(
  id uuid primary key default gen_random_uuid(), title text not null, type text not null, kind text not null, min int not null,
  memo text not null default '', date date not null default current_date, src text not null,
  yt_id text, video_url text, video_name text, created_at timestamptz not null default now());
create table if not exists program_members(
  program_id uuid references programs(id) on delete cascade, member_id uuid references members(id) on delete cascade,
  primary key(program_id, member_id));
create table if not exists views(
  id uuid primary key default gen_random_uuid(), program_id uuid not null references programs(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade, date date not null, created_at timestamptz not null default now());

-- 모든 테이블 직접 접근 차단 (아래 함수로만 접근)
alter table settings enable row level security;
alter table members enable row level security;
alter table exercises enable row level security;
alter table meals enable row level security;
alter table programs enable row level security;
alter table program_members enable row level security;
alter table views enable row level security;

insert into settings(key,value) values('staff_password', extensions.crypt('1234', extensions.gen_salt('bf')))
on conflict(key) do update set value=excluded.value;

-- 내부 도우미 ---------------------------------------------------------------
create or replace function _staff_ok(p_pw text) returns boolean language sql stable security definer set search_path=public, extensions as $$
  select exists(select 1 from settings where key='staff_password' and value=crypt(coalesce(p_pw,''), value)) $$;

create or replace function _mid(p_code text) returns uuid language sql stable security definer set search_path=public as $$
  select id from members where code=upper(regexp_replace(coalesce(p_code,''),'[^A-Za-z0-9]','','g')) $$;

create or replace function _new_code() returns text language plpgsql volatile security definer set search_path=public, extensions as $$
declare ch text:='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; b bytea; i int;
begin
  loop
    b:=gen_random_bytes(6); c:='';
    for i in 0..5 loop c:=c||substr(ch,(get_byte(b,i)%length(ch))+1,1); end loop;
    exit when not exists(select 1 from members where code=c);
  end loop;
  return c;
end $$;

create or replace function _j_member(m members) returns json language sql stable as $$
  select json_build_object('id',m.id,'name',m.name,'age',m.age,'code',m.code) $$;
create or replace function _j_ex(e exercises) returns json language sql stable as $$
  select json_build_object('id',e.id,'mid',e.member_id,'date',to_char(e.date,'YYYY-MM-DD'),'kind',e.kind,'min',e.min,'level',e.level,'memo',e.memo,'pid',e.program_id) $$;
create or replace function _j_meal(e meals) returns json language sql stable as $$
  select json_build_object('id',e.id,'mid',e.member_id,'date',to_char(e.date,'YYYY-MM-DD'),'meal',e.meal,'menu',e.menu,'amount',e.amount,'memo',e.memo) $$;
create or replace function _j_view(v views) returns json language sql stable as $$
  select json_build_object('id',v.id,'pid',v.program_id,'mid',v.member_id,'date',to_char(v.date,'YYYY-MM-DD')) $$;
create or replace function _j_prog(p programs, only_mid uuid) returns json language sql stable as $$
  select json_build_object('id',p.id,'title',p.title,'type',p.type,'kind',p.kind,'min',p.min,'memo',p.memo,
    'date',to_char(p.date,'YYYY-MM-DD'),'src',p.src,'ytId',p.yt_id,'videoUrl',p.video_url,'videoName',p.video_name,
    'mids',case when only_mid is null
      then coalesce((select json_agg(pm.member_id) from program_members pm where pm.program_id=p.id),'[]'::json)
      else json_build_array(only_mid) end) $$;

-- 이용자 (개인 번호) ----------------------------------------------------------
create or replace function user_get(p_code text) returns json language plpgsql stable security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then return null; end if;
  return json_build_object(
    'member',(select _j_member(x) from members x where x.id=m),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x where x.member_id=m),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x where x.member_id=m),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,m) order by p.created_at desc) from programs p
                         join program_members pm on pm.program_id=p.id and pm.member_id=m),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json));
end $$;

create or replace function user_add_ex(p_code text,p_date date,p_kind text,p_min int,p_level text,p_memo text) returns json
language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); r exercises;
begin
  if m is null then raise exception 'invalid code'; end if;
  insert into exercises(member_id,date,kind,min,level,memo) values(m,p_date,p_kind,greatest(1,least(p_min,600)),p_level,coalesce(p_memo,'')) returning * into r;
  return _j_ex(r);
end $$;

create or replace function user_add_meal(p_code text,p_date date,p_meal text,p_menu text,p_amount text,p_memo text) returns json
language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); r meals;
begin
  if m is null then raise exception 'invalid code'; end if;
  insert into meals(member_id,date,meal,menu,amount,memo) values(m,p_date,p_meal,p_menu,p_amount,coalesce(p_memo,'')) returning * into r;
  return _j_meal(r);
end $$;

create or replace function user_del_ex(p_code text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin if m is null then raise exception 'invalid code'; end if; delete from exercises where id=p_id and member_id=m; end $$;

create or replace function user_del_meal(p_code text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin if m is null then raise exception 'invalid code'; end if; delete from meals where id=p_id and member_id=m; end $$;

create or replace function user_add_view(p_code text,p_program uuid,p_date date) returns json language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); p programs; v views; e exercises;
begin
  if m is null then raise exception 'invalid code'; end if;
  select pr.* into p from programs pr join program_members pm on pm.program_id=pr.id and pm.member_id=m where pr.id=p_program;
  if p.id is null then raise exception 'not allowed'; end if;
  insert into views(program_id,member_id,date) values(p.id,m,p_date) returning * into v;
  insert into exercises(member_id,date,kind,min,level,memo,program_id) values(m,p_date,p.kind,p.min,'보통','영상 따라하기 · '||p.title,p.id) returning * into e;
  return json_build_object('view',_j_view(v),'ex',_j_ex(e));
end $$;

-- 직원 (비밀번호) -------------------------------------------------------------
create or replace function staff_login(p_pw text) returns boolean language sql stable security definer set search_path=public as $$
  select _staff_ok(p_pw) $$;

create or replace function staff_get(p_pw text) returns json language plpgsql stable security definer set search_path=public as $$
begin
  if not _staff_ok(p_pw) then return null; end if;
  return json_build_object(
    'members',coalesce((select json_agg(_j_member(x) order by x.created_at) from members x),'[]'::json),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,null) order by p.created_at desc) from programs p),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x),'[]'::json));
end $$;

create or replace function staff_add_member(p_pw text,p_name text,p_age int) returns json language plpgsql security definer set search_path=public as $$
declare r members;
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  insert into members(code,name,age) values(_new_code(),p_name,p_age) returning * into r;
  return _j_member(r);
end $$;

create or replace function staff_del_member(p_pw text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin if not _staff_ok(p_pw) then raise exception 'invalid password'; end if; delete from members where id=p_id; end $$;

create or replace function staff_new_code(p_pw text,p_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare c text;
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  update members set code=_new_code() where id=p_id returning code into c;
  return c;
end $$;

create or replace function staff_add_program(p_pw text,p_title text,p_type text,p_kind text,p_min int,p_memo text,
  p_src text,p_yt_id text,p_video_url text,p_video_name text,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare r programs;
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  insert into programs(title,type,kind,min,memo,src,yt_id,video_url,video_name)
    values(p_title,p_type,p_kind,p_min,coalesce(p_memo,''),p_src,p_yt_id,p_video_url,p_video_name) returning * into r;
  insert into program_members(program_id,member_id) select r.id, unnest(p_mids) on conflict do nothing;
  return _j_prog(r,null);
end $$;

create or replace function staff_del_program(p_pw text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin if not _staff_ok(p_pw) then raise exception 'invalid password'; end if; delete from programs where id=p_id; end $$;

-- 도우미 함수는 외부에서 직접 호출 못하게
revoke execute on function _staff_ok(text), _mid(text), _new_code() from public, anon, authenticated;

-- 영상 파일 저장소 -------------------------------------------------------------
insert into storage.buckets(id,name,public) values('videos','videos',true) on conflict(id) do nothing;
drop policy if exists "healthlog video upload" on storage.objects;
create policy "healthlog video upload" on storage.objects for insert to anon, authenticated with check (bucket_id='videos');

-- ================= 20260926000000_guardian.sql =================

-- 나의 건강일지 · 보호자 번호
-- 20260925000000_healthlog_init.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
-- 보호자는 보호자 번호로 가족의 기록을 '보기만' 합니다. 이용자의 개인 번호는 보호자에게 보내지 않습니다.
-- 다시 실행해도 기존 데이터·번호는 바뀌지 않습니다.

alter table members add column if not exists guardian_code text unique;

-- 새 번호는 개인 번호·보호자 번호 모두와 겹치지 않게
create or replace function _new_code() returns text language plpgsql volatile security definer set search_path=public, extensions as $$
declare ch text:='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; b bytea; i int;
begin
  loop
    b:=gen_random_bytes(6); c:='';
    for i in 0..5 loop c:=c||substr(ch,(get_byte(b,i)%length(ch))+1,1); end loop;
    exit when not exists(select 1 from members where code=c or guardian_code=c);
  end loop;
  return c;
end $$;

-- 이미 등록된 이용자에게 보호자 번호 채우기 (한 명씩 해야 서로 겹치지 않음)
do $$
declare r record;
begin
  for r in select id from members where guardian_code is null loop
    update members set guardian_code=_new_code() where id=r.id;
  end loop;
end $$;
alter table members alter column guardian_code set not null;

-- 보호자 번호 → member id
create or replace function _gid(p_code text) returns uuid language sql stable security definer set search_path=public as $$
  select id from members where guardian_code=upper(regexp_replace(coalesce(p_code,''),'[^A-Za-z0-9]','','g')) $$;

-- 직원에게만 보호자 번호까지 보낸다 (user_get 의 _j_member 는 그대로)
create or replace function _j_member_staff(m members) returns json language sql stable as $$
  select json_build_object('id',m.id,'name',m.name,'age',m.age,'code',m.code,'guardianCode',m.guardian_code) $$;

create or replace function staff_get(p_pw text) returns json language plpgsql stable security definer set search_path=public as $$
begin
  if not _staff_ok(p_pw) then return null; end if;
  return json_build_object(
    'members',coalesce((select json_agg(_j_member_staff(x) order by x.created_at) from members x),'[]'::json),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,null) order by p.created_at desc) from programs p),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x),'[]'::json));
end $$;

create or replace function staff_add_member(p_pw text,p_name text,p_age int) returns json language plpgsql security definer set search_path=public as $$
declare r members; c text; g text;
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  c:=_new_code();
  loop g:=_new_code(); exit when g<>c; end loop;
  insert into members(code,guardian_code,name,age) values(c,g,p_name,p_age) returning * into r;
  return _j_member_staff(r);
end $$;

create or replace function staff_new_guardian_code(p_pw text,p_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare c text;
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  update members set guardian_code=_new_code() where id=p_id returning guardian_code into c;
  return c;
end $$;

-- 보호자: 읽기 전용. member 에는 개인 번호를 넣지 않는다.
create or replace function guardian_get(p_code text) returns json language plpgsql stable security definer set search_path=public as $$
declare m uuid:=_gid(p_code);
begin
  if m is null then return null; end if;
  return json_build_object(
    'member',(select json_build_object('id',x.id,'name',x.name,'age',x.age) from members x where x.id=m),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x where x.member_id=m),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x where x.member_id=m),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,m) order by p.created_at desc) from programs p
                         join program_members pm on pm.program_id=p.id and pm.member_id=m),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json));
end $$;

revoke execute on function _gid(text), _j_member_staff(members) from public, anon, authenticated;

-- ================= 20260927000000_birthdate.sql =================

-- 나의 건강일지 · 생년월일
-- 20260926000000_guardian.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
-- 이용자를 등록할 때 나이 대신 생년월일을 저장하고, 나이는 앱에서 오늘 날짜 기준 만 나이로 계산합니다.
-- 예전에 나이만 입력한 이용자는 age 값이 그대로 남아 그 나이로 보입니다.
-- 다시 실행해도 기존 데이터는 바뀌지 않습니다.

alter table members add column if not exists birth date;

create or replace function _j_member(m members) returns json language sql stable as $$
  select json_build_object('id',m.id,'name',m.name,'age',m.age,'birth',to_char(m.birth,'YYYY-MM-DD'),'code',m.code) $$;

create or replace function _j_member_staff(m members) returns json language sql stable as $$
  select json_build_object('id',m.id,'name',m.name,'age',m.age,'birth',to_char(m.birth,'YYYY-MM-DD'),
    'code',m.code,'guardianCode',m.guardian_code) $$;

-- 나이(p_age) 대신 생년월일(p_birth)을 받는다
drop function if exists staff_add_member(text,text,int);
create or replace function staff_add_member(p_pw text,p_name text,p_birth date) returns json language plpgsql security definer set search_path=public as $$
declare r members; c text; g text;
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  if p_birth is null or p_birth > current_date or p_birth < date '1900-01-01' then raise exception 'invalid birth'; end if;
  c:=_new_code();
  loop g:=_new_code(); exit when g<>c; end loop;
  insert into members(code,guardian_code,name,birth) values(c,g,p_name,p_birth) returning * into r;
  return _j_member_staff(r);
end $$;

-- 보호자에게도 생년월일(나이 계산용)을 보낸다. 개인 번호는 여전히 보내지 않는다.
create or replace function guardian_get(p_code text) returns json language plpgsql stable security definer set search_path=public as $$
declare m uuid:=_gid(p_code);
begin
  if m is null then return null; end if;
  return json_build_object(
    'member',(select json_build_object('id',x.id,'name',x.name,'age',x.age,'birth',to_char(x.birth,'YYYY-MM-DD')) from members x where x.id=m),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x where x.member_id=m),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x where x.member_id=m),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,m) order by p.created_at desc) from programs p
                         join program_members pm on pm.program_id=p.id and pm.member_id=m),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json));
end $$;

-- ================= 20260928000000_set_birth.sql =================

-- 나의 건강일지 · 기존 이용자 생년월일 입력
-- 20260927000000_birthdate.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
-- 관리자가 이미 등록된 이용자의 생년월일을 넣거나 고칠 수 있습니다. 나이는 앱에서 생년월일로 계산합니다.

create or replace function staff_set_birth(p_pw text,p_id uuid,p_birth date) returns void language plpgsql security definer set search_path=public as $$
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  if p_birth is null or p_birth > current_date or p_birth < date '1900-01-01' then raise exception 'invalid birth'; end if;
  update members set birth=p_birth where id=p_id;
end $$;

-- ================= 20260929000000_tags_programs.sql =================

-- 나의 건강일지 · 해시태그, 영상 진행 방식 없애기
-- 20260928000000_set_birth.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
-- 1) 이용자에게 해시태그(#오전반, #무릎 …)를 달아 구분합니다. 직원(관리자·트레이너) 화면에만 보이고,
--    이용자·보호자에게는 보내지 않습니다 (user_get·guardian_get 은 그대로).
-- 2) 운동 영상의 '진행 방식(1:1/그룹)'을 없애고, 대상 이용자를 직접 골라 등록합니다.
-- 다시 실행해도 기존 데이터는 바뀌지 않습니다.

-- 해시태그 ---------------------------------------------------------------------
alter table members add column if not exists tags text[] not null default '{}';

create or replace function _j_member_staff(m members) returns json language sql stable as $$
  select json_build_object('id',m.id,'name',m.name,'age',m.age,'birth',to_char(m.birth,'YYYY-MM-DD'),
    'code',m.code,'guardianCode',m.guardian_code,'tags',to_json(m.tags)) $$;

-- 띄어쓰기를 먼저 지운 뒤 앞의 #을 지우고 20자까지. 빈 태그·중복은 뺀다. 한 사람에 10개까지.
create or replace function staff_set_tags(p_pw text,p_id uuid,p_tags text[]) returns json language plpgsql security definer set search_path=public as $$
declare t text[];
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  select coalesce(array_agg(x order by ord),'{}') into t from (
    select distinct on (x) x, ord from (
      select left(regexp_replace(regexp_replace(v,'\s+','','g'),'^#+',''),20) x, ord
      from unnest(coalesce(p_tags,'{}')) with ordinality u(v,ord)) a
    where x<>'' order by x, ord) b;
  if array_length(t,1)>10 then raise exception 'too many tags'; end if;
  update members set tags=t where id=p_id;
  return to_json(t);
end $$;

-- 영상: 진행 방식 없이 등록 -------------------------------------------------------
alter table programs alter column type drop not null;

drop function if exists staff_add_program(text,text,text,text,int,text,text,text,text,text,uuid[]);
create or replace function staff_add_program(p_pw text,p_title text,p_kind text,p_min int,p_memo text,
  p_src text,p_yt_id text,p_video_url text,p_video_name text,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare r programs;
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  if coalesce(array_length(p_mids,1),0)=0 then raise exception 'no members'; end if;
  insert into programs(title,kind,min,memo,src,yt_id,video_url,video_name)
    values(p_title,p_kind,p_min,coalesce(p_memo,''),p_src,p_yt_id,p_video_url,p_video_name) returning * into r;
  insert into program_members(program_id,member_id) select r.id, unnest(p_mids) on conflict do nothing;
  return _j_prog(r,null);
end $$;

-- ================= 20260930000000_program_members.sql =================

-- 나의 건강일지 · 이미 등록한 영상의 대상 이용자 바꾸기
-- 20260929000000_tags_programs.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
-- 대상에서 뺀 이용자는 더 이상 그 영상을 볼 수 없습니다. 이미 따라한 기록(운동일지·횟수)은 지우지 않습니다.

create or replace function staff_set_program_members(p_pw text,p_id uuid,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  if coalesce(array_length(p_mids,1),0)=0 then raise exception 'no members'; end if;
  -- 다른 직원이 먼저 지운 영상 ('not allowed' 는 앱에서 로그인 만료로 처리하므로 쓰지 않는다)
  if not exists(select 1 from programs where id=p_id) then raise exception 'program not found'; end if;
  delete from program_members where program_id=p_id and member_id <> all(p_mids);
  insert into program_members(program_id,member_id)
    select p_id, m.id from members m where m.id = any(p_mids) on conflict do nothing;
  return coalesce((select json_agg(member_id) from program_members where program_id=p_id),'[]'::json);
end $$;

-- ================= 20261001000000_staff_accounts.sql =================

-- 나의 건강일지 · 관리자 로그인(아이디+비밀번호), 트레이너 번호 발급
-- 20260930000000_program_members.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 바뀌는 점
--   · 트레이너·관리자 '공용 비밀번호'를 없앱니다. 예전 비밀번호로는 더 이상 들어갈 수 없습니다.
--   · 관리자: 아이디 + 비밀번호 로그인. 5번 틀리면 10분 동안 잠깁니다.
--   · 트레이너: 관리자가 발급한 8자리 트레이너 번호로 로그인합니다.
--   · 로그인하면 비밀번호·번호 대신 기간이 정해진 '로그인 표(세션)'만 휴대폰에 남습니다.
--     (관리자 12시간, 트레이너 30일. 번호를 새로 발급하거나 트레이너를 지우면 바로 끝납니다)
--
-- ■ 실행한 뒤 반드시: 첫 관리자 계정 만들기 (SQL Editor 에서, 아이디·비밀번호를 바꿔서)
--     select admin_create('admin', '여기에-8자-이상-비밀번호', '관리자');
--   같은 명령을 다시 실행하면 그 아이디의 비밀번호를 새로 정합니다(비밀번호를 잊었을 때).

create extension if not exists pgcrypto with schema extensions;

-- 표 --------------------------------------------------------------------------
create table if not exists admins(
  id uuid primary key default gen_random_uuid(),
  login_id text unique not null,
  name text not null default '관리자',
  pw_hash text not null,
  failed int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now());

create table if not exists trainers(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  created_at timestamptz not null default now());

-- 로그인 표는 원문 대신 sha256 해시만 저장한다
create table if not exists staff_sessions(
  token_hash text primary key,
  role text not null check (role in ('admin','trainer')),
  subject uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now());
create index if not exists staff_sessions_subject on staff_sessions(subject);

alter table admins enable row level security;
alter table trainers enable row level security;
alter table staff_sessions enable row level security;

-- 공용 비밀번호 방식 없애기 ------------------------------------------------------------
drop function if exists staff_login(text);
drop function if exists staff_get(text);
drop function if exists staff_add_member(text,text,int);
drop function if exists staff_add_member(text,text,date);
drop function if exists staff_del_member(text,uuid);
drop function if exists staff_new_code(text,uuid);
drop function if exists staff_new_guardian_code(text,uuid);
drop function if exists staff_set_birth(text,uuid,date);
drop function if exists staff_set_tags(text,uuid,text[]);
drop function if exists staff_add_program(text,text,text,text,int,text,text,text,text,text,uuid[]);
drop function if exists staff_add_program(text,text,text,int,text,text,text,text,text,uuid[]);
drop function if exists staff_del_program(text,uuid);
drop function if exists staff_set_program_members(text,uuid,uuid[]);
drop function if exists _staff_ok(text);
delete from settings where key='staff_password';

-- 내부 도우미 ---------------------------------------------------------------------
create or replace function _token_hash(p_token text) returns text language sql immutable set search_path=public, extensions as $$
  select encode(digest(coalesce(p_token,''),'sha256'),'hex') $$;

-- 유효한 로그인 표의 역할 ('admin' / 'trainer'), 없거나 끝났으면 null
create or replace function _role(p_token text) returns text language sql stable security definer set search_path=public as $$
  select role from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now() $$;

create or replace function _need_staff(p_token text) returns text language plpgsql stable security definer set search_path=public as $$
declare r text:=_role(p_token);
begin
  if r is null then raise exception 'invalid session'; end if;
  return r;
end $$;

create or replace function _need_admin(p_token text) returns void language plpgsql stable security definer set search_path=public as $$
begin
  if _role(p_token) is distinct from 'admin' then raise exception 'invalid session'; end if;
end $$;

create or replace function _new_session(p_role text,p_subject uuid,p_hours int) returns text language plpgsql volatile security definer set search_path=public, extensions as $$
declare t text:=encode(gen_random_bytes(32),'hex');
begin
  delete from staff_sessions where expires_at<now();
  insert into staff_sessions(token_hash,role,subject,expires_at)
    values(_token_hash(t),p_role,p_subject,now()+make_interval(hours=>p_hours));
  return t;
end $$;

-- 트레이너 번호: 8자리, 헷갈리는 0·O·1·I·L 제외
create or replace function _new_trainer_code() returns text language plpgsql volatile security definer set search_path=public, extensions as $$
declare ch text:='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; b bytea; i int;
begin
  loop
    b:=gen_random_bytes(8); c:='';
    for i in 0..7 loop c:=c||substr(ch,(get_byte(b,i)%length(ch))+1,1); end loop;
    exit when not exists(select 1 from trainers where code=c);
  end loop;
  return c;
end $$;

create or replace function _j_member_trainer(m members) returns json language sql stable as $$
  select json_build_object('id',m.id,'name',m.name,'age',m.age,'birth',to_char(m.birth,'YYYY-MM-DD'),'tags',to_json(m.tags)) $$;

create or replace function _j_trainer(t trainers) returns json language sql stable as $$
  select json_build_object('id',t.id,'name',t.name,'code',t.code,'createdAt',to_char(t.created_at,'YYYY-MM-DD')) $$;

-- 관리자 계정 만들기·비밀번호 다시 정하기 (SQL Editor 전용, 앱에서는 호출 불가)
create or replace function admin_create(p_login_id text,p_pw text,p_name text default '관리자') returns text
language plpgsql volatile security definer set search_path=public, extensions as $$
declare lid text:=lower(trim(coalesce(p_login_id,'')));
begin
  if length(lid)<3 then raise exception '아이디는 3자 이상이어야 해요'; end if;
  if length(coalesce(p_pw,''))<8 then raise exception '비밀번호는 8자 이상이어야 해요'; end if;
  insert into admins(login_id,name,pw_hash) values(lid,coalesce(nullif(trim(p_name),''),'관리자'),crypt(p_pw,gen_salt('bf',10)))
  on conflict(login_id) do update set pw_hash=excluded.pw_hash, name=excluded.name, failed=0, locked_until=null;
  delete from staff_sessions where subject=(select id from admins where login_id=lid);
  return '관리자 계정 '||lid||' 을(를) 저장했어요';
end $$;

-- 로그인 ------------------------------------------------------------------------
-- 실패해도 오류를 던지지 않고 {error} 를 돌려준다 (오류를 던지면 틀린 횟수 기록까지 되돌려지기 때문)
create or replace function admin_login(p_login_id text,p_pw text) returns json
language plpgsql volatile security definer set search_path=public, extensions as $$
declare a admins; n int;
begin
  select * into a from admins where login_id=lower(trim(coalesce(p_login_id,'')));
  if a.id is null then
    perform crypt(coalesce(p_pw,''),gen_salt('bf',10)); -- 걸리는 시간으로 아이디가 있는지 드러나지 않게
    return json_build_object('error','invalid');
  end if;
  if a.locked_until is not null and a.locked_until>now() then
    return json_build_object('error','locked','until',a.locked_until);
  end if;
  if a.pw_hash<>crypt(coalesce(p_pw,''),a.pw_hash) then
    n:=a.failed+1;
    if n>=5 then
      update admins set failed=0, locked_until=now()+interval '10 minutes' where id=a.id;
      return json_build_object('error','locked','until',now()+interval '10 minutes');
    end if;
    update admins set failed=n, locked_until=null where id=a.id;
    return json_build_object('error','invalid','left',5-n);
  end if;
  update admins set failed=0, locked_until=null where id=a.id;
  return json_build_object('token',_new_session('admin',a.id,12),'role','admin','name',a.name);
end $$;

create or replace function trainer_login(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare t trainers;
begin
  select * into t from trainers where code=upper(regexp_replace(coalesce(p_code,''),'[^A-Za-z0-9]','','g'));
  if t.id is null then return null; end if;
  return json_build_object('token',_new_session('trainer',t.id,24*30),'role','trainer','name',t.name);
end $$;

create or replace function staff_logout(p_token text) returns void language sql volatile security definer set search_path=public as $$
  delete from staff_sessions where token_hash=_token_hash(p_token) $$;

-- 영상 파일을 올리기 전에 로그인 표 확인
create or replace function staff_check(p_token text) returns boolean language sql stable security definer set search_path=public as $$
  select _role(p_token) is not null $$;

create or replace function admin_change_password(p_token text,p_old text,p_new text) returns json
language plpgsql volatile security definer set search_path=public, extensions as $$
declare s staff_sessions; a admins;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and role='admin' and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  select * into a from admins where id=s.subject;
  if a.pw_hash<>crypt(coalesce(p_old,''),a.pw_hash) then return json_build_object('error','wrong'); end if;
  if length(coalesce(p_new,''))<8 then return json_build_object('error','short'); end if;
  update admins set pw_hash=crypt(p_new,gen_salt('bf',10)) where id=a.id;
  -- 다른 기기의 로그인은 모두 끝낸다
  delete from staff_sessions where subject=a.id and token_hash<>s.token_hash;
  return json_build_object('ok',true);
end $$;

-- 직원 데이터 -----------------------------------------------------------------------
-- 관리자에게만 개인·보호자 번호와 트레이너 목록을 보낸다
create or replace function staff_get(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions; me text;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then return null; end if;
  me:=case when s.role='admin' then (select name from admins where id=s.subject) else (select name from trainers where id=s.subject) end;
  if me is null then return null; end if; -- 지워진 계정
  return json_build_object(
    'me',json_build_object('role',s.role,'name',me),
    'members',coalesce((select json_agg(case when s.role='admin' then _j_member_staff(x) else _j_member_trainer(x) end order by x.created_at) from members x),'[]'::json),
    'trainers',case when s.role='admin' then coalesce((select json_agg(_j_trainer(t) order by t.created_at) from trainers t),'[]'::json) end,
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,null) order by p.created_at desc) from programs p),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x),'[]'::json));
end $$;

-- 이용자 관리 (관리자) ------------------------------------------------------------------
create or replace function staff_add_member(p_token text,p_name text,p_birth date) returns json language plpgsql security definer set search_path=public as $$
declare r members; c text; g text;
begin
  perform _need_admin(p_token);
  if p_birth is null or p_birth>current_date or p_birth<date '1900-01-01' then raise exception 'invalid birth'; end if;
  c:=_new_code();
  loop g:=_new_code(); exit when g<>c; end loop;
  insert into members(code,guardian_code,name,birth) values(c,g,p_name,p_birth) returning * into r;
  return _j_member_staff(r);
end $$;

create or replace function staff_del_member(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_admin(p_token); delete from members where id=p_id; end $$;

create or replace function staff_new_code(p_token text,p_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare c text;
begin
  perform _need_admin(p_token);
  update members set code=_new_code() where id=p_id returning code into c;
  return c;
end $$;

create or replace function staff_new_guardian_code(p_token text,p_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare c text;
begin
  perform _need_admin(p_token);
  update members set guardian_code=_new_code() where id=p_id returning guardian_code into c;
  return c;
end $$;

create or replace function staff_set_birth(p_token text,p_id uuid,p_birth date) returns void language plpgsql security definer set search_path=public as $$
begin
  perform _need_admin(p_token);
  if p_birth is null or p_birth>current_date or p_birth<date '1900-01-01' then raise exception 'invalid birth'; end if;
  update members set birth=p_birth where id=p_id;
end $$;

-- 해시태그 (관리자·트레이너) ----------------------------------------------------------
create or replace function staff_set_tags(p_token text,p_id uuid,p_tags text[]) returns json language plpgsql security definer set search_path=public as $$
declare t text[];
begin
  perform _need_staff(p_token);
  select coalesce(array_agg(x order by ord),'{}') into t from (
    select distinct on (x) x, ord from (
      select left(regexp_replace(regexp_replace(v,'\s+','','g'),'^#+',''),20) x, ord
      from unnest(coalesce(p_tags,'{}')) with ordinality u(v,ord)) a
    where x<>'' order by x, ord) b;
  if array_length(t,1)>10 then raise exception 'too many tags'; end if;
  update members set tags=t where id=p_id;
  return to_json(t);
end $$;

-- 운동 영상 (관리자·트레이너) ----------------------------------------------------------
create or replace function staff_add_program(p_token text,p_title text,p_kind text,p_min int,p_memo text,
  p_src text,p_yt_id text,p_video_url text,p_video_name text,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare r programs;
begin
  perform _need_staff(p_token);
  if coalesce(array_length(p_mids,1),0)=0 then raise exception 'no members'; end if;
  insert into programs(title,kind,min,memo,src,yt_id,video_url,video_name)
    values(p_title,p_kind,p_min,coalesce(p_memo,''),p_src,p_yt_id,p_video_url,p_video_name) returning * into r;
  insert into program_members(program_id,member_id) select r.id, unnest(p_mids) on conflict do nothing;
  return _j_prog(r,null);
end $$;

create or replace function staff_del_program(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_staff(p_token); delete from programs where id=p_id; end $$;

create or replace function staff_set_program_members(p_token text,p_id uuid,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
begin
  perform _need_staff(p_token);
  if coalesce(array_length(p_mids,1),0)=0 then raise exception 'no members'; end if;
  if not exists(select 1 from programs where id=p_id) then raise exception 'program not found'; end if;
  delete from program_members where program_id=p_id and member_id <> all(p_mids);
  insert into program_members(program_id,member_id)
    select p_id, m.id from members m where m.id = any(p_mids) on conflict do nothing;
  return coalesce((select json_agg(member_id) from program_members where program_id=p_id),'[]'::json);
end $$;

-- 트레이너 관리 (관리자) ----------------------------------------------------------------
create or replace function admin_add_trainer(p_token text,p_name text) returns json language plpgsql security definer set search_path=public as $$
declare r trainers;
begin
  perform _need_admin(p_token);
  if coalesce(trim(p_name),'')='' then raise exception 'no name'; end if;
  insert into trainers(name,code) values(trim(p_name),_new_trainer_code()) returning * into r;
  return _j_trainer(r);
end $$;

-- 새 번호를 발급하면 그 트레이너의 로그인은 모두 끝난다
create or replace function admin_new_trainer_code(p_token text,p_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare c text;
begin
  perform _need_admin(p_token);
  update trainers set code=_new_trainer_code() where id=p_id returning code into c;
  delete from staff_sessions where subject=p_id and role='trainer';
  return c;
end $$;

create or replace function admin_del_trainer(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform _need_admin(p_token);
  delete from staff_sessions where subject=p_id and role='trainer';
  delete from trainers where id=p_id;
end $$;

-- 도우미·계정 만들기는 앱(anon)에서 직접 부를 수 없게 --------------------------------------
revoke execute on function _token_hash(text), _role(text), _need_staff(text), _need_admin(text),
  _new_session(text,uuid,int), _new_trainer_code(), _j_member_trainer(members), _j_trainer(trainers),
  admin_create(text,text,text)
  from public, anon, authenticated;

-- ================= 20261002000000_trainer_rank.sql =================

-- 나의 건강일지 · 트레이너 직급
-- 20261001000000_staff_accounts.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
-- 직급은 보여주기용 글자입니다(예: 팀장, 선임 트레이너). 할 수 있는 일(권한)은 직급과 상관없이 같습니다.

alter table trainers add column if not exists rank text not null default '';

create or replace function _j_trainer(t trainers) returns json language sql stable as $$
  select json_build_object('id',t.id,'name',t.name,'rank',t.rank,'code',t.code,'createdAt',to_char(t.created_at,'YYYY-MM-DD')) $$;

-- 직급: 앞뒤 공백·연속 공백 정리, 20자까지
create or replace function _norm_rank(p_rank text) returns text language sql immutable as $$
  select left(regexp_replace(trim(coalesce(p_rank,'')),'\s+',' ','g'),20) $$;

-- 예전 앱(이름만 보냄)도 계속 되도록 p_rank 는 비워도 된다
drop function if exists admin_add_trainer(text,text);
create or replace function admin_add_trainer(p_token text,p_name text,p_rank text default '') returns json
language plpgsql security definer set search_path=public as $$
declare r trainers;
begin
  perform _need_admin(p_token);
  if coalesce(trim(p_name),'')='' then raise exception 'no name'; end if;
  insert into trainers(name,rank,code) values(trim(p_name),_norm_rank(p_rank),_new_trainer_code()) returning * into r;
  return _j_trainer(r);
end $$;

create or replace function admin_set_trainer_rank(p_token text,p_id uuid,p_rank text) returns text
language plpgsql security definer set search_path=public as $$
declare v text:=_norm_rank(p_rank);
begin
  perform _need_admin(p_token);
  update trainers set rank=v where id=p_id;
  if not found then raise exception 'trainer not found'; end if;
  return v;
end $$;

-- 트레이너 화면 제목에 직급을 쓰도록 me 에 rank 를 넣는다
create or replace function staff_get(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions; me text; rk text:='';
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then return null; end if;
  if s.role='admin' then
    select name into me from admins where id=s.subject;
  else
    select name, rank into me, rk from trainers where id=s.subject;
  end if;
  if me is null then return null; end if; -- 지워진 계정
  return json_build_object(
    'me',json_build_object('role',s.role,'name',me,'rank',coalesce(rk,'')),
    'members',coalesce((select json_agg(case when s.role='admin' then _j_member_staff(x) else _j_member_trainer(x) end order by x.created_at) from members x),'[]'::json),
    'trainers',case when s.role='admin' then coalesce((select json_agg(_j_trainer(t) order by t.created_at) from trainers t),'[]'::json) end,
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,null) order by p.created_at desc) from programs p),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x),'[]'::json));
end $$;

revoke execute on function _j_trainer(trainers), _norm_rank(text) from public, anon, authenticated;

-- ================= 20261003000000_lessons_attendance.sql =================

-- 나의 건강일지 · 수업과 출석
-- 20261002000000_trainer_rank.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 수업: 이름 + 요일 + 대상 이용자. 트레이너·관리자가 만들고 날짜별로 출석을 체크합니다.
-- ■ 출석은 '출석한 날'만 저장합니다. 수업 요일인데 체크가 없으면 결석입니다.
--   휴강한 날(class_offdays)은 출석률 계산에서 빠집니다.
-- ■ 이용자·보호자는 자기(가족) 출석만 받고, 같은 수업의 다른 이용자는 알 수 없습니다.

-- 표 --------------------------------------------------------------------------
create table if not exists lessons(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- 요일: 0=일 1=월 … 6=토 (자바스크립트 getDay 와 같음)
  days smallint[] not null default '{}',
  created_at timestamptz not null default now());

create table if not exists lesson_members(
  lesson_id uuid not null references lessons(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(lesson_id, member_id));
create index if not exists lesson_members_member on lesson_members(member_id);

create table if not exists attendance(
  lesson_id uuid not null references lessons(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key(lesson_id, member_id, date));
create index if not exists attendance_member on attendance(member_id);

create table if not exists lesson_offdays(
  lesson_id uuid not null references lessons(id) on delete cascade,
  date date not null,
  primary key(lesson_id, date));

alter table lessons enable row level security;
alter table lesson_members enable row level security;
alter table attendance enable row level security;
alter table lesson_offdays enable row level security;

-- 내부 도우미 ---------------------------------------------------------------------
create or replace function _kst_today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Seoul')::date $$;

create or replace function _clean_days(p_days int[]) returns smallint[] language sql immutable as $$
  select coalesce(array_agg(distinct d::smallint order by d::smallint),'{}')
  from unnest(coalesce(p_days,'{}')) d where d between 0 and 6 $$;

-- only_mid 가 있으면 그 이용자만 roster 에 넣는다 (이용자·보호자용)
create or replace function _j_lesson(l lessons, only_mid uuid) returns json language sql stable as $$
  select json_build_object('id',l.id,'name',l.name,'days',to_json(l.days),
    'createdAt',to_char(l.created_at at time zone 'Asia/Seoul','YYYY-MM-DD'),
    'roster',coalesce((select json_agg(json_build_object('mid',lm.member_id,
                         'since',to_char(lm.added_at at time zone 'Asia/Seoul','YYYY-MM-DD')) order by lm.added_at)
                       from lesson_members lm where lm.lesson_id=l.id and (only_mid is null or lm.member_id=only_mid)),'[]'::json)) $$;

-- 수업·출석·휴강 묶음. p_mid 가 null 이면 전체(직원용)
create or replace function _lesson_data(p_mid uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'lessons',coalesce((select json_agg(_j_lesson(l,p_mid) order by l.created_at) from lessons l
        where p_mid is null or exists(select 1 from lesson_members lm where lm.lesson_id=l.id and lm.member_id=p_mid)),'[]'::json),
    'attendance',coalesce((select json_agg(json_build_object('lid',a.lesson_id,'mid',a.member_id,'date',to_char(a.date,'YYYY-MM-DD')) order by a.date)
        from attendance a where p_mid is null or a.member_id=p_mid),'[]'::json),
    'offdays',coalesce((select json_agg(json_build_object('lid',o.lesson_id,'date',to_char(o.date,'YYYY-MM-DD')) order by o.date)
        from lesson_offdays o
        where p_mid is null or exists(select 1 from lesson_members lm where lm.lesson_id=o.lesson_id and lm.member_id=p_mid)),'[]'::json)) $$;

-- 기존 조회 함수에 수업 묶음을 덧붙인다 ------------------------------------------------
create or replace function user_get(p_code text) returns json language plpgsql stable security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then return null; end if;
  return (jsonb_build_object(
    'member',(select _j_member(x) from members x where x.id=m),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x where x.member_id=m),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x where x.member_id=m),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,m) order by p.created_at desc) from programs p
                         join program_members pm on pm.program_id=p.id and pm.member_id=m),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json)) || _lesson_data(m))::json;
end $$;

create or replace function guardian_get(p_code text) returns json language plpgsql stable security definer set search_path=public as $$
declare m uuid:=_gid(p_code);
begin
  if m is null then return null; end if;
  return (jsonb_build_object(
    'member',(select json_build_object('id',x.id,'name',x.name,'age',x.age,'birth',to_char(x.birth,'YYYY-MM-DD')) from members x where x.id=m),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x where x.member_id=m),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x where x.member_id=m),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,m) order by p.created_at desc) from programs p
                         join program_members pm on pm.program_id=p.id and pm.member_id=m),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json)) || _lesson_data(m))::json;
end $$;

create or replace function staff_get(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions; me text; rk text:='';
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then return null; end if;
  if s.role='admin' then
    select name into me from admins where id=s.subject;
  else
    select name, rank into me, rk from trainers where id=s.subject;
  end if;
  if me is null then return null; end if; -- 지워진 계정
  return (jsonb_build_object(
    'me',json_build_object('role',s.role,'name',me,'rank',coalesce(rk,'')),
    'members',coalesce((select json_agg(case when s.role='admin' then _j_member_staff(x) else _j_member_trainer(x) end order by x.created_at) from members x),'[]'::json),
    'trainers',case when s.role='admin' then coalesce((select json_agg(_j_trainer(t) order by t.created_at) from trainers t),'[]'::json) end,
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,null) order by p.created_at desc) from programs p),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x),'[]'::json)) || _lesson_data(null))::json;
end $$;

-- 수업 만들기·고치기·지우기 (관리자·트레이너) ------------------------------------------
create or replace function staff_add_lesson(p_token text,p_name text,p_days int[],p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare r lessons; d smallint[]:=_clean_days(p_days);
begin
  perform _need_staff(p_token);
  if coalesce(trim(p_name),'')='' then raise exception 'no name'; end if;
  if coalesce(array_length(d,1),0)=0 then raise exception 'no days'; end if;
  if coalesce(array_length(p_mids,1),0)=0 then raise exception 'no members'; end if;
  insert into lessons(name,days) values(left(trim(p_name),30),d) returning * into r;
  insert into lesson_members(lesson_id,member_id) select r.id, m.id from members m where m.id = any(p_mids) on conflict do nothing;
  return _j_lesson(r,null);
end $$;

-- 대상에서 뺀 이용자의 지난 출석 기록은 남겨 둔다. 계속 있는 이용자는 처음 넣은 날짜(since)를 유지한다
create or replace function staff_update_lesson(p_token text,p_id uuid,p_name text,p_days int[],p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare r lessons; d smallint[]:=_clean_days(p_days);
begin
  perform _need_staff(p_token);
  if coalesce(trim(p_name),'')='' then raise exception 'no name'; end if;
  if coalesce(array_length(d,1),0)=0 then raise exception 'no days'; end if;
  if coalesce(array_length(p_mids,1),0)=0 then raise exception 'no members'; end if;
  update lessons set name=left(trim(p_name),30), days=d where id=p_id returning * into r;
  if r.id is null then raise exception 'lesson not found'; end if;
  delete from lesson_members where lesson_id=p_id and member_id <> all(p_mids);
  insert into lesson_members(lesson_id,member_id) select p_id, m.id from members m where m.id = any(p_mids) on conflict do nothing;
  return _j_lesson(r,null);
end $$;

create or replace function staff_del_lesson(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_staff(p_token); delete from lessons where id=p_id; end $$;

-- 출석 체크 (관리자·트레이너) --------------------------------------------------------
create or replace function staff_set_attendance(p_token text,p_lesson uuid,p_member uuid,p_date date,p_present boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform _need_staff(p_token);
  if not exists(select 1 from lessons where id=p_lesson) then raise exception 'lesson not found'; end if;
  if p_date is null or p_date>_kst_today() then raise exception 'invalid date'; end if;
  if p_present then
    if not exists(select 1 from lesson_members where lesson_id=p_lesson and member_id=p_member) then raise exception 'not in lesson'; end if;
    insert into attendance(lesson_id,member_id,date) values(p_lesson,p_member,p_date) on conflict do nothing;
  else
    delete from attendance where lesson_id=p_lesson and member_id=p_member and date=p_date;
  end if;
end $$;

-- 휴강 표시·취소
create or replace function staff_set_offday(p_token text,p_lesson uuid,p_date date,p_off boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform _need_staff(p_token);
  if not exists(select 1 from lessons where id=p_lesson) then raise exception 'lesson not found'; end if;
  if p_date is null then raise exception 'invalid date'; end if;
  if p_off then
    insert into lesson_offdays(lesson_id,date) values(p_lesson,p_date) on conflict do nothing;
  else
    delete from lesson_offdays where lesson_id=p_lesson and date=p_date;
  end if;
end $$;

revoke execute on function _kst_today(), _clean_days(int[]), _j_lesson(lessons,uuid), _lesson_data(uuid)
  from public, anon, authenticated;

-- ================= 20261004000000_meal_nutrition.sql =================

-- 나의 건강일지 · 식사 영양소 (탄수화물·단백질·지방·나트륨·칼로리)
-- 20261003000000_lessons_attendance.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- 음식 목록(식약처 식품영양성분DB)은 앱 안에 들어 있고, 계산도 앱에서 합니다.
-- 서버는 고른 음식(foods)과 그 식사의 합계(nutri)를 함께 저장해 보호자·트레이너 화면과 엑셀에서 씁니다.
-- 예전 식사 기록은 foods 가 비어 있고 nutri 가 없어서 영양소가 계산되지 않은 기록으로 보입니다.

alter table meals add column if not exists foods jsonb not null default '[]';
alter table meals add column if not exists nutri jsonb;

-- 숫자가 아니거나 너무 크면 0 / 상한으로
create or replace function _nutri_num(v jsonb, hi numeric) returns numeric language sql immutable as $$
  select case when jsonb_typeof(v)='number' then least(greatest(v::text::numeric,0),hi) else 0 end $$;

-- {kcal, carb, prot, fat, na}: 칼로리·나트륨은 정수, 나머지는 소수 첫째 자리
create or replace function _clean_nutri(p jsonb) returns jsonb language sql immutable as $$
  select case when p is null or jsonb_typeof(p)<>'object' then null else jsonb_build_object(
    'kcal',round(_nutri_num(p->'kcal',20000)),
    'carb',round(_nutri_num(p->'carb',3000),1),
    'prot',round(_nutri_num(p->'prot',3000),1),
    'fat', round(_nutri_num(p->'fat',3000),1),
    'na',  round(_nutri_num(p->'na',100000))) end $$;

-- 고른 음식: [{n: 이름, kcal, carb, prot, fat, na}] (1인분 기준), 20개까지.
-- 목록에 없어 직접 쓴 음식은 {n} 만 저장한다 (영양 정보 없음)
create or replace function _clean_foods(p jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('n',left(trim(x->>'n'),40))
      || case when jsonb_typeof(x->'kcal')='number' then _clean_nutri(x) else '{}'::jsonb end order by i),'[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p)='array' then p else '[]'::jsonb end) with ordinality t(x,i)
  where i<=20 and jsonb_typeof(x)='object' and coalesce(trim(x->>'n'),'')<>'' $$;

create or replace function _j_meal(e meals) returns json language sql stable as $$
  select json_build_object('id',e.id,'mid',e.member_id,'date',to_char(e.date,'YYYY-MM-DD'),'meal',e.meal,'menu',e.menu,
    'amount',e.amount,'memo',e.memo,'foods',e.foods,'nutri',e.nutri) $$;

-- 예전 앱(음식·영양소 없이 보냄)도 계속 되도록 새 값은 비워도 된다
drop function if exists user_add_meal(text,date,text,text,text,text);
create or replace function user_add_meal(p_code text,p_date date,p_meal text,p_menu text,p_amount text,p_memo text,
  p_foods jsonb default '[]',p_nutri jsonb default null) returns json
language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); r meals; f jsonb:=_clean_foods(p_foods);
begin
  if m is null then raise exception 'invalid code'; end if;
  insert into meals(member_id,date,meal,menu,amount,memo,foods,nutri)
    values(m,p_date,p_meal,p_menu,p_amount,coalesce(p_memo,''),f,case when jsonb_array_length(f)>0 then _clean_nutri(p_nutri) end)
    returning * into r;
  return _j_meal(r);
end $$;

revoke execute on function _nutri_num(jsonb,numeric), _clean_nutri(jsonb), _clean_foods(jsonb) from public, anon, authenticated;

-- ================= 20261005000000_custom_foods.sql =================

-- 나의 건강일지 · 관리자가 추가하는 음식
-- 20261004000000_meal_nutrition.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 이용자가 목록에 없어 「직접 추가」로 적은 음식을 관리자 화면에 모아 보여줍니다 (admin_food_requests).
-- ■ 관리자가 영양 정보를 넣으면(admin_save_food) 모든 사람의 음식 찾기에 나오고,
--   그 이름을 적었던 지난 식사의 영양소도 다시 계산합니다.
-- ■ 앱 안의 기본 음식 목록(식약처 자료)과 이름이 같으면 이쪽 값을 씁니다.

create table if not exists custom_foods(
  name text primary key,
  size numeric not null default 100,
  unit text not null default 'g' check (unit in ('g','ml')),
  kcal numeric not null default 0,
  carb numeric not null default 0,
  prot numeric not null default 0,
  fat numeric not null default 0,
  na numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
alter table custom_foods enable row level security;

create or replace function _j_custom_food(f custom_foods) returns json language sql stable as $$
  select json_build_object('name',f.name,'size',f.size,'unit',f.unit,'kcal',f.kcal,'carb',f.carb,'prot',f.prot,'fat',f.fat,'na',f.na,
    'updatedAt',to_char(f.updated_at at time zone 'Asia/Seoul','YYYY-MM-DD')) $$;

-- 한 식사의 합계: 영양 정보가 있는 음식 합 × 양 (앱의 mealNutri 와 같은 규칙). 하나도 없으면 null
create or replace function _meal_total(p_foods jsonb,p_amount text) returns jsonb language sql immutable as $$
  select case when count(*)=0 then null else _clean_nutri(jsonb_build_object(
    'kcal',sum((x->>'kcal')::numeric)*k,'carb',sum((x->>'carb')::numeric)*k,'prot',sum((x->>'prot')::numeric)*k,
    'fat',sum((x->>'fat')::numeric)*k,'na',sum((x->>'na')::numeric)*k)) end
  from jsonb_array_elements(coalesce(p_foods,'[]'::jsonb)) x,
       (select case p_amount when '적게' then 0.7 when '많이' then 1.3 else 1 end k) f
  where jsonb_typeof(x->'kcal')='number'
  group by k $$;

-- 누구나 (이용자의 음식 찾기에 쓴다. 영양 정보만 있고 개인 정보는 없다)
create or replace function custom_foods_get() returns json language sql stable security definer set search_path=public as $$
  select coalesce(json_agg(_j_custom_food(f) order by f.name),'[]'::json) from custom_foods f $$;

-- 이용자가 직접 적은 음식 (영양 정보 없음) 중 아직 추가하지 않은 것: 이름, 몇 번, 몇 명, 마지막 날짜
create or replace function admin_food_requests(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
begin
  perform _need_admin(p_token);
  return coalesce((
    select json_agg(json_build_object('name',t.n,'count',t.c,'members',t.mc,'last',to_char(t.l,'YYYY-MM-DD')) order by t.c desc, t.n)
    from (select x->>'n' n, count(*) c, count(distinct m.member_id) mc, max(m.date) l
          from meals m, jsonb_array_elements(m.foods) x
          where jsonb_typeof(x->'kcal') is distinct from 'number'
            and not exists(select 1 from custom_foods f where f.name=x->>'n')
          group by x->>'n') t),'[]'::json);
end $$;

-- 음식 추가·고치기. 그 이름이 들어 있는 지난 식사는 이 값으로 다시 계산한다
create or replace function admin_save_food(p_token text,p_name text,p_size numeric,p_unit text,p_nutri jsonb) returns json
language plpgsql security definer set search_path=public as $$
declare nm text:=left(trim(coalesce(p_name,'')),40); n jsonb:=_clean_nutri(p_nutri); r custom_foods; ids uuid[];
begin
  perform _need_admin(p_token);
  if nm='' then raise exception 'no name'; end if;
  if n is null then raise exception 'no nutri'; end if;
  if p_size is null or p_size<=0 or p_size>5000 then raise exception 'invalid size'; end if;
  insert into custom_foods(name,size,unit,kcal,carb,prot,fat,na)
    values(nm,round(p_size,1),case when p_unit='ml' then 'ml' else 'g' end,(n->>'kcal')::numeric,(n->>'carb')::numeric,(n->>'prot')::numeric,(n->>'fat')::numeric,(n->>'na')::numeric)
  on conflict(name) do update set size=excluded.size, unit=excluded.unit, kcal=excluded.kcal, carb=excluded.carb,
    prot=excluded.prot, fat=excluded.fat, na=excluded.na, updated_at=now()
  returning * into r;
  -- 이 이름이 들어 있는 식사의 음식 영양 정보를 채우고 합계를 다시 계산
  with hit as (
    update meals m set foods=(
      select jsonb_agg(case when x->>'n'=nm then jsonb_build_object('n',nm) || n else x end order by i)
      from jsonb_array_elements(m.foods) with ordinality t(x,i))
    where exists(select 1 from jsonb_array_elements(m.foods) x where x->>'n'=nm)
    returning m.id)
  select array_agg(id) into ids from hit;
  update meals set nutri=_meal_total(foods,amount) where id=any(coalesce(ids,'{}'));
  return json_build_object('food',_j_custom_food(r),'updated',coalesce(array_length(ids,1),0));
end $$;

-- 음식 지우기: 찾기 목록에서만 빠지고, 이미 계산된 지난 식사 값은 그대로 둔다
create or replace function admin_del_food(p_token text,p_name text) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_admin(p_token); delete from custom_foods where name=p_name; end $$;

revoke execute on function _j_custom_food(custom_foods), _meal_total(jsonb,text) from public, anon, authenticated;

-- ================= 20261006000000_notes_measures_notices.sql =================

-- 나의 건강일지 · 트레이너 한마디 · 건강 수치 · 공지사항 · 한꺼번에 출석
-- 20261005000000_custom_foods.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 한마디: 트레이너·관리자가 이용자에게 남기는 짧은 글. 이용자 본인과 보호자 화면에 보인다.
-- ■ 건강 수치: 체중·혈압·혈당. 이용자 본인이나 트레이너·관리자가 적는다. 보호자는 보기만 한다.
--   이용자는 자기가 적은 수치만 지울 수 있다.
-- ■ 공지사항: 트레이너·관리자가 올리면 모든 이용자·보호자 화면 위에 보인다. 정한 날까지만 보인다.
-- ■ 출석: 수업의 여러 이용자를 한 번에 출석으로 체크한다 (「남은 분 모두 출석」).

-- 표 --------------------------------------------------------------------------
create table if not exists member_notes(
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  body text not null,
  -- 남긴 사람 (예: '김코치 팀장'). 계정을 지워도 이름은 남는다
  author text not null default '',
  created_at timestamptz not null default now());
create index if not exists member_notes_member on member_notes(member_id, created_at);

create table if not exists measures(
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  date date not null,
  weight numeric(5,1),
  sbp smallint,
  dbp smallint,
  glucose smallint,
  -- '' = 이용자 본인이 적음, 아니면 적은 직원 이름
  author text not null default '',
  created_at timestamptz not null default now());
create index if not exists measures_member on measures(member_id, date);

create table if not exists notices(
  id uuid primary key default gen_random_uuid(),
  body text not null,
  author text not null default '',
  -- 이 날까지 보인다. null 이면 지울 때까지
  until date,
  created_at timestamptz not null default now());

alter table member_notes enable row level security;
alter table measures enable row level security;
alter table notices enable row level security;

-- 내부 도우미 ---------------------------------------------------------------------
-- 로그인한 직원의 이름. 트레이너는 직급까지 ('김코치 팀장', 직급이 없으면 '김코치 트레이너')
create or replace function _staff_label(p_token text) returns text language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions; n text;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if s.role='admin' then
    select name into n from admins where id=s.subject;
  else
    select name||' '||coalesce(nullif(rank,''),'트레이너') into n from trainers where id=s.subject;
  end if;
  if n is null then raise exception 'invalid session'; end if;
  return n;
end $$;

create or replace function _j_note(n member_notes) returns json language sql stable as $$
  select json_build_object('id',n.id,'mid',n.member_id,'text',n.body,'by',n.author,
    'date',to_char(n.created_at at time zone 'Asia/Seoul','YYYY-MM-DD')) $$;

create or replace function _j_measure(x measures) returns json language sql stable as $$
  select json_build_object('id',x.id,'mid',x.member_id,'date',to_char(x.date,'YYYY-MM-DD'),
    'weight',x.weight,'sbp',x.sbp,'dbp',x.dbp,'glu',x.glucose,'by',x.author) $$;

create or replace function _j_notice(x notices) returns json language sql stable as $$
  select json_build_object('id',x.id,'text',x.body,'by',x.author,
    'date',to_char(x.created_at at time zone 'Asia/Seoul','YYYY-MM-DD'),'until',to_char(x.until,'YYYY-MM-DD')) $$;

-- 수치 검사 (앱의 lib/measures.ts 와 같은 범위). 혈압은 수축기·이완기를 함께 적는다
create or replace function _check_measure(p_date date,p_weight numeric,p_sbp int,p_dbp int,p_glu int) returns void language plpgsql stable as $$
begin
  if p_date is null or p_date>_kst_today() or p_date<_kst_today()-3650 then raise exception 'invalid date'; end if;
  if p_weight is null and p_sbp is null and p_dbp is null and p_glu is null then raise exception 'no values'; end if;
  if p_weight is not null and (p_weight<20 or p_weight>300) then raise exception 'invalid weight'; end if;
  if (p_sbp is null) <> (p_dbp is null) then raise exception 'invalid bp'; end if;
  if p_sbp is not null and (p_sbp<50 or p_sbp>300 or p_dbp<30 or p_dbp>200 or p_dbp>=p_sbp) then raise exception 'invalid bp'; end if;
  if p_glu is not null and (p_glu<20 or p_glu>800) then raise exception 'invalid glucose'; end if;
end $$;

-- 한마디·건강 수치·공지 묶음. p_mid 가 null 이면 전체(직원용: 끝난 공지도 30일까지 보여준다)
create or replace function _extra_data(p_mid uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'notes',coalesce((select json_agg(_j_note(n) order by n.created_at) from member_notes n
        where p_mid is null or n.member_id=p_mid),'[]'::json),
    'measures',coalesce((select json_agg(_j_measure(x) order by x.date, x.created_at) from measures x
        where p_mid is null or x.member_id=p_mid),'[]'::json),
    'notices',coalesce((select json_agg(_j_notice(x) order by x.created_at desc) from notices x
        where x.until is null or x.until >= _kst_today() - case when p_mid is null then 30 else 0 end),'[]'::json)) $$;

-- 기존 조회 함수에 묶음을 덧붙인다 ------------------------------------------------------
create or replace function user_get(p_code text) returns json language plpgsql stable security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then return null; end if;
  return (jsonb_build_object(
    'member',(select _j_member(x) from members x where x.id=m),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x where x.member_id=m),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x where x.member_id=m),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,m) order by p.created_at desc) from programs p
                         join program_members pm on pm.program_id=p.id and pm.member_id=m),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json))
    || _lesson_data(m) || _extra_data(m))::json;
end $$;

create or replace function guardian_get(p_code text) returns json language plpgsql stable security definer set search_path=public as $$
declare m uuid:=_gid(p_code);
begin
  if m is null then return null; end if;
  return (jsonb_build_object(
    'member',(select json_build_object('id',x.id,'name',x.name,'age',x.age,'birth',to_char(x.birth,'YYYY-MM-DD')) from members x where x.id=m),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x where x.member_id=m),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x where x.member_id=m),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,m) order by p.created_at desc) from programs p
                         join program_members pm on pm.program_id=p.id and pm.member_id=m),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json))
    || _lesson_data(m) || _extra_data(m))::json;
end $$;

create or replace function staff_get(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions; me text; rk text:='';
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then return null; end if;
  if s.role='admin' then
    select name into me from admins where id=s.subject;
  else
    select name, rank into me, rk from trainers where id=s.subject;
  end if;
  if me is null then return null; end if; -- 지워진 계정
  return (jsonb_build_object(
    'me',json_build_object('role',s.role,'name',me,'rank',coalesce(rk,'')),
    'members',coalesce((select json_agg(case when s.role='admin' then _j_member_staff(x) else _j_member_trainer(x) end order by x.created_at) from members x),'[]'::json),
    'trainers',case when s.role='admin' then coalesce((select json_agg(_j_trainer(t) order by t.created_at) from trainers t),'[]'::json) end,
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,null) order by p.created_at desc) from programs p),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x),'[]'::json))
    || _lesson_data(null) || _extra_data(null))::json;
end $$;

-- 한마디 (관리자·트레이너) ------------------------------------------------------------
create or replace function staff_add_note(p_token text,p_member uuid,p_text text) returns json
language plpgsql security definer set search_path=public as $$
declare who text:=_staff_label(p_token); t text:=left(trim(coalesce(p_text,'')),200); r member_notes;
begin
  if t='' then raise exception 'no text'; end if;
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  insert into member_notes(member_id,body,author) values(p_member,t,who) returning * into r;
  return _j_note(r);
end $$;

create or replace function staff_del_note(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_staff(p_token); delete from member_notes where id=p_id; end $$;

-- 건강 수치 ---------------------------------------------------------------------
create or replace function user_add_measure(p_code text,p_date date,p_weight numeric,p_sbp int,p_dbp int,p_glu int) returns json
language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); r measures;
begin
  if m is null then raise exception 'invalid code'; end if;
  perform _check_measure(p_date,p_weight,p_sbp,p_dbp,p_glu);
  insert into measures(member_id,date,weight,sbp,dbp,glucose) values(m,p_date,round(p_weight,1),p_sbp,p_dbp,p_glu) returning * into r;
  return _j_measure(r);
end $$;

-- 이용자는 자기가 적은 수치만 지울 수 있다
create or replace function user_del_measure(p_code text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then raise exception 'invalid code'; end if;
  delete from measures where id=p_id and member_id=m and author='';
end $$;

create or replace function staff_add_measure(p_token text,p_member uuid,p_date date,p_weight numeric,p_sbp int,p_dbp int,p_glu int) returns json
language plpgsql security definer set search_path=public as $$
declare who text:=_staff_label(p_token); r measures;
begin
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  perform _check_measure(p_date,p_weight,p_sbp,p_dbp,p_glu);
  insert into measures(member_id,date,weight,sbp,dbp,glucose,author) values(p_member,p_date,round(p_weight,1),p_sbp,p_dbp,p_glu,who) returning * into r;
  return _j_measure(r);
end $$;

create or replace function staff_del_measure(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_staff(p_token); delete from measures where id=p_id; end $$;

-- 공지사항 (관리자·트레이너) -----------------------------------------------------------
create or replace function staff_add_notice(p_token text,p_text text,p_until date) returns json
language plpgsql security definer set search_path=public as $$
declare who text:=_staff_label(p_token); t text:=left(trim(coalesce(p_text,'')),300); r notices;
begin
  if t='' then raise exception 'no text'; end if;
  if p_until is not null and p_until<_kst_today() then raise exception 'invalid date'; end if;
  insert into notices(body,author,until) values(t,who,p_until) returning * into r;
  return _j_notice(r);
end $$;

create or replace function staff_del_notice(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_staff(p_token); delete from notices where id=p_id; end $$;

-- 한꺼번에 출석 (수업 대상인 이용자만). 새로 체크한 수를 돌려준다
create or replace function staff_set_attendance_many(p_token text,p_lesson uuid,p_date date,p_members uuid[]) returns int
language plpgsql security definer set search_path=public as $$
declare n int;
begin
  perform _need_staff(p_token);
  if not exists(select 1 from lessons where id=p_lesson) then raise exception 'lesson not found'; end if;
  if p_date is null or p_date>_kst_today() then raise exception 'invalid date'; end if;
  insert into attendance(lesson_id,member_id,date)
    select p_lesson, lm.member_id, p_date from lesson_members lm
    where lm.lesson_id=p_lesson and lm.member_id = any(coalesce(p_members,'{}'))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function _staff_label(text), _j_note(member_notes), _j_measure(measures), _j_notice(notices),
  _check_measure(date,numeric,int,int,int), _extra_data(uuid)
  from public, anon, authenticated;

-- ================= 20261007000000_code_limit.sql =================

-- 나의 건강일지 · 번호 대입 막기 + 영상 파일 올리기 닫기
-- 20261006000000_notes_measures_notices.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 이용자·보호자·트레이너 번호를 한 연결(인터넷 주소)에서 1분 안에 15번 이상 틀리면 5분 동안 번호 입력을 막습니다.
--   막힌 동안에는 맞는 번호도 받지 않으므로 번호를 계속 바꿔 넣어 맞히는 방법이 통하지 않습니다.
--   관리자 로그인은 원래대로 아이디마다 5번 틀리면 10분 잠깁니다.
-- ■ 틀린 기록이 남도록, 기록을 바꾸는 함수는 번호가 틀리면 오류 대신 빈 값(null)을 돌려줍니다 (앱이 알아서 처리).
-- ■ 영상은 유튜브 링크로만 올립니다. 누구나 파일을 올릴 수 있던 저장소 업로드를 닫습니다 (이미 올린 영상은 계속 재생).

-- 틀린 번호 기록 (하루 지난 것은 지운다) ------------------------------------------------
create table if not exists code_fails(
  id bigint generated always as identity primary key,
  ip text not null,
  at timestamptz not null default now());
create index if not exists code_fails_ip_at on code_fails(ip, at);
alter table code_fails enable row level security;

-- 요청한 곳의 인터넷 주소 (Supabase 가 넘겨주는 요청 헤더에서)
create or replace function _client_ip() returns text language sql stable as $$
  select coalesce(nullif(h->>'cf-connecting-ip',''), nullif(h->>'x-real-ip',''),
                  nullif(trim(split_part(h->>'x-forwarded-for',',',1)),''), 'unknown')
  from (select coalesce(nullif(current_setting('request.headers', true),''),'{}')::json h) x $$;

-- 막혔는지: 1분 안에 15번 이상 틀린 때로부터 5분이 지나지 않았으면
create or replace function _code_blocked(p_ip text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from code_fails f
    where f.ip=p_ip and f.at > now()-interval '5 minutes'
      and (select count(*) from code_fails g where g.ip=p_ip and g.at > f.at-interval '1 minute' and g.at <= f.at) >= 15) $$;

create or replace function _code_fail(p_ip text) returns void language plpgsql volatile security definer set search_path=public as $$
begin
  insert into code_fails(ip) values(p_ip);
  delete from code_fails where at < now()-interval '1 day';
end $$;

-- 번호 → 이용자. 막혔으면 오류, 틀리면 기록을 남기고 null
create or replace function _mid(p_code text) returns uuid language plpgsql volatile security definer set search_path=public as $$
declare ip text:=_client_ip(); r uuid;
begin
  if _code_blocked(ip) then raise exception 'too many attempts'; end if;
  select id into r from members where code=upper(regexp_replace(coalesce(p_code,''),'[^A-Za-z0-9]','','g'));
  if r is null then perform _code_fail(ip); end if;
  return r;
end $$;

create or replace function _gid(p_code text) returns uuid language plpgsql volatile security definer set search_path=public as $$
declare ip text:=_client_ip(); r uuid;
begin
  if _code_blocked(ip) then raise exception 'too many attempts'; end if;
  select id into r from members where guardian_code=upper(regexp_replace(coalesce(p_code,''),'[^A-Za-z0-9]','','g'));
  if r is null then perform _code_fail(ip); end if;
  return r;
end $$;

create or replace function trainer_login(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare t trainers; ip text:=_client_ip();
begin
  if _code_blocked(ip) then raise exception 'too many attempts'; end if;
  select * into t from trainers where code=upper(regexp_replace(coalesce(p_code,''),'[^A-Za-z0-9]','','g'));
  if t.id is null then perform _code_fail(ip); return null; end if;
  return json_build_object('token',_new_session('trainer',t.id,24*30),'role','trainer','name',t.name);
end $$;

-- 조회: 틀린 기록을 남겨야 하므로 volatile 로 바꾼다 (내용은 그대로) ------------------------
create or replace function user_get(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then return null; end if;
  return (jsonb_build_object(
    'member',(select _j_member(x) from members x where x.id=m),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x where x.member_id=m),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x where x.member_id=m),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,m) order by p.created_at desc) from programs p
                         join program_members pm on pm.program_id=p.id and pm.member_id=m),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json))
    || _lesson_data(m) || _extra_data(m))::json;
end $$;

create or replace function guardian_get(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare m uuid:=_gid(p_code);
begin
  if m is null then return null; end if;
  return (jsonb_build_object(
    'member',(select json_build_object('id',x.id,'name',x.name,'age',x.age,'birth',to_char(x.birth,'YYYY-MM-DD')) from members x where x.id=m),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x where x.member_id=m),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x where x.member_id=m),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,m) order by p.created_at desc) from programs p
                         join program_members pm on pm.program_id=p.id and pm.member_id=m),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json))
    || _lesson_data(m) || _extra_data(m))::json;
end $$;

-- 기록 바꾸기: 번호가 틀리면 오류 대신 null (오류를 내면 틀린 기록까지 취소되기 때문) -----------------
create or replace function user_add_ex(p_code text,p_date date,p_kind text,p_min int,p_level text,p_memo text) returns json
language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); r exercises;
begin
  if m is null then return null; end if;
  insert into exercises(member_id,date,kind,min,level,memo) values(m,p_date,p_kind,greatest(1,least(p_min,600)),p_level,coalesce(p_memo,'')) returning * into r;
  return _j_ex(r);
end $$;

create or replace function user_add_meal(p_code text,p_date date,p_meal text,p_menu text,p_amount text,p_memo text,
  p_foods jsonb default '[]',p_nutri jsonb default null) returns json
language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); r meals; f jsonb:=_clean_foods(p_foods);
begin
  if m is null then return null; end if;
  insert into meals(member_id,date,meal,menu,amount,memo,foods,nutri)
    values(m,p_date,p_meal,p_menu,p_amount,coalesce(p_memo,''),f,case when jsonb_array_length(f)>0 then _clean_nutri(p_nutri) end)
    returning * into r;
  return _j_meal(r);
end $$;

create or replace function user_add_view(p_code text,p_program uuid,p_date date) returns json language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); p programs; v views; e exercises;
begin
  if m is null then return null; end if;
  select pr.* into p from programs pr join program_members pm on pm.program_id=pr.id and pm.member_id=m where pr.id=p_program;
  if p.id is null then raise exception 'not allowed'; end if;
  insert into views(program_id,member_id,date) values(p.id,m,p_date) returning * into v;
  insert into exercises(member_id,date,kind,min,level,memo,program_id) values(m,p_date,p.kind,p.min,'보통','영상 따라하기 · '||p.title,p.id) returning * into e;
  return json_build_object('view',_j_view(v),'ex',_j_ex(e));
end $$;

create or replace function user_add_measure(p_code text,p_date date,p_weight numeric,p_sbp int,p_dbp int,p_glu int) returns json
language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); r measures;
begin
  if m is null then return null; end if;
  perform _check_measure(p_date,p_weight,p_sbp,p_dbp,p_glu);
  insert into measures(member_id,date,weight,sbp,dbp,glucose) values(m,p_date,round(p_weight,1),p_sbp,p_dbp,p_glu) returning * into r;
  return _j_measure(r);
end $$;

-- 지우기: 번호가 틀리면 아무것도 하지 않는다
create or replace function user_del_ex(p_code text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin if m is not null then delete from exercises where id=p_id and member_id=m; end if; end $$;

create or replace function user_del_meal(p_code text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin if m is not null then delete from meals where id=p_id and member_id=m; end if; end $$;

create or replace function user_del_measure(p_code text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin if m is not null then delete from measures where id=p_id and member_id=m and author=''; end if; end $$;

revoke execute on function _client_ip(), _code_blocked(text), _code_fail(text), _mid(text), _gid(text),
  _j_ex(exercises), _j_meal(meals), _j_member(members), _j_prog(programs,uuid), _j_view(views)
  from public, anon, authenticated;

-- 영상 파일 올리기 닫기 (보기는 그대로) -------------------------------------------------------
drop policy if exists "healthlog video upload" on storage.objects;

-- ================= 20261008000000_tests_photos.sql =================

-- 나의 건강일지 · 체력 측정 · 프로필 사진
-- 20261007000000_code_limit.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 체력 측정: 관리자가 항목(이름·단위·좋아지는 방향)을 만들고, 트레이너만 이용자별 결과를 적습니다.
--   이용자·보호자·관리자는 결과를 보기만 합니다.
-- ■ 프로필 사진: 이용자 사진은 트레이너·관리자가, 트레이너 사진은 트레이너 본인이나 관리자가 올립니다.
--   사진은 앱에서 작게 줄인 JPEG 로 이 데이터베이스에 저장하고, 번호·로그인을 확인하는 함수로만 주고받습니다
--   (누구나 올릴 수 있는 파일 저장소는 쓰지 않습니다).
-- ■ 한마디에 남긴 트레이너를 기록해 이용자 화면에 트레이너 사진이 함께 보입니다.

-- 표 --------------------------------------------------------------------------
create table if not exists test_items(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default '',
  -- high = 높을수록 좋음, low = 낮을수록 좋음, none = 해당 없음
  better text not null default 'high' check (better in ('high','low','none')),
  created_at timestamptz not null default now());

create table if not exists test_results(
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  item_id uuid not null references test_items(id) on delete cascade,
  date date not null,
  value numeric not null,
  author text not null default '',
  created_at timestamptz not null default now(),
  unique(member_id, item_id, date));
create index if not exists test_results_member on test_results(member_id, date);

create table if not exists photos(
  member_id uuid unique references members(id) on delete cascade,
  trainer_id uuid unique references trainers(id) on delete cascade,
  data text not null,
  updated_at timestamptz not null default now(),
  check ((member_id is null) <> (trainer_id is null)));

alter table member_notes add column if not exists author_id uuid;

alter table test_items enable row level security;
alter table test_results enable row level security;
alter table photos enable row level security;

-- 내부 도우미 ---------------------------------------------------------------------
-- 트레이너 로그인 표면 그 트레이너 id. 표가 없으면 'invalid session', 관리자면 'trainer only'
create or replace function _need_trainer(p_token text) returns uuid language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if s.role<>'trainer' then raise exception 'trainer only'; end if;
  return s.subject;
end $$;

create or replace function _j_test_item(i test_items) returns json language sql stable as $$
  select json_build_object('id',i.id,'name',i.name,'unit',i.unit,'better',i.better) $$;

create or replace function _j_test(r test_results) returns json language sql stable as $$
  select json_build_object('id',r.id,'mid',r.member_id,'item',r.item_id,'date',to_char(r.date,'YYYY-MM-DD'),'value',r.value,'by',r.author) $$;

create or replace function _j_note(n member_notes) returns json language sql stable as $$
  select json_build_object('id',n.id,'mid',n.member_id,'text',n.body,'by',n.author,'byId',n.author_id,
    'date',to_char(n.created_at at time zone 'Asia/Seoul','YYYY-MM-DD')) $$;

-- 사진 버전 (바뀐 사진만 다시 받도록). 이용자·보호자에게는 그분 사진과 트레이너 사진만
create or replace function _photo_vers(p_mid uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_object_agg(coalesce(p.member_id,p.trainer_id), to_char(p.updated_at,'YYYYMMDDHH24MISSUS')),'{}'::jsonb)
  from photos p where p_mid is null or p.member_id=p_mid or p.trainer_id is not null $$;

-- 한마디·건강 수치·공지 + 측정 항목·결과·사진 버전. p_mid 가 null 이면 전체(직원용)
create or replace function _extra_data(p_mid uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'notes',coalesce((select json_agg(_j_note(n) order by n.created_at) from member_notes n
        where p_mid is null or n.member_id=p_mid),'[]'::json),
    'measures',coalesce((select json_agg(_j_measure(x) order by x.date, x.created_at) from measures x
        where p_mid is null or x.member_id=p_mid),'[]'::json),
    'notices',coalesce((select json_agg(_j_notice(x) order by x.created_at desc) from notices x
        where x.until is null or x.until >= _kst_today() - case when p_mid is null then 30 else 0 end),'[]'::json),
    'testItems',coalesce((select json_agg(_j_test_item(i) order by i.created_at) from test_items i),'[]'::json),
    'tests',coalesce((select json_agg(_j_test(r) order by r.date, r.created_at) from test_results r
        where p_mid is null or r.member_id=p_mid),'[]'::json),
    'photos',_photo_vers(p_mid)) $$;

-- 직원 조회: 내 id 도 보낸다 (트레이너가 자기 사진을 올릴 때) ------------------------------------
create or replace function staff_get(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions; me text; rk text:='';
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then return null; end if;
  if s.role='admin' then
    select name into me from admins where id=s.subject;
  else
    select name, rank into me, rk from trainers where id=s.subject;
  end if;
  if me is null then return null; end if; -- 지워진 계정
  return (jsonb_build_object(
    'me',json_build_object('role',s.role,'name',me,'rank',coalesce(rk,''),'id',s.subject),
    'members',coalesce((select json_agg(case when s.role='admin' then _j_member_staff(x) else _j_member_trainer(x) end order by x.created_at) from members x),'[]'::json),
    'trainers',case when s.role='admin' then coalesce((select json_agg(_j_trainer(t) order by t.created_at) from trainers t),'[]'::json) end,
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,null) order by p.created_at desc) from programs p),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x),'[]'::json))
    || _lesson_data(null) || _extra_data(null))::json;
end $$;

-- 한마디: 남긴 트레이너 id 도 기록 (관리자는 null)
create or replace function staff_add_note(p_token text,p_member uuid,p_text text) returns json
language plpgsql security definer set search_path=public as $$
declare who text:=_staff_label(p_token); t text:=left(trim(coalesce(p_text,'')),200); r member_notes; tid uuid;
begin
  if t='' then raise exception 'no text'; end if;
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  select subject into tid from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now() and role='trainer';
  insert into member_notes(member_id,body,author,author_id) values(p_member,t,who,tid) returning * into r;
  return _j_note(r);
end $$;

-- 측정 항목 (관리자) --------------------------------------------------------------------
create or replace function _check_test_item(p_name text,p_unit text,p_better text) returns void language plpgsql immutable as $$
begin
  if coalesce(trim(p_name),'')='' then raise exception 'no name'; end if;
  if p_better not in ('high','low','none') then raise exception 'invalid better'; end if;
end $$;

create or replace function admin_add_test_item(p_token text,p_name text,p_unit text,p_better text) returns json
language plpgsql security definer set search_path=public as $$
declare r test_items;
begin
  perform _need_admin(p_token);
  perform _check_test_item(p_name,p_unit,p_better);
  insert into test_items(name,unit,better) values(left(trim(p_name),30),left(trim(coalesce(p_unit,'')),10),p_better) returning * into r;
  return _j_test_item(r);
end $$;

create or replace function admin_update_test_item(p_token text,p_id uuid,p_name text,p_unit text,p_better text) returns json
language plpgsql security definer set search_path=public as $$
declare r test_items;
begin
  perform _need_admin(p_token);
  perform _check_test_item(p_name,p_unit,p_better);
  update test_items set name=left(trim(p_name),30), unit=left(trim(coalesce(p_unit,'')),10), better=p_better where id=p_id returning * into r;
  if r.id is null then raise exception 'item not found'; end if;
  return _j_test_item(r);
end $$;

-- 항목을 지우면 그 항목의 지난 결과도 지워진다
create or replace function admin_del_test_item(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_admin(p_token); delete from test_items where id=p_id; end $$;

-- 측정 결과 (트레이너만) -------------------------------------------------------------------
-- 그 날의 측정을 통째로 저장: p_values = [{item, value}] (값이 없는 항목은 그 날 결과를 지운다)
create or replace function trainer_save_tests(p_token text,p_member uuid,p_date date,p_values jsonb) returns json
language plpgsql security definer set search_path=public as $$
declare who text; x jsonb; v numeric;
begin
  perform _need_trainer(p_token);
  who:=_staff_label(p_token);
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  if p_date is null or p_date>_kst_today() or p_date<_kst_today()-3650 then raise exception 'invalid date'; end if;
  if jsonb_typeof(p_values)<>'array' then raise exception 'invalid values'; end if;
  delete from test_results where member_id=p_member and date=p_date;
  for x in select * from jsonb_array_elements(p_values) loop
    if jsonb_typeof(x->'value')<>'number' then continue; end if;
    v:=(x->>'value')::numeric;
    if v<-100000 or v>100000 then raise exception 'invalid value'; end if;
    if not exists(select 1 from test_items where id=(x->>'item')::uuid) then continue; end if;
    insert into test_results(member_id,item_id,date,value,author) values(p_member,(x->>'item')::uuid,p_date,round(v,2),who)
      on conflict(member_id,item_id,date) do update set value=excluded.value, author=excluded.author;
  end loop;
  return coalesce((select json_agg(_j_test(r) order by r.created_at) from test_results r where r.member_id=p_member and r.date=p_date),'[]'::json);
end $$;

create or replace function trainer_del_tests(p_token text,p_member uuid,p_date date) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_trainer(p_token); delete from test_results where member_id=p_member and date=p_date; end $$;

-- 프로필 사진 ----------------------------------------------------------------------
-- p_kind = 'member' (트레이너·관리자) / 'trainer' (관리자, 또는 트레이너 본인). p_data 가 null 이면 지운다.
-- 새 사진 버전을 돌려준다 (지웠으면 null)
create or replace function staff_set_photo(p_token text,p_kind text,p_id uuid,p_data text) returns text
language plpgsql security definer set search_path=public as $$
declare r text:=_need_staff(p_token); sid uuid; t timestamptz:=now();
begin
  if p_kind='member' then
    if not exists(select 1 from members where id=p_id) then raise exception 'member not found'; end if;
  elsif p_kind='trainer' then
    if not exists(select 1 from trainers where id=p_id) then raise exception 'trainer not found'; end if;
    if r<>'admin' then
      select subject into sid from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
      if sid is distinct from p_id then raise exception 'own photo only'; end if;
    end if;
  else
    raise exception 'invalid kind';
  end if;
  if p_data is null then
    delete from photos where (p_kind='member' and member_id=p_id) or (p_kind='trainer' and trainer_id=p_id);
    return null;
  end if;
  if length(p_data)>120000 or p_data !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$' then raise exception 'invalid photo'; end if;
  if p_kind='member' then
    insert into photos(member_id,data,updated_at) values(p_id,p_data,t) on conflict(member_id) do update set data=excluded.data, updated_at=t;
  else
    insert into photos(trainer_id,data,updated_at) values(p_id,p_data,t) on conflict(trainer_id) do update set data=excluded.data, updated_at=t;
  end if;
  return to_char(t,'YYYYMMDDHH24MISSUS');
end $$;

-- 사진 받기: {id: data}
create or replace function staff_photos(p_token text,p_ids uuid[]) returns json language plpgsql stable security definer set search_path=public as $$
begin
  perform _need_staff(p_token);
  return coalesce((select json_object_agg(coalesce(p.member_id,p.trainer_id),p.data) from photos p
    where coalesce(p.member_id,p.trainer_id) = any(coalesce(p_ids,'{}'))),'{}'::json);
end $$;

-- 이용자·보호자: 그분 사진과 트레이너 사진만 (번호가 틀리면 null)
create or replace function user_photos(p_code text,p_ids uuid[]) returns json language plpgsql volatile security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then return null; end if;
  return coalesce((select json_object_agg(coalesce(p.member_id,p.trainer_id),p.data) from photos p
    where coalesce(p.member_id,p.trainer_id) = any(coalesce(p_ids,'{}')) and (p.member_id=m or p.trainer_id is not null)),'{}'::json);
end $$;

create or replace function guardian_photos(p_code text,p_ids uuid[]) returns json language plpgsql volatile security definer set search_path=public as $$
declare m uuid:=_gid(p_code);
begin
  if m is null then return null; end if;
  return coalesce((select json_object_agg(coalesce(p.member_id,p.trainer_id),p.data) from photos p
    where coalesce(p.member_id,p.trainer_id) = any(coalesce(p_ids,'{}')) and (p.member_id=m or p.trainer_id is not null)),'{}'::json);
end $$;

revoke execute on function _need_trainer(text), _j_test_item(test_items), _j_test(test_results), _j_note(member_notes),
  _photo_vers(uuid), _extra_data(uuid), _check_test_item(text,text,text)
  from public, anon, authenticated;

-- ================= 20261009000000_test_categories.sql =================

-- 나의 건강일지 · 체력 측정 분류 + 글로 적는 항목
-- 20261008000000_tests_photos.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 측정 항목을 분류로 나눕니다. 기본 분류 7개를 넣고, 관리자가 분류 이름을 고치거나 새 분류를 만들 수 있습니다.
--   신체징후(Vital Sign) · 신체구성(Body comp.) · 자율신경(HRV, 혈관건강) · 관절가동성(ROM) · 기초·기능 평가 · 체형분석 · 보행평가
-- ■ 항목은 숫자(예: 악력 kg) 또는 글(예: 체형 소견)로 적을 수 있습니다.
-- ■ 이미 만든 항목은 「분류 없음」에 있으니 관리자 화면에서 분류를 골라 주세요.

-- 표 --------------------------------------------------------------------------
create table if not exists test_categories(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now());
alter table test_categories enable row level security;

insert into test_categories(name,sort)
select v.name, v.sort from (values
  ('신체징후(Vital Sign)',1), ('신체구성(Body comp.)',2), ('자율신경(HRV, 혈관건강)',3), ('관절가동성(ROM)',4),
  ('기초·기능 평가',5), ('체형분석',6), ('보행평가',7)) v(name,sort)
where not exists(select 1 from test_categories);

alter table test_items add column if not exists category_id uuid references test_categories(id) on delete set null;
-- number = 숫자, text = 글 (소견)
alter table test_items add column if not exists kind text not null default 'number';
do $$ begin
  alter table test_items add constraint test_items_kind check (kind in ('number','text'));
exception when duplicate_object then null; end $$;

alter table test_results alter column value drop not null;
alter table test_results add column if not exists text text;
do $$ begin
  alter table test_results add constraint test_results_has_value check (value is not null or coalesce(text,'')<>'');
exception when duplicate_object then null; end $$;

-- JSON --------------------------------------------------------------------------
create or replace function _j_test_category(c test_categories) returns json language sql stable as $$
  select json_build_object('id',c.id,'name',c.name,'sort',c.sort) $$;

create or replace function _j_test_item(i test_items) returns json language sql stable as $$
  select json_build_object('id',i.id,'name',i.name,'unit',i.unit,'better',i.better,'category',i.category_id,'kind',i.kind) $$;

create or replace function _j_test(r test_results) returns json language sql stable as $$
  select json_build_object('id',r.id,'mid',r.member_id,'item',r.item_id,'date',to_char(r.date,'YYYY-MM-DD'),
    'value',r.value,'text',r.text,'by',r.author) $$;

-- 한마디·건강 수치·공지 + 측정 분류·항목·결과·사진 버전. p_mid 가 null 이면 전체(직원용)
create or replace function _extra_data(p_mid uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'notes',coalesce((select json_agg(_j_note(n) order by n.created_at) from member_notes n
        where p_mid is null or n.member_id=p_mid),'[]'::json),
    'measures',coalesce((select json_agg(_j_measure(x) order by x.date, x.created_at) from measures x
        where p_mid is null or x.member_id=p_mid),'[]'::json),
    'notices',coalesce((select json_agg(_j_notice(x) order by x.created_at desc) from notices x
        where x.until is null or x.until >= _kst_today() - case when p_mid is null then 30 else 0 end),'[]'::json),
    'testCategories',coalesce((select json_agg(_j_test_category(c) order by c.sort, c.created_at) from test_categories c),'[]'::json),
    'testItems',coalesce((select json_agg(_j_test_item(i) order by i.created_at) from test_items i),'[]'::json),
    'tests',coalesce((select json_agg(_j_test(r) order by r.date, r.created_at) from test_results r
        where p_mid is null or r.member_id=p_mid),'[]'::json),
    'photos',_photo_vers(p_mid)) $$;

-- 분류 (관리자) ------------------------------------------------------------------
create or replace function admin_add_test_category(p_token text,p_name text) returns json
language plpgsql security definer set search_path=public as $$
declare r test_categories;
begin
  perform _need_admin(p_token);
  if coalesce(trim(p_name),'')='' then raise exception 'no name'; end if;
  insert into test_categories(name,sort) values(left(trim(p_name),40),coalesce((select max(sort) from test_categories),0)+1) returning * into r;
  return _j_test_category(r);
end $$;

create or replace function admin_update_test_category(p_token text,p_id uuid,p_name text) returns json
language plpgsql security definer set search_path=public as $$
declare r test_categories;
begin
  perform _need_admin(p_token);
  if coalesce(trim(p_name),'')='' then raise exception 'no name'; end if;
  update test_categories set name=left(trim(p_name),40) where id=p_id returning * into r;
  if r.id is null then raise exception 'category not found'; end if;
  return _j_test_category(r);
end $$;

-- 항목이 남아 있는 분류는 지우지 않는다
create or replace function admin_del_test_category(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform _need_admin(p_token);
  if exists(select 1 from test_items where category_id=p_id) then raise exception 'category not empty'; end if;
  delete from test_categories where id=p_id;
end $$;

-- 항목 (관리자): 분류·종류(숫자/글)를 함께 받는다 --------------------------------------------
drop function if exists admin_add_test_item(text,text,text,text);
drop function if exists admin_update_test_item(text,uuid,text,text,text);

create or replace function _check_test_item(p_name text,p_unit text,p_better text) returns void language plpgsql immutable as $$
begin
  if coalesce(trim(p_name),'')='' then raise exception 'no name'; end if;
  if p_better not in ('high','low','none') then raise exception 'invalid better'; end if;
end $$;

create or replace function admin_add_test_item(p_token text,p_name text,p_unit text,p_better text,p_category uuid,p_kind text) returns json
language plpgsql security definer set search_path=public as $$
declare r test_items; k text:=case when p_kind='text' then 'text' else 'number' end;
begin
  perform _need_admin(p_token);
  perform _check_test_item(p_name,p_unit,p_better);
  if p_category is not null and not exists(select 1 from test_categories where id=p_category) then raise exception 'category not found'; end if;
  insert into test_items(name,unit,better,category_id,kind)
    values(left(trim(p_name),30),case when k='text' then '' else left(trim(coalesce(p_unit,'')),10) end,
           case when k='text' then 'none' else p_better end,p_category,k) returning * into r;
  return _j_test_item(r);
end $$;

-- 종류는 바꾸지 않는다 (이미 적은 결과와 맞지 않게 되므로)
create or replace function admin_update_test_item(p_token text,p_id uuid,p_name text,p_unit text,p_better text,p_category uuid) returns json
language plpgsql security definer set search_path=public as $$
declare r test_items;
begin
  perform _need_admin(p_token);
  perform _check_test_item(p_name,p_unit,p_better);
  if p_category is not null and not exists(select 1 from test_categories where id=p_category) then raise exception 'category not found'; end if;
  update test_items set name=left(trim(p_name),30),
    unit=case when kind='text' then '' else left(trim(coalesce(p_unit,'')),10) end,
    better=case when kind='text' then 'none' else p_better end, category_id=p_category
  where id=p_id returning * into r;
  if r.id is null then raise exception 'item not found'; end if;
  return _j_test_item(r);
end $$;

-- 결과 (트레이너만): p_values = [{item, value}] 또는 글 항목은 [{item, text}] ----------------------
create or replace function trainer_save_tests(p_token text,p_member uuid,p_date date,p_values jsonb) returns json
language plpgsql security definer set search_path=public as $$
declare who text; x jsonb; v numeric; t text; it test_items;
begin
  perform _need_trainer(p_token);
  who:=_staff_label(p_token);
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  if p_date is null or p_date>_kst_today() or p_date<_kst_today()-3650 then raise exception 'invalid date'; end if;
  if jsonb_typeof(p_values)<>'array' then raise exception 'invalid values'; end if;
  delete from test_results where member_id=p_member and date=p_date;
  for x in select * from jsonb_array_elements(p_values) loop
    select * into it from test_items where id=(x->>'item')::uuid;
    if it.id is null then continue; end if;
    if it.kind='text' then
      t:=left(trim(coalesce(x->>'text','')),200);
      if t='' then continue; end if;
      insert into test_results(member_id,item_id,date,text,author) values(p_member,it.id,p_date,t,who)
        on conflict(member_id,item_id,date) do update set text=excluded.text, value=null, author=excluded.author;
    else
      if jsonb_typeof(x->'value') is distinct from 'number' then continue; end if;
      v:=(x->>'value')::numeric;
      if v<-100000 or v>100000 then raise exception 'invalid value'; end if;
      insert into test_results(member_id,item_id,date,value,author) values(p_member,it.id,p_date,round(v,2),who)
        on conflict(member_id,item_id,date) do update set value=excluded.value, text=null, author=excluded.author;
    end if;
  end loop;
  return coalesce((select json_agg(_j_test(r) order by r.created_at) from test_results r where r.member_id=p_member and r.date=p_date),'[]'::json);
end $$;

revoke execute on function _j_test_category(test_categories), _j_test_item(test_items), _j_test(test_results),
  _extra_data(uuid), _check_test_item(text,text,text)
  from public, anon, authenticated;

-- ================= 20261010000000_profiles.sql =================

-- 맞춤 건강관리 · 프로필 (본인이 직접 고치기)
-- 20261009000000_test_categories.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 이용자·보호자·트레이너·관리자 모두 자기 프로필 사진을 직접 올리고 바꿀 수 있습니다.
-- ■ 이용자 사진은 트레이너·관리자도 바꿀 수 있습니다.
-- ■ 트레이너·관리자 사진은 로그인한 본인만 바꿀 수 있습니다 (관리자도 트레이너 사진은 못 바꿈).
-- ■ 보호자는 사진과 관계(예: 딸, 아들)를 적을 수 있고, 트레이너·관리자가 이용자 화면에서 봅니다.
--   보호자 번호를 새로 발급하면 예전 보호자의 사진·관계는 지워집니다.

-- 표 --------------------------------------------------------------------------
alter table members add column if not exists guardian_relation text not null default '';

alter table photos add column if not exists admin_id uuid unique references admins(id) on delete cascade;
-- 보호자 사진: 그 보호자가 돌보는 이용자 id 로 저장 (보호자는 계정이 따로 없다)
alter table photos add column if not exists guardian_mid uuid unique references members(id) on delete cascade;
alter table photos drop constraint if exists photos_check;
do $$ begin
  alter table photos add constraint photos_one_owner check (num_nonnulls(member_id,trainer_id,admin_id,guardian_mid)=1);
exception when duplicate_object then null; end $$;

-- 내부 도우미 ---------------------------------------------------------------------
-- 앱에서 쓰는 사진 id: 이용자·트레이너·관리자는 그 id, 보호자는 'g'+이용자 id
create or replace function _photo_key(p photos) returns text language sql immutable as $$
  select coalesce(p.member_id::text, p.trainer_id::text, p.admin_id::text, 'g'||p.guardian_mid::text) $$;

create or replace function _check_photo(p_data text) returns void language plpgsql immutable as $$
begin
  if length(p_data)>120000 or p_data !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$' then raise exception 'invalid photo'; end if;
end $$;

create or replace function _photo_ver(t timestamptz) returns text language sql immutable as $$
  select to_char(t,'YYYYMMDDHH24MISSUS') $$;

-- 사진 넣기·지우기 (주인 한 명). 새 버전을 돌려준다 (지웠으면 null)
create or replace function _put_photo(p_kind text,p_id uuid,p_data text) returns text
language plpgsql volatile security definer set search_path=public as $$
declare t timestamptz:=now();
begin
  if p_data is null then
    delete from photos where (p_kind='member' and member_id=p_id) or (p_kind='trainer' and trainer_id=p_id)
      or (p_kind='admin' and admin_id=p_id) or (p_kind='guardian' and guardian_mid=p_id);
    return null;
  end if;
  perform _check_photo(p_data);
  if p_kind='member' then
    insert into photos(member_id,data,updated_at) values(p_id,p_data,t) on conflict(member_id) do update set data=excluded.data, updated_at=t;
  elsif p_kind='trainer' then
    insert into photos(trainer_id,data,updated_at) values(p_id,p_data,t) on conflict(trainer_id) do update set data=excluded.data, updated_at=t;
  elsif p_kind='admin' then
    insert into photos(admin_id,data,updated_at) values(p_id,p_data,t) on conflict(admin_id) do update set data=excluded.data, updated_at=t;
  else
    insert into photos(guardian_mid,data,updated_at) values(p_id,p_data,t) on conflict(guardian_mid) do update set data=excluded.data, updated_at=t;
  end if;
  return _photo_ver(t);
end $$;

-- 사진 버전. 직원(p_mid null)은 전부, 이용자·보호자는 그분·그분 보호자·트레이너 사진만
create or replace function _photo_vers(p_mid uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_object_agg(_photo_key(p), _photo_ver(p.updated_at)),'{}'::jsonb)
  from photos p where p_mid is null or p.member_id=p_mid or p.guardian_mid=p_mid or p.trainer_id is not null $$;

-- 보호자 관계 [{mid, relation}] (적은 것만)
create or replace function _guardians(p_mid uuid) returns json language sql stable security definer set search_path=public as $$
  select coalesce(json_agg(json_build_object('mid',m.id,'relation',m.guardian_relation) order by m.created_at),'[]'::json)
  from members m where m.guardian_relation<>'' and (p_mid is null or m.id=p_mid) $$;

create or replace function _extra_data(p_mid uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'notes',coalesce((select json_agg(_j_note(n) order by n.created_at) from member_notes n
        where p_mid is null or n.member_id=p_mid),'[]'::json),
    'measures',coalesce((select json_agg(_j_measure(x) order by x.date, x.created_at) from measures x
        where p_mid is null or x.member_id=p_mid),'[]'::json),
    'notices',coalesce((select json_agg(_j_notice(x) order by x.created_at desc) from notices x
        where x.until is null or x.until >= _kst_today() - case when p_mid is null then 30 else 0 end),'[]'::json),
    'testCategories',coalesce((select json_agg(_j_test_category(c) order by c.sort, c.created_at) from test_categories c),'[]'::json),
    'testItems',coalesce((select json_agg(_j_test_item(i) order by i.created_at) from test_items i),'[]'::json),
    'tests',coalesce((select json_agg(_j_test(r) order by r.date, r.created_at) from test_results r
        where p_mid is null or r.member_id=p_mid),'[]'::json),
    'photos',_photo_vers(p_mid),
    'guardians',_guardians(p_mid)) $$;

-- 직원 사진 -----------------------------------------------------------------------
-- p_kind = 'member' (트레이너·관리자 누구나) / 'trainer' (트레이너 본인만) / 'admin' (관리자 본인만)
create or replace function staff_set_photo(p_token text,p_kind text,p_id uuid,p_data text) returns text
language plpgsql security definer set search_path=public as $$
declare s staff_sessions;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if p_kind='member' then
    if not exists(select 1 from members where id=p_id) then raise exception 'member not found'; end if;
  elsif p_kind in ('trainer','admin') then
    if s.role<>p_kind or s.subject is distinct from p_id then raise exception 'own photo only'; end if;
  else
    raise exception 'invalid kind';
  end if;
  return _put_photo(p_kind,p_id,p_data);
end $$;

drop function if exists staff_photos(text,uuid[]);
drop function if exists user_photos(text,uuid[]);
drop function if exists guardian_photos(text,uuid[]);

-- 사진 받기: {id: data}
create or replace function staff_photos(p_token text,p_ids text[]) returns json language plpgsql stable security definer set search_path=public as $$
begin
  perform _need_staff(p_token);
  return coalesce((select json_object_agg(_photo_key(p),p.data) from photos p where _photo_key(p) = any(coalesce(p_ids,'{}'))),'{}'::json);
end $$;

-- 이용자·보호자: 그분·그분 보호자·트레이너 사진만 (번호가 틀리면 null)
create or replace function user_photos(p_code text,p_ids text[]) returns json language plpgsql volatile security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then return null; end if;
  return coalesce((select json_object_agg(_photo_key(p),p.data) from photos p
    where _photo_key(p) = any(coalesce(p_ids,'{}')) and (p.member_id=m or p.guardian_mid=m or p.trainer_id is not null)),'{}'::json);
end $$;

create or replace function guardian_photos(p_code text,p_ids text[]) returns json language plpgsql volatile security definer set search_path=public as $$
declare m uuid:=_gid(p_code);
begin
  if m is null then return null; end if;
  return coalesce((select json_object_agg(_photo_key(p),p.data) from photos p
    where _photo_key(p) = any(coalesce(p_ids,'{}')) and (p.member_id=m or p.guardian_mid=m or p.trainer_id is not null)),'{}'::json);
end $$;

-- 본인 프로필 (이용자·보호자) ----------------------------------------------------------
-- 번호가 틀리면 null, 맞으면 {v: 새 버전 또는 null(지움)}
create or replace function user_set_photo(p_code text,p_data text) returns json language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then return null; end if;
  return json_build_object('v',_put_photo('member',m,p_data));
end $$;

create or replace function guardian_set_photo(p_code text,p_data text) returns json language plpgsql security definer set search_path=public as $$
declare m uuid:=_gid(p_code);
begin
  if m is null then return null; end if;
  return json_build_object('v',_put_photo('guardian',m,p_data));
end $$;

-- 관계: 예) 딸, 아들, 배우자 (비우면 지움)
create or replace function guardian_set_relation(p_code text,p_relation text) returns json language plpgsql security definer set search_path=public as $$
declare m uuid:=_gid(p_code); r text:=left(trim(regexp_replace(coalesce(p_relation,''),'\s+',' ','g')),20);
begin
  if m is null then return null; end if;
  update members set guardian_relation=r where id=m;
  return json_build_object('relation',r);
end $$;

-- 보호자 번호를 새로 주면 예전 보호자의 사진·관계는 지운다 ---------------------------------------
create or replace function staff_new_guardian_code(p_token text,p_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare c text;
begin
  perform _need_admin(p_token);
  update members set guardian_code=_new_code(), guardian_relation='' where id=p_id returning guardian_code into c;
  if c is not null then delete from photos where guardian_mid=p_id; end if;
  return c;
end $$;

revoke execute on function _photo_key(photos), _check_photo(text), _photo_ver(timestamptz), _put_photo(text,uuid,text),
  _photo_vers(uuid), _guardians(uuid), _extra_data(uuid)
  from public, anon, authenticated;

-- ================= 20261011000000_chat.sql =================

-- 맞춤 건강관리 · 대화 (이용자 ↔ 트레이너 글 채팅)
-- 20261010000000_profiles.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 이용자마다 대화방이 하나 있고, 트레이너 누구나 답할 수 있습니다. 관리자는 대화 내용을 보기만 합니다.
-- ■ 새 메시지가 오면 Supabase 실시간으로 "새 메시지가 왔어요" 신호(초인종)만 보냅니다. 내용은 보내지 않고,
--   앱이 번호·로그인을 확인하는 함수로 가져옵니다. 신호 채널 이름은 추측할 수 없는 무작위 값입니다.
-- ■ 메시지는 1년이 지나면 지워집니다.

-- 표 --------------------------------------------------------------------------
create table if not exists chat_messages(
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  -- member = 이용자가 보냄, trainer = 트레이너가 보냄
  sender text not null check (sender in ('member','trainer')),
  trainer_id uuid references trainers(id) on delete set null,
  author text not null default '',
  body text not null check (length(body) between 1 and 500),
  created_at timestamptz not null default now());
create index if not exists chat_messages_member on chat_messages(member_id, created_at);
create index if not exists chat_messages_created on chat_messages(created_at);
alter table chat_messages enable row level security;

-- 트레이너마다 이용자별로 어디까지 읽었나
create table if not exists chat_reads(
  trainer_id uuid not null references trainers(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (trainer_id, member_id));
alter table chat_reads enable row level security;

alter table members add column if not exists chat_read_at timestamptz;
-- 이용자 초인종 채널 이름 (무작위)
alter table members add column if not exists chat_key text not null default encode(extensions.gen_random_bytes(16),'hex');

-- 직원 초인종 채널 이름 (무작위, 한 번만 만든다)
insert into settings(key,value) values('chat_staff_key', encode(extensions.gen_random_bytes(16),'hex')) on conflict (key) do nothing;

-- 내부 도우미 ---------------------------------------------------------------------
create or replace function _chat_at(t timestamptz) returns text language sql immutable as $$
  select to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') $$;

create or replace function _j_chat(c chat_messages) returns json language sql stable as $$
  select json_build_object('id',c.id,'mid',c.member_id,'from',c.sender,'tid',c.trainer_id,'by',c.author,'text',c.body,'at',_chat_at(c.created_at)) $$;

create or replace function _chat_staff_key() returns text language sql stable security definer set search_path=public as $$
  select value from settings where key='chat_staff_key' $$;

-- 대화 가져오기: p_after 뒤의 새 메시지, 또는 p_before 앞의 예전 메시지 50개, 둘 다 없으면 최근 50개 (시간 순서대로).
-- 같은 시각에 저장된 메시지를 놓치지 않도록 경계 시각의 메시지도 함께 보낸다 (앱에서 id 로 겹친 것을 뺀다)
create or replace function _chat_page(p_mid uuid,p_after timestamptz,p_before timestamptz) returns json
language sql stable security definer set search_path=public as $$
  select coalesce(json_agg(_j_chat(x) order by x.created_at),'[]'::json) from (
    select * from chat_messages c where c.member_id=p_mid
      and (p_after is null or c.created_at>=p_after) and (p_before is null or c.created_at<=p_before)
    order by case when p_after is null then c.created_at end desc, c.created_at
    limit case when p_after is null then 50 else 500 end) x $$;

-- 메시지 저장 + 1년 지난 메시지 지우기
create or replace function _chat_put(p_mid uuid,p_sender text,p_tid uuid,p_author text,p_text text) returns chat_messages
language plpgsql volatile security definer set search_path=public as $$
declare t text:=left(trim(coalesce(p_text,'')),500); r chat_messages;
begin
  if t='' then raise exception 'no text'; end if;
  insert into chat_messages(member_id,sender,trainer_id,author,body) values(p_mid,p_sender,p_tid,coalesce(p_author,''),t) returning * into r;
  delete from chat_messages where created_at < now()-interval '1 year';
  return r;
end $$;

-- 초인종: 새 메시지가 생기면 그 이용자 채널과 직원 채널에 빈 신호만 보낸다.
-- 실시간이 꺼져 있거나 실패해도 메시지 저장은 그대로 된다 (앱은 가끔 직접 확인도 한다)
create or replace function _chat_ring() returns trigger language plpgsql security definer set search_path=public as $$
declare k text;
begin
  select chat_key into k from members where id=new.member_id;
  begin
    perform realtime.send('{}'::jsonb,'ring','hl-chat-'||k,false);
    perform realtime.send('{}'::jsonb,'ring','hl-staff-'||_chat_staff_key(),false);
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists chat_ring on chat_messages;
create trigger chat_ring after insert on chat_messages for each row execute function _chat_ring();

-- 이용자 ----------------------------------------------------------------------
-- 안 읽은 수와 초인종 채널 (번호가 틀리면 null)
create or replace function user_chat_status(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare m members;
begin
  select * into m from members where id=_mid(p_code);
  if m.id is null then return null; end if;
  return json_build_object('key','hl-chat-'||m.chat_key,
    'unread',(select count(*) from chat_messages c where c.member_id=m.id and c.sender='trainer' and c.created_at>coalesce(m.chat_read_at,'-infinity')));
end $$;

-- 대화 보기 (보면 읽은 것으로)
create or replace function user_chat_get(p_code text,p_after timestamptz default null,p_before timestamptz default null) returns json
language plpgsql volatile security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then return null; end if;
  if p_before is null then update members set chat_read_at=now() where id=m; end if;
  return _chat_page(m,p_after,p_before);
end $$;

create or replace function user_chat_send(p_code text,p_text text) returns json language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); r chat_messages;
begin
  if m is null then return null; end if;
  r:=_chat_put(m,'member',null,'',p_text);
  update members set chat_read_at=now() where id=m;
  return _j_chat(r);
end $$;

-- 트레이너·관리자 -------------------------------------------------------------------
-- 대화방 목록: 이용자마다 마지막 메시지와 (트레이너는) 안 읽은 수. 직원 초인종 채널도 함께
create or replace function staff_chat_list(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  return json_build_object('key','hl-staff-'||_chat_staff_key(),
    'rooms',coalesce((select json_agg(json_build_object('mid',l.member_id,'last',_j_chat(l),
        'unread',case when s.role='trainer' then (select count(*) from chat_messages c where c.member_id=l.member_id and c.sender='member'
            and c.created_at>coalesce((select read_at from chat_reads r where r.trainer_id=s.subject and r.member_id=l.member_id),'-infinity')) else 0 end)
        order by l.created_at desc)
      from (select distinct on (member_id) * from chat_messages order by member_id, created_at desc) l),'[]'::json));
end $$;

-- 대화 보기. 트레이너가 보면 읽은 것으로 (관리자는 보기만)
create or replace function staff_chat_get(p_token text,p_member uuid,p_after timestamptz default null,p_before timestamptz default null) returns json
language plpgsql volatile security definer set search_path=public as $$
declare s staff_sessions;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  if s.role='trainer' and p_before is null then
    insert into chat_reads(trainer_id,member_id,read_at) values(s.subject,p_member,now())
      on conflict(trainer_id,member_id) do update set read_at=excluded.read_at;
  end if;
  return _chat_page(p_member,p_after,p_before);
end $$;

-- 보내기는 트레이너만
create or replace function trainer_chat_send(p_token text,p_member uuid,p_text text) returns json language plpgsql security definer set search_path=public as $$
declare tid uuid:=_need_trainer(p_token); r chat_messages;
begin
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  r:=_chat_put(p_member,'trainer',tid,_staff_label(p_token),p_text);
  insert into chat_reads(trainer_id,member_id,read_at) values(tid,p_member,now())
    on conflict(trainer_id,member_id) do update set read_at=excluded.read_at;
  return _j_chat(r);
end $$;

revoke execute on function _chat_at(timestamptz), _j_chat(chat_messages), _chat_staff_key(), _chat_page(uuid,timestamptz,timestamptz),
  _chat_put(uuid,text,uuid,text,text), _chat_ring()
  from public, anon, authenticated;

-- ================= 20261012000000_chat_status_fix.sql =================

-- 맞춤 건강관리 · 대화 안 읽은 수 고침
-- 20261011000000_chat.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ user_chat_status 가 번호 확인(_mid)을 이용자 수만큼 되풀이해서, 틀린 번호 한 번이 여러 번 틀린 것으로
--   세어져 곧바로 'too many attempts' 가 나던 것을 고칩니다. 번호는 한 번만 확인합니다.

create or replace function user_chat_status(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare mid uuid:=_mid(p_code); m members;
begin
  if mid is null then return null; end if;
  select * into m from members where id=mid;
  return json_build_object('key','hl-chat-'||m.chat_key,
    'unread',(select count(*) from chat_messages c where c.member_id=m.id and c.sender='trainer' and c.created_at>coalesce(m.chat_read_at,'-infinity')));
end $$;

-- ================= 20261013000000_assign_trainer.sql =================

-- 맞춤 건강관리 · 담당 트레이너 배정 + 담당과만 대화
-- 20261012000000_chat_status_fix.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 관리자가 이용자마다 담당 트레이너 한 명을 정합니다 (이용자 카드의 더보기 → 담당 트레이너).
-- ■ 대화는 이용자와 담당 트레이너만 합니다. 담당이 아닌 트레이너는 그 대화를 보지 못하고, 관리자는 모든 대화를 보기만 합니다.
--   담당을 바꾸면 새 담당 트레이너가 지난 대화도 이어서 봅니다 (지난 메시지는 읽은 것으로 칩니다).
-- ■ 담당 트레이너가 없는 이용자는 대화를 보낼 수 없습니다 (앱에 안내가 나옵니다).
-- ■ 새 메시지 신호(초인종)는 그 이용자, 담당 트레이너, 관리자에게만 갑니다.

-- 표 --------------------------------------------------------------------------
alter table members add column if not exists trainer_id uuid references trainers(id) on delete set null;
create index if not exists members_trainer on members(trainer_id);
-- 트레이너 초인종 채널 이름 (무작위)
alter table trainers add column if not exists chat_key text not null default encode(extensions.gen_random_bytes(16),'hex');

-- 담당: {이용자 id: 트레이너 id} (p_mid 가 null 이면 전체, 아니면 그분만)
create or replace function _assign(p_mid uuid) returns json language sql stable security definer set search_path=public as $$
  select coalesce(json_object_agg(m.id, m.trainer_id),'{}'::json) from members m
  where m.trainer_id is not null and (p_mid is null or m.id=p_mid) $$;

create or replace function _extra_data(p_mid uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'notes',coalesce((select json_agg(_j_note(n) order by n.created_at) from member_notes n
        where p_mid is null or n.member_id=p_mid),'[]'::json),
    'measures',coalesce((select json_agg(_j_measure(x) order by x.date, x.created_at) from measures x
        where p_mid is null or x.member_id=p_mid),'[]'::json),
    'notices',coalesce((select json_agg(_j_notice(x) order by x.created_at desc) from notices x
        where x.until is null or x.until >= _kst_today() - case when p_mid is null then 30 else 0 end),'[]'::json),
    'testCategories',coalesce((select json_agg(_j_test_category(c) order by c.sort, c.created_at) from test_categories c),'[]'::json),
    'testItems',coalesce((select json_agg(_j_test_item(i) order by i.created_at) from test_items i),'[]'::json),
    'tests',coalesce((select json_agg(_j_test(r) order by r.date, r.created_at) from test_results r
        where p_mid is null or r.member_id=p_mid),'[]'::json),
    'photos',_photo_vers(p_mid),
    'guardians',_guardians(p_mid),
    'assign',_assign(p_mid)) $$;

-- 담당 정하기 (관리자). p_trainer 가 null 이면 담당 없음
create or replace function admin_set_member_trainer(p_token text,p_member uuid,p_trainer uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform _need_admin(p_token);
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  if p_trainer is not null and not exists(select 1 from trainers where id=p_trainer) then raise exception 'trainer not found'; end if;
  update members set trainer_id=p_trainer where id=p_member;
  -- 새 담당에게 지난 메시지가 모두 안 읽음으로 쌓이지 않게
  if p_trainer is not null then
    insert into chat_reads(trainer_id,member_id,read_at) values(p_trainer,p_member,now())
      on conflict(trainer_id,member_id) do nothing;
  end if;
end $$;

-- 초인종: 이용자 · 담당 트레이너 · 관리자 채널에만 ----------------------------------------
create or replace function _chat_ring() returns trigger language plpgsql security definer set search_path=public as $$
declare mk text; tk text;
begin
  select m.chat_key, t.chat_key into mk, tk from members m left join trainers t on t.id=m.trainer_id where m.id=new.member_id;
  begin
    perform realtime.send('{}'::jsonb,'ring','hl-chat-'||mk,false);
    if tk is not null then perform realtime.send('{}'::jsonb,'ring','hl-tr-'||tk,false); end if;
    perform realtime.send('{}'::jsonb,'ring','hl-staff-'||_chat_staff_key(),false);
  exception when others then null;
  end;
  return new;
end $$;

-- 이용자: 담당 트레이너도 함께 (없으면 null) --------------------------------------------
create or replace function user_chat_status(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare mid uuid:=_mid(p_code); m members; t trainers;
begin
  if mid is null then return null; end if;
  select * into m from members where id=mid;
  select * into t from trainers where id=m.trainer_id;
  return json_build_object('key','hl-chat-'||m.chat_key,
    'unread',(select count(*) from chat_messages c where c.member_id=m.id and c.sender='trainer' and c.created_at>coalesce(m.chat_read_at,'-infinity')),
    'trainer',case when t.id is null then null else json_build_object('id',t.id,'name',t.name,'rank',coalesce(t.rank,'')) end);
end $$;

-- 담당 트레이너가 없으면 보낼 수 없다
create or replace function user_chat_send(p_code text,p_text text) returns json language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); r chat_messages;
begin
  if m is null then return null; end if;
  if not exists(select 1 from members where id=m and trainer_id is not null) then raise exception 'no trainer'; end if;
  r:=_chat_put(m,'member',null,'',p_text);
  update members set chat_read_at=now() where id=m;
  return _j_chat(r);
end $$;

-- 직원: 트레이너는 담당 이용자 대화만, 관리자는 모두 (보기만) -----------------------------------
create or replace function staff_chat_list(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions; k text;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if s.role='trainer' then
    select 'hl-tr-'||chat_key into k from trainers where id=s.subject;
  else
    k:='hl-staff-'||_chat_staff_key();
  end if;
  return json_build_object('key',k,
    'rooms',coalesce((select json_agg(json_build_object('mid',l.member_id,'last',_j_chat(l),
        'unread',case when s.role='trainer' then (select count(*) from chat_messages c where c.member_id=l.member_id and c.sender='member'
            and c.created_at>coalesce((select read_at from chat_reads r where r.trainer_id=s.subject and r.member_id=l.member_id),'-infinity')) else 0 end)
        order by l.created_at desc)
      from (select distinct on (c.member_id) c.* from chat_messages c join members m on m.id=c.member_id
            where s.role='admin' or m.trainer_id=s.subject
            order by c.member_id, c.created_at desc) l),'[]'::json));
end $$;

-- 트레이너가 담당인지 (아니면 오류)
create or replace function _need_assigned(p_trainer uuid,p_member uuid) returns void language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  if not exists(select 1 from members where id=p_member and trainer_id=p_trainer) then raise exception 'not assigned'; end if;
end $$;

create or replace function staff_chat_get(p_token text,p_member uuid,p_after timestamptz default null,p_before timestamptz default null) returns json
language plpgsql volatile security definer set search_path=public as $$
declare s staff_sessions;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if s.role='trainer' then
    perform _need_assigned(s.subject,p_member);
    if p_before is null then
      insert into chat_reads(trainer_id,member_id,read_at) values(s.subject,p_member,now())
        on conflict(trainer_id,member_id) do update set read_at=excluded.read_at;
    end if;
  elsif not exists(select 1 from members where id=p_member) then
    raise exception 'member not found';
  end if;
  return _chat_page(p_member,p_after,p_before);
end $$;

create or replace function trainer_chat_send(p_token text,p_member uuid,p_text text) returns json language plpgsql security definer set search_path=public as $$
declare tid uuid:=_need_trainer(p_token); r chat_messages;
begin
  perform _need_assigned(tid,p_member);
  r:=_chat_put(p_member,'trainer',tid,_staff_label(p_token),p_text);
  insert into chat_reads(trainer_id,member_id,read_at) values(tid,p_member,now())
    on conflict(trainer_id,member_id) do update set read_at=excluded.read_at;
  return _j_chat(r);
end $$;

revoke execute on function _assign(uuid), _extra_data(uuid), _chat_ring(), _need_assigned(uuid,uuid)
  from public, anon, authenticated;

-- ================= 20261014000000_chat_read.sql =================

-- 맞춤 건강관리 · 대화 읽음 표시
-- 20261013000000_assign_trainer.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 대화방에서 내가 보낸 메시지를 상대가 읽었는지 보여주도록, 양쪽이 마지막으로 읽은 때를 알려줍니다.
-- ■ 상대가 새 메시지를 읽으면 초인종(내용 없는 신호)을 울려 보낸 쪽 화면의 읽음 표시가 바로 바뀝니다.
--   읽을 새 메시지가 있을 때만 울리므로 양쪽이 대화방을 열어 두어도 신호가 끝없이 오가지 않습니다.

-- 초인종 한 번 (실시간이 없거나 실패해도 그대로 진행)
create or replace function _chat_ring_to(p_topic text) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_topic is null then return; end if;
  begin
    perform realtime.send('{}'::jsonb,'ring',p_topic,false);
  exception when others then null;
  end;
end $$;

-- 양쪽이 마지막으로 읽은 때: member = 이용자, trainer = 트레이너(누구든 가장 늦게 읽은 때)
create or replace function _chat_seen(p_mid uuid) returns json language sql stable security definer set search_path=public as $$
  select json_build_object(
    'member',(select _chat_at(chat_read_at) from members where id=p_mid),
    'trainer',(select _chat_at(max(read_at)) from chat_reads where member_id=p_mid)) $$;

-- 이용자 ----------------------------------------------------------------------
create or replace function user_chat_seen(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then return null; end if;
  return _chat_seen(m);
end $$;

-- 대화 보기 (보면 읽은 것으로). 안 읽은 트레이너 메시지가 있었으면 담당 트레이너에게 알린다
create or replace function user_chat_get(p_code text,p_after timestamptz default null,p_before timestamptz default null) returns json
language plpgsql volatile security definer set search_path=public as $$
declare m uuid:=_mid(p_code); x members; tk text;
begin
  if m is null then return null; end if;
  if p_before is null then
    select * into x from members where id=m;
    if exists(select 1 from chat_messages c where c.member_id=m and c.sender='trainer' and c.created_at>coalesce(x.chat_read_at,'-infinity')) then
      update members set chat_read_at=now() where id=m;
      select chat_key into tk from trainers where id=x.trainer_id;
      perform _chat_ring_to('hl-tr-'||tk);
    end if;
  end if;
  return _chat_page(m,p_after,p_before);
end $$;

-- 트레이너·관리자 -------------------------------------------------------------------
create or replace function staff_chat_seen(p_token text,p_member uuid) returns json language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if s.role='trainer' then
    perform _need_assigned(s.subject,p_member);
  elsif not exists(select 1 from members where id=p_member) then
    raise exception 'member not found';
  end if;
  return _chat_seen(p_member);
end $$;

-- 대화 보기. 트레이너가 보면 읽은 것으로 하고, 안 읽은 이용자 메시지가 있었으면 그 이용자에게 알린다
create or replace function staff_chat_get(p_token text,p_member uuid,p_after timestamptz default null,p_before timestamptz default null) returns json
language plpgsql volatile security definer set search_path=public as $$
declare s staff_sessions; prev timestamptz; mk text;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if s.role='trainer' then
    perform _need_assigned(s.subject,p_member);
    if p_before is null then
      select read_at into prev from chat_reads where trainer_id=s.subject and member_id=p_member;
      if prev is null or exists(select 1 from chat_messages c where c.member_id=p_member and c.sender='member' and c.created_at>prev) then
        insert into chat_reads(trainer_id,member_id,read_at) values(s.subject,p_member,now())
          on conflict(trainer_id,member_id) do update set read_at=excluded.read_at;
        if exists(select 1 from chat_messages c where c.member_id=p_member and c.sender='member' and c.created_at>coalesce(prev,'-infinity')) then
          select chat_key into mk from members where id=p_member;
          perform _chat_ring_to('hl-chat-'||mk);
        end if;
      end if;
    end if;
  elsif not exists(select 1 from members where id=p_member) then
    raise exception 'member not found';
  end if;
  return _chat_page(p_member,p_after,p_before);
end $$;

revoke execute on function _chat_ring_to(text), _chat_seen(uuid) from public, anon, authenticated;
