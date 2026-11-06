-- 맞춤 건강관리 · 이용자 한 명에 담당 트레이너 여러 명
-- 20261020000000_admin_records_share.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 관리자가 이용자마다 담당 트레이너를 여러 명 정합니다. 지금 담당은 그대로 옮겨 옵니다.
-- ■ 담당 트레이너는 모두 그 이용자와 대화하고 출석을 체크하고 영상을 공유합니다.
-- ■ 대화방은 이용자마다 하나이고 담당 트레이너들이 함께 씁니다. 이용자가 보낸 메시지의 알림은 담당 모두에게 갑니다.
-- ■ 담당을 새로 넣으면 지난 대화도 봅니다. 다른 담당이 이미 읽은 메시지는 읽은 것으로 치고,
--   아무도 읽지 않은 메시지는 안 읽음으로 남습니다 (이용자 화면에 읽지 않았는데 읽었다고 나오지 않습니다).

-- 표 --------------------------------------------------------------------------
create table if not exists member_trainers(
  member_id uuid not null references members(id) on delete cascade,
  trainer_id uuid not null references trainers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(member_id,trainer_id));
create index if not exists member_trainers_trainer on member_trainers(trainer_id);
alter table member_trainers enable row level security;

-- 지금 담당을 옮기고 예전 칸을 지운다 (이 파일을 다시 실행해도 괜찮다)
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='members' and column_name='trainer_id') then
    execute 'insert into member_trainers(member_id,trainer_id) select id,trainer_id from members where trainer_id is not null on conflict do nothing';
    execute 'alter table members drop column trainer_id';
  end if;
end $$;

-- 담당: {이용자 id: [트레이너 id…]} 먼저 정한 담당부터 (p_mid 가 null 이면 전체, 아니면 그분만)
create or replace function _assigns(p_mid uuid) returns json language sql stable security definer set search_path=public as $$
  select coalesce(json_object_agg(t.member_id,t.ids),'{}'::json) from (
    select member_id, json_agg(trainer_id order by created_at, trainer_id) ids from member_trainers
    where p_mid is null or member_id=p_mid group by member_id) t $$;

-- 업데이트 전에 열어 둔 화면용: 첫 담당 한 명만 {이용자 id: 트레이너 id}
create or replace function _assign(p_mid uuid) returns json language sql stable security definer set search_path=public as $$
  select coalesce(json_object_agg(t.member_id,t.trainer_id),'{}'::json) from (
    select distinct on (member_id) member_id, trainer_id from member_trainers
    where p_mid is null or member_id=p_mid order by member_id, created_at, trainer_id) t $$;

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
    'guardians',_guardians(p_mid),
    'assign',_assign(p_mid),
    'assigns',_assigns(p_mid)) $$;

