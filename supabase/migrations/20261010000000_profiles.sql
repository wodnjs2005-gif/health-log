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
