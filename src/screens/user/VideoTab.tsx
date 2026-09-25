import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../AppContext';
import type { Program } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { md } from '../../lib/date';
import { loadYT, YT_ENDED, YT_PLAYING, ytThumb, type YTPlayer } from '../../lib/youtube';
import ui from '../../styles/ui.module.css';
import s from './user.module.css';

interface Props {
  playing: string | null;
  onPlay: (id: string) => void;
  onClose: () => void;
}

export function VideoTab({ playing, onPlay, onClose }: Props) {
  const { be, data, me, today, userCode, setData, toast, fail } = useApp();
  const myProgs = data.programs.filter((p) => me && p.mids.includes(me));
  const count = (pid: string, day?: string) => data.views.filter((v) => v.pid === pid && v.mid === me && (!day || v.date === day)).length;

  const viewsRef = useRef(data.views);
  viewsRef.current = data.views;

  const record = useCallback(
    async (p: Program) => {
      try {
        const r = await be.userAddView(userCode, p.id, today);
        const n = viewsRef.current.filter((v) => v.pid === p.id && v.mid === me).length + 1;
        setData((d) => ({ ...d, views: [...d.views, r.view], ex: [...d.ex, r.ex] }));
        toast(`${n}회째 기록했어요!`);
      } catch (e) {
        fail(e);
      }
    },
    [be, userCode, today, me, setData, toast, fail],
  );

  const prog = playing ? myProgs.find((p) => p.id === playing) : null;

  if (prog) {
    return (
      <>
        <button type="button" className={ui.btnSmall} style={{ alignSelf: 'flex-start' }} onClick={onClose}>
          ‹ 영상 목록
        </button>
        <h2 className={ui.h2} style={{ fontSize: '1.375rem', textWrap: 'pretty' }}>
          {prog.title}
        </h2>
        <VideoPlayer key={prog.id} program={prog} onRecord={() => void record(prog)} count={count(prog.id)} today={count(prog.id, today)} />
      </>
    );
  }

  return (
    <>
      <div className={ui.sectionHead}>
        <h2 className={ui.h2}>운동 영상</h2>
        <div className={ui.muted}>영상을 끝까지 보고 따라하면 횟수가 자동으로 기록돼요.</div>
      </div>
      {myProgs.length === 0 && <div className={ui.empty}>올라온 운동 영상이 아직 없어요.</div>}
      {myProgs.map((p) => (
        <div key={p.id} className={ui.card} style={{ padding: '1rem 1.125rem', gap: '0.75rem' }}>
          <div className={ui.small}>{md(p.date)} 등록</div>
          {p.src === 'yt' && p.ytId && (
            <div className={ui.thumb} aria-hidden="true" style={{ backgroundImage: `url(${ytThumb(p.ytId)})` }} />
          )}
          <div className={s.progTitle}>{p.title}</div>
          {p.memo && <div className={ui.memo}>{p.memo}</div>}
          <div className={s.countLine}>
            <span style={{ fontSize: '1rem', color: 'var(--ink-2)' }}>따라한 횟수</span>
            <span className={s.countNum}>{count(p.id)}회</span>
            <span className={ui.small}>(오늘 {count(p.id, today)}회)</span>
          </div>
          <button type="button" className={cx(ui.btn, ui.green)} onClick={() => onPlay(p.id)}>
            ▶ 영상 보고 따라하기
          </button>
        </div>
      ))}
    </>
  );
}

interface PlayerProps {
  program: Program;
  onRecord: () => void;
  count: number;
  today: number;
}

/**
 * 영상 재생 + 따라한 횟수 자동 기록.
 * 직전 시간보다 0초 초과 1.5초 미만 늘어난 만큼만 본 시간에 더한다(건너뛰기는 인정 안 함).
 * 본 시간이 영상 길이의 90% 이상이면 한 번만 기록한다.
 */
