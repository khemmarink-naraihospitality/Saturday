import { Lock, Share2, House } from 'lucide-react';
import { colorFor } from './format';

/**
 * The little pictures the phone layout uses for boards, workspaces and
 * dashboards, drawn in SVG so they cost nothing to load and follow the theme.
 */

const LINE = 'hsl(var(--m-chip-strong))';

/** A board: rows of grey lines with coloured status bars — the tile in every list. */
export const BoardGlyph = ({ size = 34, isPrivate = false, shared = false }: {
    size?: number;
    isPrivate?: boolean;
    shared?: boolean;
}) => (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
        <svg width={size} height={Math.round(size * 0.85)} viewBox="0 0 40 34" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="9" height="4" rx="2" fill="hsl(var(--m-accent))" opacity="0.85" />
            {[11, 19, 27].map((y, i) => (
                <g key={y}>
                    <rect x="2" y={y} width="13" height="4" rx="2" fill={LINE} />
                    <circle cx="20" cy={y + 2} r="2" fill={LINE} />
                    <rect x="24" y={y - 0.25} width="14" height="4.5" rx="2.25" fill={['#00c875', '#fdab3d', '#ff5c7c'][i]} />
                </g>
            ))}
        </svg>
        {(isPrivate || shared) && (
            <span style={{
                position: 'absolute',
                right: -10,
                bottom: -10,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'hsl(var(--m-card))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'hsl(var(--m-text-2))'
            }}>
                {isPrivate ? <Lock size={11} strokeWidth={2.5} /> : <Share2 size={11} strokeWidth={2.5} />}
            </span>
        )}
    </span>
);

/** A workspace: its first letter on a colour picked from its name. */
export const WorkspaceBadge = ({ title, size = 38, home = false }: { title: string; size?: number; home?: boolean }) => (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
        <span style={{
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.26),
            background: colorFor(title),
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.round(size * 0.55),
            fontWeight: 700,
            lineHeight: 1
        }}>
            {(title.trim()[0] || '?').toUpperCase()}
        </span>
        {home && (
            <span style={{
                position: 'absolute',
                right: -6,
                bottom: -6,
                width: 18,
                height: 18,
                borderRadius: 6,
                background: 'hsl(var(--m-text-2))',
                color: 'hsl(var(--m-card))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <House size={11} strokeWidth={2.6} />
            </span>
        )}
    </span>
);

/** A dashboard: a pie with a couple of bars. */
export const DashboardGlyph = ({ size = 34, isPrivate = false }: { size?: number; isPrivate?: boolean }) => (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
        <svg width={size} height={Math.round(size * 0.85)} viewBox="0 0 40 34" fill="none" aria-hidden="true">
            <rect x="2" y="6" width="5" height="4" rx="1.5" fill="#ff5c7c" />
            <rect x="9" y="6" width="5" height="4" rx="1.5" fill="#fdab3d" />
            <rect x="2" y="15" width="12" height="3.5" rx="1.75" fill={LINE} />
            <rect x="2" y="22" width="12" height="3.5" rx="1.75" fill={LINE} />
            <circle cx="28" cy="20" r="10" fill="#00c875" />
            <path d="M28 20 L28 8 A12 12 0 0 1 39.4 16.3 Z" fill="#ff5c7c" />
            <path d="M28 20 L39.4 16.3 A12 12 0 0 1 36 29 Z" fill="#fdab3d" />
        </svg>
        {isPrivate && (
            <span style={{ position: 'absolute', right: -10, bottom: -10, width: 18, height: 18, borderRadius: '50%', background: 'hsl(var(--m-card))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--m-text-2))' }}>
                <Lock size={11} strokeWidth={2.5} />
            </span>
        )}
    </span>
);

/** The board preview drawn on a favourites card: a sheet of rows with status bars. */
export const MiniBoardArt = ({ width = 240 }: { width?: number }) => (
    <svg width={width} height={Math.round(width * 0.42)} viewBox="0 0 240 100" fill="none" aria-hidden="true">
        <rect x="0" y="0" width="240" height="112" rx="14" fill="hsl(var(--m-card))" />
        {[22, 50, 78].map((y, i) => (
            <g key={y}>
                <rect x="16" y={y - 8} width="4" height="16" rx="2" fill={['#00c875', '#00c875', '#00c875'][i]} />
                <rect x="26" y={y - 8} width="118" height="16" rx="4" fill="hsl(var(--m-bg))" />
                <rect x="34" y={y - 1.5} width="80" height="3" rx="1.5" fill={LINE} />
                <circle cx="160" cy={y} r="5" fill={LINE} />
                <rect x="174" y={y - 9} width="52" height="18" rx="4" fill={['#00c875', '#fdcb3d', '#e2445c'][i]} />
            </g>
        ))}
    </svg>
);
