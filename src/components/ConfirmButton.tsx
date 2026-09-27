import { cx } from '../lib/cx';
import ui from '../styles/ui.module.css';

interface Props {
  armed: boolean;
  onClick: () => void;
  label?: string;
  confirmLabel?: string;
  /** 삭제처럼 되돌릴 수 없는 동작: 처음부터 빨간 글씨 */
  danger?: boolean;
  /** 창 안에서 한 줄을 다 쓰는 버튼 */
  wide?: boolean;
}

/** 첫 번째 누르면 빨간 「한 번 더 누르면 삭제」로 바뀌는 버튼 */
export function ConfirmButton({ armed, onClick, label = '삭제', confirmLabel = '한 번 더 누르면 삭제', danger, wide }: Props) {
  return (
    <button type="button" className={cx(ui.delBtn, danger && ui.delBtnDanger, wide && ui.delBtnWide)} data-armed={armed} onClick={onClick}>
      {armed ? confirmLabel : label}
    </button>
  );
}
