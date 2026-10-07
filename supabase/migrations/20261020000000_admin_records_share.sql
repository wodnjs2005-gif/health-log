-- 맞춤 건강관리 · 관리자가 이용자 기록 고치기, 관리자도 영상 공유
-- 20261019000000_push.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 관리자는 이용자가 잘못 적은 운동·식사 기록을 고치거나 지울 수 있습니다 (날짜도 바꿀 수 있습니다).
-- ■ 관리자도 운동 영상을 이용자에게 공유하거나 끌 수 있습니다. 관리자는 모든 이용자, 트레이너는 지금처럼 담당 이용자만.

-- 운동 기록 고치기 (관리자). 영상 따라하기로 생긴 기록도 고칠 수 있다 (어느 영상인지는 그대로)
create or replace function admin_update_ex(p_token text,p_id uuid,p_date date,p_kind text,p_min int,p_level text,p_memo text) returns json
language plpgsql security definer set search_path=public as $$
declare r exercises;
begin
  perform _need_admin(p_token);
  if p_date is null then raise exception 'no date'; end if;
  if coalesce(trim(p_kind),'')='' then raise exception 'no kind'; end if;
  if p_min is null then raise exception 'invalid min'; end if;
  update exercises set date=p_date, kind=left(trim(p_kind),30), min=greatest(1,least(p_min,600)),
    level=left(coalesce(nullif(trim(p_level),''),'보통'),10), memo=left(coalesce(p_memo,''),500)
  where id=p_id returning * into r;
  if r.id is null then raise exception 'record not found'; end if;
  return _j_ex(r);
end $$;

-- 식사 기록 고치기 (관리자). 음식·합계는 이용자가 적을 때와 같은 방법으로 정리한다
create or replace function admin_update_meal(p_token text,p_id uuid,p_date date,p_meal text,p_menu text,p_amount text,p_memo text,
  p_foods jsonb,p_nutri jsonb) returns json
language plpgsql security definer set search_path=public as $$
declare r meals; f jsonb:=_clean_foods(p_foods);
begin
  perform _need_admin(p_token);
  if p_date is null then raise exception 'no date'; end if;
  if coalesce(trim(p_meal),'')='' then raise exception 'no meal'; end if;
  if coalesce(trim(p_menu),'')='' then raise exception 'no menu'; end if;
  update meals set date=p_date, meal=left(trim(p_meal),10), menu=left(trim(p_menu),500),
    amount=left(coalesce(nullif(trim(p_amount),''),'보통'),10), memo=left(coalesce(p_memo,''),500),
    foods=f, nutri=case when jsonb_array_length(f)>0 then _clean_nutri(p_nutri) end
  where id=p_id returning * into r;
  if r.id is null then raise exception 'record not found'; end if;
  return _j_meal(r);
end $$;

-- 기록 지우기 (관리자)
create or replace function admin_del_ex(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_admin(p_token); delete from exercises where id=p_id; end $$;

create or replace function admin_del_meal(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_admin(p_token); delete from meals where id=p_id; end $$;

-- 로그인한 직원이 공유를 켜고 끌 수 있는 이용자: 관리자 = 모두, 트레이너 = 담당 이용자만
create or replace function _share_scope(p_token text) returns uuid[] language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if s.role='admin' then return coalesce((select array_agg(id) from members),'{}'); end if;
  return coalesce((select array_agg(id) from members where trainer_id=s.subject),'{}');
end $$;

-- 여러 영상 × 여러 이용자를 한 번에 켜거나(p_on) 끈다 (관리자·트레이너).
-- 바뀐 영상마다 지금 대상 목록을 돌려준다: {영상 id: [이용자 id…]}
create or replace function staff_share_programs(p_token text,p_programs uuid[],p_members uuid[],p_on boolean) returns json
language plpgsql security definer set search_path=public as $$
declare scope uuid[]:=_share_scope(p_token); ps uuid[]; ms uuid[];
begin
  select coalesce(array_agg(id),'{}') into ps from programs where id = any(coalesce(p_programs,'{}'));
  select coalesce(array_agg(x),'{}') into ms from unnest(coalesce(p_members,'{}')) x where x = any(scope);
  if p_on then
    insert into program_members(program_id,member_id)
      select p, m from unnest(ps) p cross join unnest(ms) m on conflict do nothing;
  else
    delete from program_members where program_id = any(ps) and member_id = any(ms);
  end if;
  return coalesce((select json_object_agg(p.id, coalesce((select json_agg(pm.member_id) from program_members pm where pm.program_id=p.id),'[]'::json))
    from programs p where p.id = any(ps)),'{}'::json);
end $$;

-- 한 영상의 대상 바꾸기 (관리자 = 모든 이용자, 트레이너 = 담당 이용자 몫만)
create or replace function staff_set_program_members(p_token text,p_id uuid,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare scope uuid[]:=_share_scope(p_token); want uuid[]:=coalesce(p_mids,'{}');
begin
  if not exists(select 1 from programs where id=p_id) then raise exception 'program not found'; end if;
  delete from program_members where program_id=p_id and member_id = any(scope) and member_id <> all(want);
  insert into program_members(program_id,member_id)
    select p_id, x from unnest(want) x where x = any(scope) on conflict do nothing;
  return coalesce((select json_agg(member_id) from program_members where program_id=p_id),'[]'::json);
end $$;

revoke execute on function _share_scope(text) from public, anon, authenticated;
