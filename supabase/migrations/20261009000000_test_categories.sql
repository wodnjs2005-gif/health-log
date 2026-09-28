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
