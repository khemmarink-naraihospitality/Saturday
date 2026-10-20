import React from 'react';

export const BoardIcon = ({ size = 16, className = "", style = {} }: { size?: number, className?: string, style?: React.CSSProperties }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
    >
        <rect x="3" y="3" width="18" height="18" rx="1.5" />
        <path d="M3 11h18" />
        <path d="M9 3v8" />
        <path d="M15 11v10" />
    </svg>
);

/** A stable 0-7 from the title, so a workspace keeps its own tint wherever it is drawn. */
const titleHue = (title: string) => {
    let h = 0;
    for (const ch of title.trim()) h = (h * 31 + ch.codePointAt(0)!) % 997;
    return h % 8;
};

export const WorkspaceIcon = ({ title, isActive, size = 20 }: { title: string, isActive: boolean, size?: number }) => {
    // The first character as a person reads it: an emoji or a Thai letter with
    // its vowel marks stays whole instead of being cut mid-glyph.
    const initial = (Array.from(title.trim())[0] || '?').toUpperCase();
    return (
        <div data-ws-badge="" data-ws-active={isActive ? 'true' : 'false'} data-ws-size={size} data-ws-hue={titleHue(title)} style={{
            width: `${size}px`,
            height: `${size}px`,
            // A rounded square under Saturday; Narai sets --ws-badge-radius (a circle for now)
            borderRadius: 'var(--ws-badge-radius, 6px)',
            backgroundColor: isActive ? 'hsl(var(--color-brand-primary))' : '#e6e9ef',
            color: isActive ? 'white' : '#676879',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: `${Math.round(size * 0.55)}px`,
            fontWeight: 700,
            flexShrink: 0,
            transition: 'all 0.2s',
            position: 'relative',
            zIndex: 2
        }}>
            {initial}
        </div>
    );
};
