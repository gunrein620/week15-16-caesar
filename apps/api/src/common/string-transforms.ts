import { Transform } from 'class-transformer';

export function Trim() {
  return Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
}

export function TrimStringArray() {
  return Transform(({ value }) =>
    Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item.trim() : item)) : value
  );
}
