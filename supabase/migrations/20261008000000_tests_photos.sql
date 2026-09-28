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
