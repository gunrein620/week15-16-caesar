import { Bot, Edit3, Plus } from 'lucide-react';
import { useState } from 'react';

type FloatingWriteButtonProps = {
  onWrite: () => void;
  onAi: () => void;
};

export function FloatingWriteButton({ onWrite, onAi }: FloatingWriteButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  function runAction(action: () => void) {
    setIsOpen(false);
    action();
  }

  return (
    <div className={`write-menu ${isOpen ? 'open' : ''}`}>
      {isOpen && (
        <div className="write-menu-actions" aria-label="빠른 작성 메뉴">
          <button type="button" onClick={() => runAction(onWrite)}>
            <Edit3 size={18} />
            <span>글쓰기</span>
          </button>
          <button type="button" onClick={() => runAction(onAi)}>
            <Bot size={18} />
            <span>AI도우미</span>
          </button>
        </div>
      )}
      <button
        className="write-button"
        type="button"
        aria-label={isOpen ? '작성 메뉴 닫기' : '작성 메뉴 열기'}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Plus size={26} />
      </button>
    </div>
  );
}