-- 담당 정하기 (관리자): 고른 트레이너들로 통째로 바꾼다. 비우면 담당 없음. 저장된 담당 목록을 돌려준다
create or replace function admin_set_member_trainers(p_token text,p_member uuid,p_trainers uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare want uuid[];
begin
  perform _need_admin(p_token);
  select coalesce(array_agg(distinct x),'{}') into want from unnest(coalesce(p_trainers,'{}')) x;
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  if exists(select 1 from unnest(want) x where not exists(select 1 from trainers t where t.id=x)) then raise exception 'trainer not found'; end if;
  -- 새 담당: 다른 담당이 이미 읽은 데까지는 읽은 것으로 (지난 메시지가 모두 안 읽음으로 쌓이지 않게)
  insert into chat_reads(trainer_id,member_id,read_at)
    select x, p_member, r.last from unnest(want) x, (select max(read_at) last from chat_reads where member_id=p_member) r
    where r.last is not null and not exists(select 1 from member_trainers a where a.member_id=p_member and a.trainer_id=x)
    on conflict(trainer_id,member_id) do update set read_at=greatest(chat_reads.read_at,excluded.read_at);
  delete from member_trainers where member_id=p_member and trainer_id <> all(want);
  insert into member_trainers(member_id,trainer_id) select p_member, x from unnest(want) x on conflict do nothing;
  return coalesce((select json_agg(trainer_id order by created_at, trainer_id) from member_trainers where member_id=p_member),'[]'::json);
end $$;

-- 업데이트 전에 열어 둔 화면용: 한 명으로 정하기
create or replace function admin_set_member_trainer(p_token text,p_member uuid,p_trainer uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform admin_set_member_trainers(p_token,p_member,case when p_trainer is null then '{}'::uuid[] else array[p_trainer] end);
end $$;

-- 초인종: 이용자 · 담당 트레이너 모두 · 관리자 채널에만 -----------------------------------
create or replace function _chat_ring() returns trigger language plpgsql security definer set search_path=public as $$
declare mk text; tk text;
begin
  select chat_key into mk from members where id=new.member_id;
  begin
    perform realtime.send('{}'::jsonb,'ring','hl-chat-'||mk,false);
    for tk in select t.chat_key from member_trainers a join trainers t on t.id=a.trainer_id where a.member_id=new.member_id loop
      perform realtime.send('{}'::jsonb,'ring','hl-tr-'||tk,false);
    end loop;
    perform realtime.send('{}'::jsonb,'ring','hl-staff-'||_chat_staff_key(),false);
  exception when others then null;
  end;
  return new;
end $$;

-- 이용자: 담당 트레이너 목록 (없으면 빈 목록). trainer 는 업데이트 전에 열어 둔 화면용
create or replace function user_chat_status(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare mid uuid:=_mid(p_code); m members; ts json;
begin
  if mid is null then return null; end if;
  select * into m from members where id=mid;
  select coalesce(json_agg(json_build_object('id',t.id,'name',t.name,'rank',coalesce(t.rank,'')) order by a.created_at, t.id),'[]'::json) into ts
    from member_trainers a join trainers t on t.id=a.trainer_id where a.member_id=mid;
  return json_build_object('key','hl-chat-'||m.chat_key,
    'unread',(select count(*) from chat_messages c where c.member_id=m.id and c.sender='trainer' and c.created_at>coalesce(m.chat_read_at,'-infinity')),
    'trainers',ts,
    'trainer',ts->0);
end $$;

-- 담당 트레이너가 없으면 보낼 수 없다
create or replace function user_chat_send(p_code text,p_text text) returns json language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); r chat_messages;
begin
  if m is null then return null; end if;
  if not exists(select 1 from member_trainers where member_id=m) then raise exception 'no trainer'; end if;
  r:=_chat_put(m,'member',null,'',p_text);
  update members set chat_read_at=now() where id=m;
  return _j_chat(r);
end $$;

-- 대화 보기 (보면 읽은 것으로). 안 읽은 트레이너 메시지가 있었으면 담당 트레이너 모두에게 알린다
create or replace function user_chat_get(p_code text,p_after timestamptz default null,p_before timestamptz default null) returns json
language plpgsql volatile security definer set search_path=public as $$
declare m uuid:=_mid(p_code); x members; tk text;
begin
  if m is null then return null; end if;
  if p_before is null then
    select * into x from members where id=m;
    if exists(select 1 from chat_messages c where c.member_id=m and c.sender='trainer' and c.created_at>coalesce(x.chat_read_at,'-infinity')) then
      update members set chat_read_at=now() where id=m;
      for tk in select t.chat_key from member_trainers a join trainers t on t.id=a.trainer_id where a.member_id=m loop
        perform _chat_ring_to('hl-tr-'||tk);
      end loop;
    end if;
  end if;
  return _chat_page(m,p_after,p_before);
end $$;

-- 직원: 트레이너는 담당 이용자 대화만, 관리자는 모두 (보기만)
create or replace function staff_chat_list(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions; k text;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if s.role='trainer' then
    select 'hl-tr-'||chat_key into k from trainers where id=s.subject;
  else
    k:='hl-staff-'||_chat_staff_key();
  end if;
  return json_build_object('key',k,
    'rooms',coalesce((select json_agg(json_build_object('mid',l.member_id,'last',_j_chat(l),
        'unread',case when s.role='trainer' then (select count(*) from chat_messages c where c.member_id=l.member_id and c.sender='member'
            and c.created_at>coalesce((select read_at from chat_reads r where r.trainer_id=s.subject and r.member_id=l.member_id),'-infinity')) else 0 end)
        order by l.created_at desc)
      from (select distinct on (c.member_id) c.* from chat_messages c
            where s.role='admin' or exists(select 1 from member_trainers a where a.member_id=c.member_id and a.trainer_id=s.subject)
            order by c.member_id, c.created_at desc) l),'[]'::json));
end $$;

-- 트레이너가 담당인지 (아니면 오류)
create or replace function _need_assigned(p_trainer uuid,p_member uuid) returns void language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  if not exists(select 1 from member_trainers where member_id=p_member and trainer_id=p_trainer) then raise exception 'not assigned'; end if;
end $$;

-- 한 번에 출석: 트레이너는 담당 이용자만 체크된다
create or replace function staff_set_attendance_many(p_token text,p_lesson uuid,p_date date,p_members uuid[]) returns int
language plpgsql security definer set search_path=public as $$
declare s staff_sessions:=_staff_session(p_token); n int;
begin
  if not exists(select 1 from lessons where id=p_lesson) then raise exception 'lesson not found'; end if;
  if p_date is null or p_date>_kst_today() then raise exception 'invalid date'; end if;
  insert into attendance(lesson_id,member_id,date)
    select p_lesson, lm.member_id, p_date from lesson_members lm
    where lm.lesson_id=p_lesson and lm.member_id = any(coalesce(p_members,'{}'))
      and (s.role='admin' or exists(select 1 from member_trainers a where a.member_id=lm.member_id and a.trainer_id=s.subject))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- 로그인한 직원이 공유를 켜고 끌 수 있는 이용자: 관리자 = 모두, 트레이너 = 담당 이용자만
create or replace function _share_scope(p_token text) returns uuid[] language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if s.role='admin' then return coalesce((select array_agg(id) from members),'{}'); end if;
  return coalesce((select array_agg(member_id) from member_trainers where trainer_id=s.subject),'{}');
end $$;

-- 예전 공유 함수는 staff_share_programs 로 바뀌어 더 쓰지 않는다
drop function if exists trainer_share_programs(text,uuid[],uuid[],boolean);

-- 휴대폰 알림: 이용자가 보내면 담당 트레이너 모두에게, 트레이너가 보내면 이용자에게
create or replace function _push_chat() returns trigger language plpgsql security definer set search_path=public as $$
declare m members;
begin
  select * into m from members where id=new.member_id;
  if new.sender='trainer' then
    perform _push(_push_subs('member',m.id), coalesce(nullif(new.author,''),'트레이너')||' · 새 메시지', new.body, 'chat', '/?go=chat');
  else
    perform _push(array(select x from member_trainers a, unnest(_push_subs('trainer',a.trainer_id)) x where a.member_id=m.id),
      m.name||' 님 · 새 메시지', new.body, 'chat-'||m.id, '/?go=chat');
  end if;
  return new;
end $$;

revoke execute on function _assigns(uuid) from public, anon, authenticated;
