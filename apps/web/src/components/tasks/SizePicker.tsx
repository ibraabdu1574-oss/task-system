'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_SIZE_PRESET_HOURS, SIZE_PRESETS, SIZE_PRESET_LABELS, type SizePreset, type SizePresetRow } from '@task/shared';
import { api } from '@/lib/api';
import { ar } from './bits';

/** اختيار حجم المهمة (PLAN 9.1): نقرة واحدة بدل تقدير رقمي — الساعات من ضبط الإدارة أو الافتراضي العام */
export function SizePicker({ value, onChange, administrationId }: { value: SizePreset | null; onChange: (s: SizePreset | null, hours: number | null) => void; administrationId?: string | null }) {
  const [rows, setRows] = useState<SizePresetRow[]>(SIZE_PRESETS.map((size) => ({ size, hours: DEFAULT_SIZE_PRESET_HOURS[size], administrationId: null })));

  useEffect(() => {
    const qs = administrationId ? `?administrationId=${administrationId}` : '';
    api<SizePresetRow[]>(`/tasks/size-presets${qs}`).then(setRows).catch(() => undefined);
  }, [administrationId]);

  const hoursOf = (s: SizePreset) => rows.find((r) => r.size === s)?.hours ?? DEFAULT_SIZE_PRESET_HOURS[s];

  return (
    <div className="field">
      <label>حجم المهمة <span className="text-ink3">(يُترجم إلى ساعات تقديرية)</span></label>
      <div className="sizes" role="group" aria-label="حجم المهمة">
        {SIZE_PRESETS.map((s) => (
          <button key={s} type="button" className="size-opt" aria-pressed={value === s} onClick={() => (value === s ? onChange(null, null) : onChange(s, hoursOf(s)))}>
            <b>{SIZE_PRESET_LABELS[s]}</b>
            <span>≈ {ar(hoursOf(s))} ساعات</span>
          </button>
        ))}
      </div>
    </div>
  );
}
