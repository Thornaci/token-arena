import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { progress, updateSettings } from '@/stores/progress';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';

interface Props {
  locale: Locale;
}

export default function SettingsMenu({ locale }: Props) {
  const { settings } = useStore(progress);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const t = (key: string) => lessonText(key, locale);

  // Mirror the motion setting onto <html> so CSS can still app-wide keyframes
  // (see the [data-ta-motion] rule in global.css). This menu sits in every
  // page header, so the attribute is always kept in sync.
  useEffect(() => {
    document.documentElement.dataset.taMotion = settings.motion;
  }, [settings.motion]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t('settings_title')}
        onClick={() => setOpen((value) => !value)}
        className="ta-panel flex h-9 w-9 items-center justify-center font-mono text-base text-(--color-dim) hover:text-(--color-ink)"
      >
        ⚙
      </button>

      {open && (
        <div
          role="group"
          aria-label={t('settings_title')}
          className="ta-panel absolute right-0 top-11 z-50 flex w-72 flex-col gap-4 p-4"
        >
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-(--color-faint)">
            {t('settings_title')}
          </p>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-semibold text-(--color-ink)">
              {t('settings_motion')}
            </legend>
            {(['full', 'reduced'] as const).map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm text-(--color-dim)">
                <input
                  type="radio"
                  name="ta-motion"
                  checked={settings.motion === value}
                  onChange={() => updateSettings({ motion: value })}
                  className="accent-(--color-phosphor)"
                />
                {t(value === 'full' ? 'settings_motion_full' : 'settings_motion_reduced')}
              </label>
            ))}
            <p className="text-xs text-(--color-faint)">{t('settings_motion_hint')}</p>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm text-(--color-ink)">
              <input
                type="checkbox"
                checked={settings.sfx}
                onChange={(event) => updateSettings({ sfx: event.target.checked })}
                className="accent-(--color-phosphor)"
              />
              <span className="font-semibold">{t('settings_sfx')}</span>
            </label>
            <p className="text-xs text-(--color-faint)">{t('settings_sfx_hint')}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm text-(--color-ink)">
              <input
                type="checkbox"
                checked={settings.renderer === 'classic'}
                onChange={(event) =>
                  updateSettings({ renderer: event.target.checked ? 'classic' : 'game' })
                }
                className="accent-(--color-phosphor)"
              />
              <span className="font-semibold">{t('settings_classic')}</span>
            </label>
            <p className="text-xs text-(--color-faint)">{t('settings_classic_hint')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
