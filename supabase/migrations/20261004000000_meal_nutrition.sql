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
