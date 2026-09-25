// 보호자: 여러 이용자의 읽기 전용 데이터를 하나로 합치고, 번호 목록을 기기에 저장한다.
import { toDataSet, type DataSet, type GuardianData } from './backend';
import { normCode } from './code';
import { LS, lsDel, lsGet, lsSet } from './storage';

export interface GuardianLink {
  code: string;
  mid: string;
}

export const readGuardianCodes = (): string[] => {
  try {
    const v = JSON.parse(lsGet(LS.guardian) || '[]');
    return Array.isArray(v) ? [...new Set(v.map(normCode).filter((c) => c.length === 6))] : [];
  } catch {
    return [];
  }
};

export const saveGuardianCodes = (codes: string[]) => {
  if (codes.length) lsSet(LS.guardian, JSON.stringify(codes));
  else lsDel(LS.guardian);
};

/** 한 사람씩 받은 데이터를 합친다. 두 사람에게 함께 배정된 영상은 하나로 묶는다. */
export const mergeGuardianData = (list: GuardianData[]): DataSet => {
  const programs = new Map<string, DataSet['programs'][number]>();
  for (const g of list) {
    for (const p of g.programs) {
      const prev = programs.get(p.id);
      programs.set(p.id, prev ? { ...prev, mids: [...new Set([...prev.mids, ...p.mids])] } : p);
    }
  }
  // 두 사람이 같은 수업에 다니면 명단을 합친다
  const lessons = new Map<string, DataSet['lessons'][number]>();
  for (const g of list) {
    for (const l of g.lessons || []) {
      const prev = lessons.get(l.id);
      lessons.set(l.id, prev ? { ...prev, roster: [...prev.roster, ...l.roster.filter((r) => !prev.roster.some((x) => x.mid === r.mid))] } : l);
    }
  }
  const offdays = new Map(list.flatMap((g) => g.offdays || []).map((o) => [o.lid + o.date, o]));
  return toDataSet(
    list.map((g) => ({ ...g.member, code: '' })),
    {
      ex: list.flatMap((g) => g.ex),
      meals: list.flatMap((g) => g.meals),
      programs: [...programs.values()],
      views: list.flatMap((g) => g.views),
      lessons: [...lessons.values()],
      attendance: list.flatMap((g) => g.attendance || []),
      offdays: [...offdays.values()],
    },
  );
};
