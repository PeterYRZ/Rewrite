import type { ReactNode } from 'react';

interface Props {
  left: ReactNode;
  right: ReactNode;
}

export default function DiffLayout({ left, right }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <div className="overflow-y-auto border-r border-slate-200 pr-2">{left}</div>
      <div className="overflow-y-auto pl-2">{right}</div>
    </div>
  );
}
