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
