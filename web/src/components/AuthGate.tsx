import { useState } from 'react';

interface Props {
  loading: boolean;
  error: string;
  onLogin: (accessKey: string) => Promise<boolean>;
}

export default function AuthGate({ loading, error, onLogin }: Props) {
  const [key, setKey] = useState('');

  const handleSubmit = async () => {
    if (!key.trim()) return;
    await onLogin(key.trim());
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm w-full max-w-sm">
        <h1 className="text-xl font-bold text-slate-800 text-center mb-2">
          全文段落改写
        </h1>
        <p className="text-sm text-slate-500 text-center mb-6">
          请输入 Access Key 以继续
        </p>

        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder="Access Key"
          autoFocus
          className="w-full p-3 border border-slate-300 rounded-lg text-sm text-center tracking-widest outline-none focus:ring-2 focus:ring-slate-400"
        />

        {error && (
          <p className="text-sm text-red-500 mt-3 text-center">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !key.trim()}
          className="w-full mt-4 px-6 py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
        >
          {loading ? '验证中...' : '登录'}
        </button>
      </div>
    </div>
  );
}
