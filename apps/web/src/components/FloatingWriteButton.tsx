import type { ReactNode } from 'react';

type FloatingWriteButtonProps = {
  children: ReactNode;
  onClick: () => void;
};

export function FloatingWriteButton({ children, onClick }: FloatingWriteButtonProps) {
  return (
    <button className="write-button" type="button" onClick={onClick}>
      {children}
    </button>
  );
}
