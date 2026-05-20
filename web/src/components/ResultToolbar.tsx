import { useState } from 'react';

interface Props {
  text: string;
  className?: string;
}

export default function ResultToolbar({ text, className = '' }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rewrite-result-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={handleCopy}
        className="px-3 py-1.5 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center gap-1"
      >
        {copied ? '✓ 已复制' : '📋 复制全文'}
      </button>
      <button
        onClick={handleDownload}
        className="px-3 py-1.5 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center gap-1"
      >
        📥 下载 .txt
      </button>
    </div>
  );
}
