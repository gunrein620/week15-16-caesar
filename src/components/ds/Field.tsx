// Field — 라벨 + 입력. 와이어프레임의 .jb-field/.jb-input을 실제 폼 컨트롤로.
import type { CSSProperties, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

type BaseProps = {
  label?: string;
  style?: CSSProperties;
};

export function Field({
  label,
  style,
  ...rest
}: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="jm-field" style={style}>
      {label && <label htmlFor={rest.id}>{label}</label>}
      <input className="jm-input" {...rest} />
    </div>
  );
}

export function TextareaField({
  label,
  style,
  ...rest
}: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="jm-field" style={{ flex: 1, ...style }}>
      {label && <label htmlFor={rest.id}>{label}</label>}
      <textarea className="jm-input" rows={5} {...rest} style={{ flex: 1 }} />
    </div>
  );
}
