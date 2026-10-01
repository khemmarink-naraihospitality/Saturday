import { Star } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { formatNumberValue } from '../../utils/format';
import type { Column } from '../../types';

/**
 * The summary shown for one column under a group, or under a parent's
 * sub-items: a status bar, date range, average rating, total, avatars or file
 * count, depending on the column's type. `agg` is that column's entry from
 * computeAggregates, `totalCount` the number of rows it summarises.
 */
export const SummaryCell = ({ col, agg, totalCount, color }: {
    col: Column;
    agg: any;
    totalCount: number;
    color?: string;
}) => {
    const activeBoardMembers = useBoardStore(state => state.activeBoardMembers);

    return (
        <>
            {col.type === 'status' && (
                <div style={{
                    width: '100%',
                    height: '24px',
                    display: 'flex',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    position: 'relative'
                }}>
                    {(() => {
                        if (!agg || totalCount === 0) return <div style={{ width: '100%', background: '#eee' }} />;
                        const values = agg.values as any[];
                        const counts: Record<string, number> = {};
                        values.forEach(v => {
                            const val = v || 'default';
                            counts[val] = (counts[val] || 0) + 1;
                        });
                        const options = Array.isArray(col.options) ? col.options : [];
                        return options.map(opt => {
                            const count = counts[opt.id] || counts[opt.label] || 0;
                            if (count === 0) return null;
                            const widthPct = (count / totalCount) * 100;
                            return (
                                <div key={opt.id} style={{
                                    width: `${widthPct}%`,
                                    height: '100%',
                                    backgroundColor: opt.color,
                                }} title={`${opt.label}: ${Math.round(widthPct)}%`} />
                            );
                        }).concat(
                            counts['default'] ? (
                                <div key="default" style={{
                                    width: `${(counts['default'] / totalCount) * 100}%`,
                                    height: '100%',
                                    backgroundColor: '#c4c4c4',
                                }} title="Empty" />
                            ) : null
                        );
                    })()}
                </div>
            )}
            {(col.type === 'date' || col.type === 'due_date' || col.type === 'timeline') && (() => {
                if (!agg || !agg.min) return null;
                const d1 = new Date(agg.min).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const d2 = new Date(agg.max).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return <div style={{ background: color || 'hsl(var(--color-brand-primary))', color: 'white', fontSize: '11px', padding: '4px 12px', borderRadius: '12px' }}>{d1 === d2 ? d1 : `${d1} - ${d2}`}</div>
            })()}
            {col.type === 'priority' && (() => {
                // Reads the average defensively: this summary cell
                // renders whatever the grouping code produced, and a
                // shape without an avg must show nothing rather than
                // throw and take the whole board down with it.
                if (!agg?.count || typeof agg.avg !== 'number') return null;
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Star size={13} color="#fdab3d" fill="#fdab3d" />
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{agg.avg.toFixed(1)}</span>
                        <span style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>avg</span>
                    </div>
                );
            })()}
            {col.type === 'number' && (() => {
                const aggregation = col.aggregation || 'sum';

                let result: number | string = 0;
                let label = aggregation;

                if (aggregation === 'none' || !agg || agg.count === 0) {
                    if (aggregation === 'none') {
                        return (
                            <div
                                onClick={() => useBoardStore.getState().setColumnAggregation(col.id, 'sum')}
                                style={{ width: '100%', height: '100%', cursor: 'pointer' }}
                            />
                        );
                    }
                    // If empty but has aggregation
                    result = '-';
                } else {
                    switch (aggregation) {
                        case 'sum':
                            result = agg.sum || 0;
                            break;
                        case 'avg':
                            result = parseFloat(((agg.sum || 0) / agg.count).toFixed(2));
                            break;
                        case 'min':
                            result = Math.min(...agg.values);
                            break;
                        case 'max':
                            result = Math.max(...agg.values);
                            break;
                        case 'count':
                            result = agg.count;
                            break;
                    }
                }

                const nextAggregation = {
                    'sum': 'avg',
                    'avg': 'min',
                    'min': 'max',
                    'max': 'count',
                    'count': 'sum',
                    'none': 'sum'
                } as const;

                const displayResult = (typeof result === 'number' && aggregation !== 'count')
                    ? formatNumberValue(result, col)
                    : result;

                return (
                    <div
                        onClick={() => useBoardStore.getState().setColumnAggregation(col.id, nextAggregation[aggregation] as any)}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '4px'
                        }}
                        title="Click to change aggregation"
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f6f8'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <span>{displayResult}</span>
                        <span style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>{label}</span>
                    </div>
                );
            })()}
            {col.type === 'people' && (() => {
                // Matches the cells this row summarises: ids with no visible
                // member behind them are left out rather than counted.
                const uniqueIds: string[] = (agg?.uniqueIds || []).filter(
                    (id: string) => activeBoardMembers.some(m => m.user_id === id)
                );
                if (uniqueIds.length === 0) return null;
                const maxVisible = 4;
                return (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {uniqueIds.slice(0, maxVisible).map((userId, idx) => {
                            const member = activeBoardMembers.find(m => m.user_id === userId);
                            const profileData = Array.isArray(member?.profiles) ? member.profiles[0] : member?.profiles;
                            const profile = profileData || {};
                            const name = profile.full_name || profile.email || 'Unknown';
                            const initial = name[0]?.toUpperCase() || '?';

                            return (
                                <div key={userId} title={name} style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    backgroundColor: profile?.avatar_url ? 'transparent' : '#0073ea',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    border: '2px solid white',
                                    marginLeft: idx > 0 ? '-10px' : '0',
                                    zIndex: idx + 1,
                                    overflow: 'hidden',
                                    position: 'relative',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                }}>
                                    {profile?.avatar_url ? (
                                        <img
                                            src={profile.avatar_url}
                                            alt=""
                                            referrerPolicy="no-referrer"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    ) : (
                                        initial
                                    )}
                                </div>
                            );
                        })}
                        {uniqueIds.length > maxVisible && (
                            <div style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                backgroundColor: '#e5e7eb',
                                color: '#6b7280',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: 600,
                                border: '2px solid white',
                                marginLeft: '-10px',
                                zIndex: maxVisible + 1,
                                position: 'relative'
                            }}>
                                +{uniqueIds.length - maxVisible}
                            </div>
                        )}
                    </div>
                );
            })()}
            {col.type === 'files' && (() => {
                const fileCount = agg?.count || 0;
                if (fileCount === 0) return null;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px' }}>
                        <span>{fileCount}</span>
                        <span style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>files</span>
                    </div>
                );
            })()}
        </>
    );
};
