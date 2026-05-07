'use client';

// src/components/ui/timezone-selector.tsx
// Drop-in timezone picker. Shows all regions grouped by continent.
// Usage:
//   <TimezoneSelector value={timezone} onChange={setTimezone} />

import { TIMEZONE_OPTIONS, DEFAULT_TIMEZONE, type TimezoneOption } from '@/lib/timezone';
import { Label } from '@/components/ui/label';
import { Globe, Check, ChevronDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TimezoneSelectorProps {
  value: string;
  onChange: (tz: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

// Group options by continent/region prefix
const REGION_ORDER = [
  'Asia',
  'Australia',
  'Pacific',
  'Europe',
  'Africa',
  'America',
  'UTC',
];

function groupTimezones(options: TimezoneOption[]): Map<string, TimezoneOption[]> {
  const map = new Map<string, TimezoneOption[]>();
  for (const opt of options) {
    const region = opt.value.split('/')[0];
    if (!map.has(region)) map.set(region, []);
    map.get(region)!.push(opt);
  }
  return map;
}

export function TimezoneSelector({
  value,
  onChange,
  label = 'Display Timezone',
  className = '',
  disabled = false,
}: TimezoneSelectorProps) {
  const grouped = groupTimezones(TIMEZONE_OPTIONS);
  const currentValue = value || DEFAULT_TIMEZONE;
  const isMalaysia = currentValue === DEFAULT_TIMEZONE;

  return (
    <div className={`space-y-2 ${className}`}>
      <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <Globe className="h-4 w-4" />
        {label}
      </Label>
      <Select value={currentValue} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-none focus:ring-2 focus:ring-yellow-400/30 focus:border-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed">
          <SelectValue placeholder="Choose a timezone" />
        </SelectTrigger>
        <SelectContent className="max-h-96">
          {REGION_ORDER.map(region => {
            const opts = grouped.get(region);
            if (!opts?.length) return null;

            return (
              <SelectGroup key={region}>
                <SelectLabel>{region}</SelectLabel>
                {opts.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label} — {opt.offset}
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
      {isMalaysia ? (
        <p className="text-xs text-gray-500">
          Default: Malaysia Standard Time (UTC+8). Meeting times are stored in MYT.
        </p>
      ) : (
        <p className="text-xs text-amber-600">
          Meeting times will be displayed in your chosen timezone. Stored times remain in Malaysia time (UTC+8).
        </p>
      )}
    </div>
  );
}