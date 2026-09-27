import { useState } from 'react';
import { Layout } from '../../components/Layout';
import type { Member } from '../../lib/backend';
import { cx } from '../../lib/cx';
import ui from '../../styles/ui.module.css';
import { ExportSheet } from './ExportSheet';
import { MemberDetail } from './MemberDetail';
import { TagList } from './MemberFilter';
import type { StaffColor } from './ProgramSheet';
import { TagSheet } from './TagSheet';
import s from './staff.module.css';

interface Props {
  member: Member;
  /** 화면 제목 (트레이너 이름 또는 '관리자') */
  title: string;
  color: StaffColor;
  onBack: () => void;
}

/** 트레이너·관리자: 이용자 한 명의 기록 화면 (해시태그 편집 · 내려받기 · 한마디 · 건강 수치) */
export function StaffMemberView({ member, title, color, onBack }: Props) {
  const [tagging, setTagging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const outline = color === 'navy' ? ui.btnNavyOutline : undefined;

  return (
    <Layout title={title} backLabel="목록" onBack={onBack}>
      <MemberDetail
        member={member}
        color={color}
        summary={
          <div className={ui.row} style={{ alignItems: 'center' }}>
            <TagList tags={member.tags} />
            <div className={s.actions}>
              <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline)} onClick={() => setTagging(true)}>
                # 해시태그 편집
              </button>
              <button type="button" className={cx(ui.btnSmall, outline)} onClick={() => setExporting(true)}>
                기록 내려받기
              </button>
            </div>
          </div>
        }
      />
      {tagging && <TagSheet member={member} onClose={() => setTagging(false)} />}
      {exporting && <ExportSheet color={color} initialMid={member.id} onClose={() => setExporting(false)} />}
    </Layout>
  );
}
