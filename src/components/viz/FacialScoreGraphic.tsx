const levels = [
  { color: '#10b981', label: 'Fully relaxed' },
  { color: '#84cc16', label: 'Normal tone' },
  { color: '#eab308', label: 'Some tension' },
  { color: '#f97316', label: 'Widespread tension' },
  { color: '#ef4444', label: 'Grimacing' },
];

export const FacialScoreGraphic = ({ score }: { score: number | null }) => {
  const item = score !== null && Number.isInteger(score) && score >= 1 && score <= 5 ? levels[score - 1] : null;
  if (!item) return <div className="rounded-xl bg-slate-100 p-4 text-slate-600"><p className="font-semibold">Facial score withheld</p><p className="text-sm">Insufficient visible evidence for a facial item.</p></div>;
  return <div className="rounded-xl p-4 sm:p-5 border" style={{ borderColor: item.color, backgroundColor: `${item.color}0d` }}>
    <div className="flex items-center gap-5">
      <div className="relative w-28 h-28 shrink-0" role="img" aria-label={`Provisional facial tension ${score} of 5: ${item.label}`}>
        <svg viewBox="0 0 120 120" className="w-full h-full" aria-hidden="true">
          <circle cx="60" cy="60" r="51" fill="none" stroke="#e2e8f0" strokeWidth="9" />
          <circle cx="60" cy="60" r="51" fill="none" stroke={item.color} strokeWidth="9" strokeLinecap="round" pathLength="100" strokeDasharray={`${Number(score) * 20} 100`} transform="rotate(-90 60 60)" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center"><span className="text-4xl font-bold" style={{ color: item.color }}>{score}<span className="text-lg text-slate-500">/5</span></span></div>
      </div>
      <div><p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Provisional facial tension</p><p className="text-xl sm:text-2xl font-bold mt-1" style={{ color: item.color }}>{item.label}</p><p className="text-sm text-slate-600 mt-1">Facial item only · not total pain severity</p></div>
    </div>
    <div className="grid grid-cols-5 gap-2 mt-5" aria-hidden="true">{levels.map((level, i) => <div key={level.label} className={`rounded-lg text-center py-2 font-bold ${score === i + 1 ? 'ring-2 ring-slate-700 ring-offset-2' : 'opacity-60'}`} style={{ backgroundColor: level.color, color: i === 2 || i === 1 ? '#1e293b' : '#fff' }}>{i + 1}</div>)}</div>
    <div className="flex justify-between text-xs text-slate-500 mt-2"><span>Relaxed</span><span>Greater facial tension</span></div>
  </div>;
};
