import { useState, useEffect } from 'react';
import { fetchDashboardStats } from '../../lib/activityStats';

const WEEKS = 4;
// Roughly five and a half rows, so the clipped row is itself the hint that the
// list keeps going.
const LIST_MAX_HEIGHT = 360;

interface BoardRow {
    boardId: string;
    title: string;
    items: number;
    updates: number;
}

interface PersonRow {
    userId: string;
    name: string;
    avatarUrl: string | null;
    weeks: number[];
    total: number;
}

const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};

/** "Aug 3 – 9" within one month, "Jul 28 – Aug 3" across two. */
const weekLabel = (start: Date, end: Date) => {
    const from = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const to = end.toLocaleDateString(
        undefined,
        start.getMonth() === end.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' }
    );
    return `${from} – ${to}`;
};

export const ActivityLeaderboards = () => {
    const [boards, setBoards] = useState<BoardRow[]>([]);
    const [creators, setCreators] = useState<PersonRow[]>([]);
    const [communicators, setCommunicators] = useState<PersonRow[]>([]);
    const [weekLabels, setWeekLabels] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        load();
    }, []);

    const load = async () => {
        setLoading(true);
        try {
            const today = startOfToday();

            // Week 0 is the oldest of the four, week 3 ends today — matching the
            // left-to-right reading order of the columns.
            const labels: string[] = [];
            for (let w = 0; w < WEEKS; w++) {
                const end = new Date(today);
                end.setDate(end.getDate() - (WEEKS - 1 - w) * 7);
                const start = new Date(end);
                start.setDate(start.getDate() - 6);
                labels.push(weekLabel(start, end));
            }
            setWeekLabels(labels);

            const stats = await fetchDashboardStats();
            setBoards(stats.boards);
            setCreators(stats.creators);
            setCommunicators(stats.communicators);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ marginTop: '24px' }}>
            <Section title="Trending boards" subtitle={`in the last ${WEEKS} weeks`} count={boards.length}>
                <table style={tableStyle}>
                    <thead>
                        <tr style={headRowStyle}>
                            <th style={{ ...thStyle, width: '48px' }} />
                            <th style={thStyle}>Board</th>
                            <th style={{ ...thStyle, ...numHeadStyle }}>Items created</th>
                            <th style={{ ...thStyle, ...numHeadStyle }}>Updates posted</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <LoadingRow colSpan={4} />
                        ) : boards.length === 0 ? (
                            <EmptyRow colSpan={4} />
                        ) : boards.map((b, i) => (
                            <tr key={b.boardId} style={bodyRowStyle}>
                                <td style={{ ...tdStyle, ...rankStyle }}>{i + 1}</td>
                                <td style={{ ...tdStyle, fontWeight: 500 }}>{b.title}</td>
                                <td style={{ ...tdStyle, ...numStyle }}>{b.items.toLocaleString()}</td>
                                <td style={{ ...tdStyle, ...numStyle }}>{b.updates.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Section>

            <Section title="Top creators" subtitle={`items created in the last ${WEEKS} weeks`} count={creators.length}>
                <PeopleTable people={creators} weekLabels={weekLabels} loading={loading} />
            </Section>

            <Section title="Top communicators" subtitle={`updates posted in the last ${WEEKS} weeks`} count={communicators.length}>
                <PeopleTable people={communicators} weekLabels={weekLabels} loading={loading} />
            </Section>
        </div>
    );
};

const Section = ({ title, subtitle, count, children }: { title: string; subtitle: string; count: number; children: React.ReactNode }) => (
    <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>{title}</h3>
        <p style={{ margin: '2px 0 12px 0', fontSize: '12px', color: '#94a3b8' }}>
            {subtitle}{count > 0 && ` · ${count} in total`}
        </p>
        {/* Scrolls in both directions: down through the ranking, and sideways for the
            week columns on a narrow screen. The header is sticky so it stays readable
            the whole way down. */}
        <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            overflowX: 'auto',
            overflowY: 'auto',
            maxHeight: `${LIST_MAX_HEIGHT}px`
        }}>
            {children}
        </div>
    </div>
);

const PeopleTable = ({ people, weekLabels, loading }: { people: PersonRow[]; weekLabels: string[]; loading: boolean }) => (
    <table style={tableStyle}>
        <thead>
            <tr style={headRowStyle}>
                <th style={{ ...thStyle, width: '48px' }} />
                <th style={thStyle}>Person</th>
                {weekLabels.map(label => (
                    <th key={label} style={{ ...thStyle, ...numHeadStyle }}>{label}</th>
                ))}
            </tr>
        </thead>
        <tbody>
            {loading ? (
                <LoadingRow colSpan={2 + weekLabels.length} />
            ) : people.length === 0 ? (
                <EmptyRow colSpan={2 + weekLabels.length} />
            ) : people.map((p, i) => (
                <tr key={p.userId} style={bodyRowStyle}>
                    <td style={{ ...tdStyle, ...rankStyle }}>{i + 1}</td>
                    <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                backgroundColor: p.avatarUrl ? 'transparent' : '#6366f1',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 600,
                                overflow: 'hidden',
                                flexShrink: 0
                            }}>
                                {p.avatarUrl ? (
                                    <img
                                        src={p.avatarUrl}
                                        alt=""
                                        referrerPolicy="no-referrer"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    (p.name[0] || '?').toUpperCase()
                                )}
                            </div>
                            <span style={{ fontWeight: 500 }}>{p.name}</span>
                        </div>
                    </td>
                    {p.weeks.map((count, w) => (
                        <td key={w} style={{ ...tdStyle, ...numStyle, color: count === 0 ? '#cbd5e1' : '#0f172a' }}>
                            {count.toLocaleString()}
                        </td>
                    ))}
                </tr>
            ))}
        </tbody>
    </table>
);

const LoadingRow = ({ colSpan }: { colSpan: number }) => (
    <tr><td colSpan={colSpan} style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>Loading...</td></tr>
);

const EmptyRow = ({ colSpan }: { colSpan: number }) => (
    <tr><td colSpan={colSpan} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No activity in this period</td></tr>
);

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const headRowStyle: React.CSSProperties = { backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' };
const bodyRowStyle: React.CSSProperties = { borderBottom: '1px solid #f1f5f9' };
const thStyle: React.CSSProperties = {
    padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 600,
    color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap',
    // Sticky headers don't carry their row's border through a scroll, so the rule
    // under the header is drawn on the cells themselves.
    position: 'sticky', top: 0, zIndex: 1,
    backgroundColor: '#f8fafc', boxShadow: 'inset 0 -1px 0 #e2e8f0'
};
const numHeadStyle: React.CSSProperties = { textAlign: 'right' };
const tdStyle: React.CSSProperties = { padding: '14px 20px', fontSize: '14px', color: '#0f172a' };
const numStyle: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const rankStyle: React.CSSProperties = { color: '#94a3b8', fontSize: '13px' };
