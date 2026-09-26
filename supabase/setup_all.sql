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
             and p.proname = any(array['_clean_days','_clean_foods','_clean_nutri','_gid','_j_custom_food','_j_ex','_j_lesson','_j_meal','_j_member','_j_member_staff','_j_member_trainer','_j_prog','_j_trainer','_j_view','_kst_today','_lesson_data','_meal_total','_mid','_need_admin','_need_staff','_new_code','_new_session','_new_trainer_code','_norm_rank','_nutri_num','_role','_staff_ok','_token_hash','admin_add_trainer','admin_change_password','admin_create','admin_del_food','admin_del_trainer','admin_food_requests','admin_login','admin_new_trainer_code','admin_save_food','admin_set_trainer_rank','custom_foods_get','guardian_get','staff_add_lesson','staff_add_member','staff_add_program','staff_check','staff_del_lesson','staff_del_member','staff_del_program','staff_get','staff_login','staff_logout','staff_new_code','staff_new_guardian_code','staff_set_attendance','staff_set_birth','staff_set_offday','staff_set_program_members','staff_set_tags','staff_update_lesson','trainer_login','user_add_ex','user_add_meal','user_add_view','user_del_ex','user_del_meal','user_get'])
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
