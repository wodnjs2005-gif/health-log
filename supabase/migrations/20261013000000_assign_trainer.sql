-- 맞춤 건강관리 · 담당 트레이너 배정 + 담당과만 대화
-- 20261012000000_chat_status_fix.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 관리자가 이용자마다 담당 트레이너 한 명을 정합니다 (이용자 카드의 더보기 → 담당 트레이너).
-- ■ 대화는 이용자와 담당 트레이너만 합니다. 담당이 아닌 트레이너는 그 대화를 보지 못하고, 관리자는 모든 대화를 보기만 합니다.
--   담당을 바꾸면 새 담당 트레이너가 지난 대화도 이어서 봅니다 (지난 메시지는 읽은 것으로 칩니다).
-- ■ 담당 트레이너가 없는 이용자는 대화를 보낼 수 없습니다 (앱에 안내가 나옵니다).
-- ■ 새 메시지 신호(초인종)는 그 이용자, 담당 트레이너, 관리자에게만 갑니다.

-- 표 --------------------------------------------------------------------------
alter table members add column if not exists trainer_id uuid references trainers(id) on delete set null;
create index if not exists members_trainer on members(trainer_id);
-- 트레이너 초인종 채널 이름 (무작위)
alter table trainers add column if not exists chat_key text not null default encode(extensions.gen_random_bytes(16),'hex');

-- 담당: {이용자 id: 트레이너 id} (p_mid 가 null 이면 전체, 아니면 그분만)
create or replace function _assign(p_mid uuid) returns json language sql stable security definer set search_path=public as $$
  select coalesce(json_object_agg(m.id, m.trainer_id),'{}'::json) from members m
  where m.trainer_id is not null and (p_mid is null or m.id=p_mid) $$;

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
    'assign',_assign(p_mid)) $$;

-- 담당 정하기 (관리자). p_trainer 가 null 이면 담당 없음
create or replace function admin_set_member_trainer(p_token text,p_member uuid,p_trainer uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform _need_admin(p_token);
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  if p_trainer is not null and not exists(select 1 from trainers where id=p_trainer) then raise exception 'trainer not found'; end if;
  update members set trainer_id=p_trainer where id=p_member;
  -- 새 담당에게 지난 메시지가 모두 안 읽음으로 쌓이지 않게
  if p_trainer is not null then
    insert into chat_reads(trainer_id,member_id,read_at) values(p_trainer,p_member,now())
      on conflict(trainer_id,member_id) do nothing;
  end if;
end $$;

-- 초인종: 이용자 · 담당 트레이너 · 관리자 채널에만 ----------------------------------------
create or replace function _chat_ring() returns trigger language plpgsql security definer set search_path=public as $$
declare mk text; tk text;
begin
  select m.chat_key, t.chat_key into mk, tk from members m left join trainers t on t.id=m.trainer_id where m.id=new.member_id;
  begin
    perform realtime.send('{}'::jsonb,'ring','hl-chat-'||mk,false);
    if tk is not null then perform realtime.send('{}'::jsonb,'ring','hl-tr-'||tk,false); end if;
    perform realtime.send('{}'::jsonb,'ring','hl-staff-'||_chat_staff_key(),false);
  exception when others then null;
  end;
  return new;
end $$;

-- 이용자: 담당 트레이너도 함께 (없으면 null) --------------------------------------------
create or replace function user_chat_status(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare mid uuid:=_mid(p_code); m members; t trainers;
begin
  if mid is null then return null; end if;
  select * into m from members where id=mid;
  select * into t from trainers where id=m.trainer_id;
  return json_build_object('key','hl-chat-'||m.chat_key,
    'unread',(select count(*) from chat_messages c where c.member_id=m.id and c.sender='trainer' and c.created_at>coalesce(m.chat_read_at,'-infinity')),
    'trainer',case when t.id is null then null else json_build_object('id',t.id,'name',t.name,'rank',coalesce(t.rank,'')) end);
end $$;

-- 담당 트레이너가 없으면 보낼 수 없다
create or replace function user_chat_send(p_code text,p_text text) returns json language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); r chat_messages;
begin
  if m is null then return null; end if;
  if not exists(select 1 from members where id=m and trainer_id is not null) then raise exception 'no trainer'; end if;
  r:=_chat_put(m,'member',null,'',p_text);
  update members set chat_read_at=now() where id=m;
  return _j_chat(r);
end $$;

-- 직원: 트레이너는 담당 이용자 대화만, 관리자는 모두 (보기만) -----------------------------------
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
      from (select distinct on (c.member_id) c.* from chat_messages c join members m on m.id=c.member_id
            where s.role='admin' or m.trainer_id=s.subject
            order by c.member_id, c.created_at desc) l),'[]'::json));
end $$;

-- 트레이너가 담당인지 (아니면 오류)
create or replace function _need_assigned(p_trainer uuid,p_member uuid) returns void language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  if not exists(select 1 from members where id=p_member and trainer_id=p_trainer) then raise exception 'not assigned'; end if;
end $$;

create or replace function staff_chat_get(p_token text,p_member uuid,p_after timestamptz default null,p_before timestamptz default null) returns json
language plpgsql volatile security definer set search_path=public as $$
declare s staff_sessions;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if s.role='trainer' then
    perform _need_assigned(s.subject,p_member);
    if p_before is null then
      insert into chat_reads(trainer_id,member_id,read_at) values(s.subject,p_member,now())
        on conflict(trainer_id,member_id) do update set read_at=excluded.read_at;
    end if;
  elsif not exists(select 1 from members where id=p_member) then
    raise exception 'member not found';
  end if;
  return _chat_page(p_member,p_after,p_before);
end $$;

create or replace function trainer_chat_send(p_token text,p_member uuid,p_text text) returns json language plpgsql security definer set search_path=public as $$
declare tid uuid:=_need_trainer(p_token); r chat_messages;
begin
  perform _need_assigned(tid,p_member);
  r:=_chat_put(p_member,'trainer',tid,_staff_label(p_token),p_text);
  insert into chat_reads(trainer_id,member_id,read_at) values(tid,p_member,now())
    on conflict(trainer_id,member_id) do update set read_at=excluded.read_at;
  return _j_chat(r);
end $$;

revoke execute on function _assign(uuid), _extra_data(uuid), _chat_ring(), _need_assigned(uuid,uuid)
  from public, anon, authenticated;
