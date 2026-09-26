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
