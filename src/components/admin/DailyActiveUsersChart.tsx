import { useState, useEffect, useMemo } from 'react';
import { Activity } from 'lucide-react';
import { fetchActivityLogsSince } from '../../lib/activityStats';

interface DayBucket {
    key: string;
    label: string;
    fullLabel: string;
    count: number;
    users: { name: string; email: string }[];
}

const DAYS = 30;
const CHART_WIDTH = 900;
const CHART_HEIGHT = 200;
const PADDING_LEFT = 32;
const PADDING_BOTTOM = 24;
const PADDING_TOP = 16;

const toDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortLabel = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fullLabel = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export const DailyActiveUsersChart = () => {
    const [buckets, setBuckets] = useState<DayBucket[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);

        const days: Date[] = [];
        for (let i = DAYS - 1; i >= 0; i--) {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - i);
            days.push(d);
        }

        const since = days[0];
        const byDay: Record<string, Map<string, { name: string; email: string }>> = {};
        days.forEach(d => { byDay[toDayKey(d)] = new Map(); });

        const { rows } = await fetchActivityLogsSince(
            since.toISOString(),
            'actor_id, action_type, created_at, metadata, profiles!activity_logs_actor_id_fkey(full_name, email)'
        );

        rows.forEach((row: any) => {
            const dayKey = toDayKey(new Date(row.created_at));
            const bucket = byDay[dayKey];
            if (!bucket || !row.actor_id) return;
            const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
            if (!bucket.has(row.actor_id)) {
                bucket.set(row.actor_id, {
                    name: profile?.full_name || profile?.email || 'Unknown user',
                    email: profile?.email || ''
                });
            }
        });

        setBuckets(days.map(d => {
            const key = toDayKey(d);
            const users = Array.from(byDay[key].values()).sort((a, b) => a.name.localeCompare(b.name));
            return { key, label: shortLabel(d), fullLabel: fullLabel(d), count: users.length, users };
        }));
        setLoading(false);
    };

    const maxCount = useMemo(() => Math.max(1, ...buckets.map(b => b.count)), [buckets]);
    const yTicks = useMemo(() => {
        const top = Math.max(1, Math.ceil(maxCount / 5) * 5);
        return [0, Math.round(top / 2), top];
    }, [maxCount]);

    const plotWidth = CHART_WIDTH - PADDING_LEFT;
    const plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    const colWidth = plotWidth / DAYS;
    const barWidth = Math.min(24, colWidth - 4);

    const totalActive30d = useMemo(() => {
        const seen = new Set<string>();
        buckets.forEach(b => b.users.forEach(u => seen.add(u.email || u.name)));
        return seen.size;
    }, [buckets]);

    return (
        <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            padding: '24px',
            marginBottom: '24px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '10px',
                        backgroundColor: '#6366f115', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Activity size={18} color="#6366f1" />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>
                            Daily Active Users (Last 30 Days)
                        </h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                            Based on recorded activity, including logins · {totalActive30d} unique users in this period
                        </p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
            ) : (
                <div style={{ position: 'relative', marginTop: '12px' }}>
                    <svg
                        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
                    >
                        {/* Gridlines + y-axis labels */}
                        {yTicks.map(tick => {
                            const y = PADDING_TOP + plotHeight - (tick / yTicks[yTicks.length - 1]) * plotHeight;
                            return (
                                <g key={tick}>
                                    <line
                                        x1={PADDING_LEFT} x2={CHART_WIDTH}
                                        y1={y} y2={y}
                                        stroke="#e2e8f0" strokeWidth={1}
                                    />
                                    <text x={PADDING_LEFT - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#94a3b8">
                                        {tick}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Bars */}
                        {buckets.map((bucket, i) => {
                            const x = PADDING_LEFT + i * colWidth + (colWidth - barWidth) / 2;
                            const scaledHeight = (bucket.count / yTicks[yTicks.length - 1]) * plotHeight;
                            const barHeight = bucket.count > 0 ? Math.max(4, scaledHeight) : 4;
                            const y = PADDING_TOP + plotHeight - barHeight;
                            const isHovered = hoverIndex === i;
                            const showLabel = i === 0 || i === buckets.length - 1 || i % 5 === 0;

                            return (
                                <g key={bucket.key}>
                                    {/* Wider transparent hit target covering the full column */}
                                    <rect
                                        x={PADDING_LEFT + i * colWidth}
                                        y={PADDING_TOP}
                                        width={colWidth}
                                        height={plotHeight}
                                        fill="transparent"
                                        tabIndex={0}
                                        onMouseEnter={() => setHoverIndex(i)}
                                        onMouseLeave={() => setHoverIndex(null)}
                                        onFocus={() => setHoverIndex(i)}
                                        onBlur={() => setHoverIndex(null)}
                                        style={{ cursor: 'pointer', outline: 'none' }}
                                    />
                                    <rect
                                        x={x} y={y}
                                        width={barWidth} height={barHeight}
                                        rx={4} ry={4}
                                        fill={bucket.count > 0 ? '#6366f1' : '#e2e8f0'}
                                        opacity={isHovered ? 1 : bucket.count > 0 ? 0.9 : 1}
                                        style={{ transition: 'opacity 0.15s', pointerEvents: 'none' }}
                                    />
                                    {showLabel && (
                                        <text
                                            x={x + barWidth / 2}
                                            y={CHART_HEIGHT - 6}
                                            textAnchor="middle"
                                            fontSize="10"
                                            fill="#94a3b8"
                                        >
                                            {bucket.label}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>

                    {/* Tooltip */}
                    {hoverIndex !== null && buckets[hoverIndex] && (() => {
                        const bucket = buckets[hoverIndex];
                        const posRatio = hoverIndex / (buckets.length - 1);
                        // Clamp near the edges so the tooltip never overflows the card:
                        // anchor to the bar's left/right edge instead of centering on it.
                        let leftPct: number;
                        let translateX: string;
                        if (posRatio < 0.12) {
                            leftPct = (PADDING_LEFT + hoverIndex * colWidth) / CHART_WIDTH * 100;
                            translateX = '0%';
                        } else if (posRatio > 0.88) {
                            leftPct = (PADDING_LEFT + (hoverIndex + 1) * colWidth) / CHART_WIDTH * 100;
                            translateX = '-100%';
                        } else {
                            leftPct = (PADDING_LEFT + hoverIndex * colWidth + colWidth / 2) / CHART_WIDTH * 100;
                            translateX = '-50%';
                        }
                        return (
                            <div style={{
                                position: 'absolute',
                                left: `${leftPct}%`,
                                top: '0px',
                                transform: `translate(${translateX}, -100%)`,
                                backgroundColor: '#0f172a',
                                color: 'white',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                fontSize: '12px',
                                minWidth: '160px',
                                maxWidth: '220px',
                                boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
                                zIndex: 10,
                                pointerEvents: 'none'
                            }}>
                                <div style={{ fontWeight: 600, marginBottom: '2px' }}>{bucket.fullLabel}</div>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: '#a5b4fc', marginBottom: bucket.users.length ? '6px' : 0 }}>
                                    {bucket.count} active {bucket.count === 1 ? 'user' : 'users'}
                                </div>
                                {bucket.users.length > 0 && (
                                    <div style={{ maxHeight: '140px', overflowY: 'auto' }}>
                                        {bucket.users.slice(0, 10).map((u, idx) => (
                                            <div key={idx} style={{ color: '#e2e8f0', fontSize: '11px', lineHeight: '1.6' }}>
                                                {u.name}
                                            </div>
                                        ))}
                                        {bucket.users.length > 10 && (
                                            <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                                                +{bucket.users.length - 10} more
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
};
