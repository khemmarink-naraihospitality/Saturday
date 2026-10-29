import React from 'react';
import { useNewUi } from '../../../lib/brand';

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
    const newUi = useNewUi();
    // The first character as a person reads it: an emoji or a Thai letter with
    // its vowel marks stays whole instead of being cut mid-glyph.
    const initial = (Array.from(title.trim())[0] || '?').toUpperCase();
    // NHG calls workspaces Space Folders and draws each as a folder, its letter
    // on the front so a column of them (the collapsed rail) can still be told
    // apart. Colours come from narai_brand.css.
    if (newUi) {
        return (
            <svg
                data-ws-folder=""
                data-ws-active={isActive ? 'true' : 'false'}
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ flexShrink: 0, position: 'relative', zIndex: 2 }}
            >
                <path className="ws-folder__shape" d="M2.75 6.5c0-.97.78-1.75 1.75-1.75h4.6c.46 0 .9.18 1.24.51l1.4 1.4c.33.33.78.52 1.24.52h6.52c.97 0 1.75.78 1.75 1.75v9.82c0 .97-.78 1.75-1.75 1.75H4.5c-.97 0-1.75-.78-1.75-1.75z" />
                <text className="ws-folder__initial" x="12" y="13.9" textAnchor="middle" dominantBaseline="central" stroke="none" fontSize="10.5" fontWeight="600">
                    {initial}
                </text>
            </svg>
        );
    }
    return (
        <div data-ws-badge="" data-ws-active={isActive ? 'true' : 'false'} data-ws-size={size} data-ws-hue={titleHue(title)} style={{
            width: `${size}px`,
            height: `${size}px`,
            // A rounded square in every palette; a palette may override --ws-badge-radius
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
