import { Check } from 'lucide-react';
import type { Palette } from '../../lib/palettes';

/**
 * A tiny drawing of the app in one palette's own colours: sidebar, header
 * with a button, and a few rows. Drawn from palette.swatch, so each card shows
 * its own palette whichever one is active.
 */
export const ThemeSwatch = ({ palette, height = 84 }: { palette: Palette; height?: number }) => {
    const c = palette.swatch;
    return (
        <div aria-hidden="true" style={{ display: 'flex', height, borderRadius: 8, overflow: 'hidden', border: `1px solid ${c.line}`, background: c.canvas }}>
            <div style={{ width: '28%', background: c.sidebar, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ height: 6, width: '70%', borderRadius: 3, background: c.text, opacity: 0.75 }} />
                <div style={{ height: 6, width: '85%', borderRadius: 3, background: c.brandSoft }} />
                <div style={{ height: 6, width: '60%', borderRadius: 3, background: c.line }} />
                <div style={{ height: 6, width: '75%', borderRadius: 3, background: c.line }} />
            </div>
            <div style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ height: 7, width: '40%', borderRadius: 3, background: c.text, opacity: 0.85 }} />
                    <div style={{ flex: 1 }} />
                    <div style={{ height: 11, width: 26, borderRadius: 4, background: c.brand }} />
                </div>
                <div style={{ height: 3, width: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${c.brand}, ${c.accent})` }} />
                {[0.9, 0.7, 0.8].map((w, i) => (
                    <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <div style={{ width: 3, height: 9, borderRadius: 2, background: i === 1 ? c.accent : c.brand }} />
                        <div style={{ height: 5, width: `${w * 60}%`, borderRadius: 3, background: c.line }} />
                        <div style={{ height: 9, flex: 1, borderRadius: 3, background: i === 0 ? c.brandSoft : c.sidebar }} />
                    </div>
                ))}
            </div>
        </div>
    );
};

/** One selectable palette card (desktop Profile Settings). */
export const ThemeChoiceCard = ({ palette, selected, onSelect }: { palette: Palette; selected: boolean; onSelect: () => void }) => (
    <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        style={{
            display: 'flex', flexDirection: 'column', gap: 8, padding: 8, borderRadius: 10, cursor: 'pointer', textAlign: 'left',
            border: selected ? '2px solid hsl(var(--color-brand-primary))' : '2px solid hsl(var(--color-border))',
            background: 'hsl(var(--color-bg-canvas))', boxSizing: 'border-box', minWidth: 0,
        }}
    >
        <ThemeSwatch palette={palette} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '0 2px 2px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--color-text-primary))' }}>{palette.name}</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.35, color: 'hsl(var(--color-text-tertiary))' }}>{palette.blurb}</div>
            </div>
            {selected && (
                <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: 'hsl(var(--color-brand-primary))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={12} strokeWidth={3} />
                </span>
            )}
        </div>
    </button>
);
