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