function VideoPlayer({ program, onRecord, count, today }: PlayerProps) {
  const { be } = useApp();
  const isYT = program.src === 'yt';
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [pct, setPct] = useState(0);
  const [counted, setCounted] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const pl = useRef({ watched: 0, lastT: 0, counted: false });
  const onRecordRef = useRef(onRecord);
  onRecordRef.current = onRecord;

  const reset = useCallback(() => {
    pl.current = { watched: 0, lastT: 0, counted: false };
    setPct(0);
    setCounted(false);
  }, []);

  const tick = useCallback((t: number, d: number) => {
    const p = pl.current;
    const dt = t - p.lastT;
    if (dt > 0 && dt < 1.5) p.watched += dt;
    p.lastT = t;
    if (!p.counted && d > 0 && p.watched >= d * 0.9) {
      p.counted = true;
      onRecordRef.current();
    }
    setPct(p.counted ? 100 : d ? Math.min(99, Math.floor((p.watched / (d * 0.9)) * 100)) : 0);
    setCounted(p.counted);
  }, []);

  // 파일 영상: 주소 받기 (새로고침으로 program 객체가 바뀌어도 다시 받지 않는다)
  const programRef = useRef(program);
  programRef.current = program;
  useEffect(() => {
    if (isYT) return;
    let alive = true;
    let revokeUrl: string | null = null;
    be.videoUrl(programRef.current)
      .then((r) => {
        if (!r) throw new Error('missing');
        if (!alive) {
          if (r.revoke) URL.revokeObjectURL(r.url);
          return;
        }
        if (r.revoke) revokeUrl = r.url;
        setUrl(r.url);
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [be, program.id, isYT]);

  // 유튜브: IFrame Player API, 0.5초마다 재생 시간 확인
  useEffect(() => {
    if (!isYT || !program.ytId) {
      if (isYT) setMissing(true);
      return;
    }
    let alive = true;
    let player: YTPlayer | null = null;
    let poll: number | undefined;
    const stopPoll = () => {
      window.clearInterval(poll);
      poll = undefined;
    };
    const host = hostRef.current;

    loadYT()
      .then((YT) => {
        if (!alive || !host) return;
        const inner = document.createElement('div');
        host.appendChild(inner);
        player = new YT.Player(inner, {
          videoId: program.ytId!,
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onStateChange: (e) => {
              if (!player) return;
              if (e.data === YT_PLAYING) {
                const t = player.getCurrentTime();
                if (pl.current.counted && t < 1) reset();
                pl.current.lastT = t;
                stopPoll();
                poll = window.setInterval(() => {
                  if (player) tick(player.getCurrentTime(), player.getDuration() || 0);
                }, 500);
              } else {
                stopPoll();
                if (e.data === YT_ENDED) tick(player.getDuration(), player.getDuration());
              }
            },
            onError: () => {
              stopPoll();
              if (alive) setMissing(true);
            },
          },
        });
      })
      .catch(() => alive && setMissing(true));

    return () => {
      alive = false;
      stopPoll();
      try {
        player?.destroy();
      } catch {
        /* 무시 */
      }
      player = null;
      if (host) host.innerHTML = '';
    };
  }, [isYT, program.ytId, tick, reset]);

  const missingMsg = isYT
    ? '유튜브 영상을 불러오지 못했어요. 인터넷 연결이나 링크를 확인해주세요.'
    : '이 기기에서 영상을 찾을 수 없어요.';

  return (
    <>
      <div className={s.screen}>
        {missing ? (
          <span className={s.screenMsg}>{missingMsg}</span>
        ) : isYT ? (
          <div ref={hostRef} className={s.ytHost} />
        ) : url ? (
          <video
            className={s.video}
            src={url}
            controls
            playsInline
            onTimeUpdate={(e) => tick(e.currentTarget.currentTime, e.currentTarget.duration || 0)}
            onPlay={(e) => {
              if (pl.current.counted && e.currentTarget.currentTime < 1) reset();
            }}
          />
        ) : (
          <span className={s.screenMsg}>영상을 불러오는 중…</span>
        )}
      </div>
      <section className={cx(ui.card, s.plCard)}>
        <div className={ui.row} style={{ flexWrap: 'nowrap' }}>
          <span style={{ fontSize: '1.125rem', fontWeight: 800 }}>{counted ? '1회 기록 완료!' : '따라하는 중'}</span>
          <span className={s.pct}>{pct}%</span>
        </div>
        <div className={ui.bar} role="progressbar" aria-label="따라하기 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className={cx(ui.barFill, !counted && s.barSoft)} style={{ width: `${pct}%` }} />
        </div>
        <div className={ui.small}>건너뛰지 않고 영상의 90% 이상 보면 1회로 기록되고, 운동일지에도 자동으로 들어가요.</div>
      </section>
      <section className={cx(ui.card, s.plCard, s.plCountCard)}>
        <div className={ui.sectionHead} style={{ gap: '0.125rem' }}>
          <span style={{ fontSize: '1.0625rem', fontWeight: 700 }}>따라한 횟수</span>
          <span className={ui.small}>오늘 {today}회</span>
        </div>
        <span className={s.plCount}>
          {count}
          <span className={ui.unit}>회</span>
        </span>
      </section>
    </>
  );
}
