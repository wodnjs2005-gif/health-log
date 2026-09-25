import ui from '../styles/ui.module.css';

interface Props {
  armed: boolean;
  onClick: () => void;
  label?: string;
  confirmLabel?: string;
}

/** 첫 번째 누르면 빨간 「한 번 더 누르면 삭제」로 바뀌는 버튼 */
export function ConfirmButton({ armed, onClick, label = '삭제', confirmLabel = '한 번 더 누르면 삭제' }: Props) {
  return (
    <button type="button" className={ui.delBtn} data-armed={armed} onClick={onClick}>
      {armed ? confirmLabel : label}
    </button>
  );
}
