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
