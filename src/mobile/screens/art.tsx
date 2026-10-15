/**
 * Illustrations for the phone layout's cards, drawn in SVG (no images to load).
 * Colours come from the status label palette so they read as "our" charts.
 */

/** "Dashboard at a glance": a donut card tucked behind a stacked-bar card. */
export const DashboardArt = () => (
    <svg width="300" height="190" viewBox="0 0 300 190" fill="none" aria-hidden="true" style={{ maxWidth: '100%' }}>
        {/* Back card: donut */}
        <g transform="translate(8 34) rotate(-4 70 70)">
            <rect width="140" height="146" rx="18" fill="hsl(var(--m-card))" stroke="hsl(var(--m-row-line))" />
            <circle cx="70" cy="80" r="44" fill="#fdab3d" />
            <path d="M70 80 L70 36 A44 44 0 0 1 112.6 69 Z" fill="#00c875" />
            <path d="M70 80 L112.6 69 A44 44 0 0 1 92 118 Z" fill="#579bfc" />
            <path d="M70 80 L26 80 A44 44 0 0 1 70 36 Z" fill="#e2445c" />
            <circle cx="70" cy="80" r="16" fill="hsl(var(--m-card))" />
        </g>
        {/* Front card: stacked bars with people under them */}
        <g transform="translate(108 8) rotate(2 90 85)">
            <rect width="184" height="170" rx="18" fill="hsl(var(--m-card))" stroke="hsl(var(--m-row-line))" />
            {[
                ['#e2445c', '#fdab3d', '#00c875', '#579bfc'],
                ['#e2445c', '#00c875', '#7e3b8a'],
                ['#fdab3d', '#00c875', '#579bfc', '#7e3b8a'],
                ['#e2445c', '#00c875', '#579bfc'],
                ['#00c875', '#579bfc', '#7e3b8a'],
            ].map((stack, i) => {
                const heights = [22, 30, 18, 26];
                let y = 128;
                return (
                    <g key={i}>
                        {stack.map((color, j) => {
                            const h = heights[(i + j) % heights.length];
                            y -= h;
                            return <rect key={j} x={22 + i * 30} y={y} width="20" height={h} rx="3" fill={color} />;
                        })}
                        <circle cx={32 + i * 30} cy="146" r="7" fill={['#ff7a45', '#2f80ed', '#27ae60', '#9b51e0', '#e84393'][i]} />
                    </g>
                );
            })}
            <line x1="16" y1="129" x2="168" y2="129" stroke="hsl(var(--m-row-line))" />
        </g>
    </svg>
);
