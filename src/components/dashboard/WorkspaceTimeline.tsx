import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { format, addMonths, subMonths, addYears, subYears } from 'date-fns';
import { ArrowUpDown, ChevronLeft, ChevronRight, Eye, EyeOff, LayoutPanelLeft, Search } from 'lucide-react';
import { buildTimeGrid, computeBarSpan, isCurrentUnit, todayOffset, unitWidthFor, type TimelineViewType } from '../../lib/timelineScale';
import {
    buildTimelineRows, matchesSearch, sectionRows, sortRows,
    type TimelineGroupBy, type TimelineGroupInfo, type TimelineRow, type TimelineSort, type TimelineSortKey,
    type TimelineSourceColumn, type TimelineSourceItem
} from '../../lib/workspaceTimeline';
import { NAME_COL_WIDTH, ROW_INNER_HEIGHT, BAR_V_INSET } from '../table/timelineGeometry';

const SORT_OPTIONS: { key: TimelineSortKey; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'start', label: 'Start date' },
    { key: 'end', label: 'End date' },
    { key: 'board', label: 'Board' }
];

const GROUP_BY_OPTIONS: { key: TimelineGroupBy; label: string }[] = [
    { key: 'none', label: 'Default (no groups)' },
    { key: 'board', label: 'Board' },
    { key: 'group', label: 'Group' },
    { key: 'status', label: 'Status' }
];

const toolbarItemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    color: 'hsl(var(--color-text-secondary))',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    border: 'none',
    background: 'transparent',
    height: '32px'
};

const menuItemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 16px',
    fontSize: '13px',
    color: 'hsl(var(--color-text-primary))',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    width: '100%',
    textAlign: 'left'
};

const navBtnStyle: CSSProperties = {
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    border: '1px solid hsl(var(--color-border))',
    background: 'white',
    cursor: 'pointer',
    color: 'hsl(var(--color-text-secondary))',
    padding: '0 8px'
};

const hoverOn = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'; };
const hoverOff = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = 'transparent'; };

/** A toolbar button that opens a small menu under it. */
const MenuButton = ({ icon, label, active, width = 200, children }: {
    icon: ReactNode;
    label: string;
    active?: boolean;
    width?: number;
    children: (close: () => void) => ReactNode;
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLButtonElement>(null);
    const rect = open ? ref.current?.getBoundingClientRect() : undefined;

    return (
        <>
            <button
                ref={ref}
                onClick={() => setOpen(o => !o)}
                style={{ ...toolbarItemStyle, color: active ? 'hsl(var(--color-brand-primary))' : toolbarItemStyle.color }}
                onMouseEnter={hoverOn}
                onMouseLeave={hoverOff}
            >
                {icon}
                <span>{label}</span>
            </button>
            {open && rect && createPortal(
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
                    <div style={{
                        position: 'fixed',
                        top: rect.bottom + 8,
                        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
                        width,
                        backgroundColor: 'white',
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '8px',
                        padding: '8px 0',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        zIndex: 9999
                    }}>
                        {children(() => setOpen(false))}
                    </div>
                </>,
                document.body
            )}
        </>
    );
};

const MenuHeading = ({ children }: { children: ReactNode }) => (
    <div style={{ padding: '8px 16px', fontSize: '11px', fontWeight: 600, color: 'hsl(var(--color-text-tertiary))', textTransform: 'uppercase' }}>
        {children}
    </div>
);

/**
 * The workspace dashboard's Timeline: the board Timeline view's look, across
 * every board in the workspace. One bar per dated top-level item, coloured by
 * its group; click a name or a bar to open the item on its own board.
 *
 * Read-only on purpose — dragging a bar to reschedule or linking items needs a
 * board's permissions and dependency state; do that on the board itself.
 */
export const WorkspaceTimeline = ({ items, columns, boards, groupsByBoard, isLoading, filterControl, onOpenItem }: {
    items: TimelineSourceItem[];
    columns: TimelineSourceColumn[];
    boards: { id: string; title: string }[];
    groupsByBoard: Map<string, TimelineGroupInfo[]>;
    isLoading: boolean;
    // The board → group picker, drawn as the toolbar's Filter button.
    filterControl: ReactNode;
    onOpenItem: (itemId: string) => void;
}) => {
    const [viewDate, setViewDate] = useState(() => new Date());
    // Month by default, same as the board: a whole year fits on screen.
    const [viewType, setViewType] = useState<TimelineViewType>('month');
    const [search, setSearch] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [sort, setSort] = useState<TimelineSort>(null);
    const [groupBy, setGroupBy] = useState<TimelineGroupBy>('none');
    const [showHidden, setShowHidden] = useState(false);

    const timeGrid = useMemo(() => buildTimeGrid(viewDate, viewType), [viewDate, viewType]);
    const unitWidth = unitWidthFor(viewType);
    const gridWidth = timeGrid.length * unitWidth;

    const allRows = useMemo(
        () => buildTimelineRows({ items, columns, boards, groupsByBoard, showHidden }),
        [items, columns, boards, groupsByBoard, showHidden]
    );

    const sections = useMemo(() => {
        const visible = allRows.filter(row => matchesSearch(row, search));
        return sectionRows(sortRows(visible, sort), groupBy);
    }, [allRows, search, sort, groupBy]);

    const bars = useMemo(() => {
        const map = new Map<string, NonNullable<ReturnType<typeof computeBarSpan>>>();
        sections.forEach(section => section.rows.forEach(row => {
            const span = computeBarSpan(row.start, row.end, timeGrid, viewType, unitWidth);
            if (span) map.set(row.id, span);
        }));
        return map;
    }, [sections, timeGrid, viewType, unitWidth]);

    const todayLeft = todayOffset(timeGrid, viewType, unitWidth);
    const rowCount = sections.reduce((n, s) => n + s.rows.length, 0);

    const shift = (direction: 1 | -1) => {
        if (viewType === 'day') setViewDate(d => direction === 1 ? addMonths(d, 1) : subMonths(d, 1));
        else if (viewType === 'month') setViewDate(d => direction === 1 ? addYears(d, 1) : subYears(d, 1));
        else setViewDate(d => direction === 1 ? addYears(d, 5) : subYears(d, 5));
    };

    const title = viewType === 'day' ? format(viewDate, 'MMMM yyyy')
        : viewType === 'month' ? format(viewDate, 'yyyy')
            : `${format(subYears(viewDate, 2), 'yyyy')} - ${format(addYears(viewDate, 2), 'yyyy')}`;

    const renderRow = (row: TimelineRow) => {
        const bar = bars.get(row.id);
        const dates = `${format(row.start, 'd MMM yyyy')} – ${format(row.end, 'd MMM yyyy')}`;
        const where = [row.boardTitle, row.groupTitle].filter(Boolean).join(' · ');
        return (
            <div key={row.id} style={{ display: 'flex', height: `${ROW_INNER_HEIGHT}px`, borderBottom: '1px solid #f5f5f5', alignItems: 'center' }}>
                <div
                    onClick={() => onOpenItem(row.id)}
                    title={`${row.title}\n${where}`}
                    style={{
                        position: 'sticky', left: 0, zIndex: 6, backgroundColor: 'white',
                        width: `${NAME_COL_WIDTH}px`, flexShrink: 0, height: '100%', boxSizing: 'border-box',
                        borderRight: '1px solid #f5f5f5', padding: '0 16px', display: 'flex', alignItems: 'center',
                        fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        cursor: 'pointer', color: 'hsl(var(--color-brand-primary))', fontWeight: 500
                    }}
                >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</span>
                </div>
                <div style={{
                    position: 'relative', flexShrink: 0, width: `${gridWidth}px`, height: '100%',
                    // One unit-wide line repeated, instead of a div per cell per row.
                    backgroundImage: 'linear-gradient(to right, transparent calc(100% - 1px), #f5f5f5 calc(100% - 1px))',
                    backgroundSize: `${unitWidth}px 100%`
                }}>
                    {bar && (
                        <>
                            <div
                                onClick={() => onOpenItem(row.id)}
                                title={`${row.title}\n${where}\n${dates}`}
                                style={{
                                    position: 'absolute', top: `${BAR_V_INSET}px`, bottom: `${BAR_V_INSET}px`,
                                    left: `${bar.left}px`, width: `${bar.width}px`,
                                    backgroundColor: row.groupColor || 'hsl(var(--color-brand-primary))',
                                    borderRadius: '12px', opacity: 0.8,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: '11px', fontWeight: 500, padding: '0 8px',
                                    whiteSpace: 'nowrap', overflow: 'hidden', zIndex: 5, cursor: 'pointer',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                }}
                            >
                                {row.title}
                            </div>
                            {bar.clippedStart && (
                                <div title="Starts before what's shown" style={{ position: 'absolute', left: `${bar.left + 2}px`, top: `${BAR_V_INSET}px`, bottom: `${BAR_V_INSET}px`, display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.85)', fontSize: '10px', zIndex: 6, pointerEvents: 'none' }}>«</div>
                            )}
                            {bar.clippedEnd && (
                                <div title="Continues past what's shown" style={{ position: 'absolute', left: `${bar.left + bar.width - 12}px`, top: `${BAR_V_INSET}px`, bottom: `${BAR_V_INSET}px`, display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.85)', fontSize: '10px', zIndex: 6, pointerEvents: 'none' }}>»</div>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div style={{
            backgroundColor: 'hsl(var(--color-bg-surface, white))',
            borderRadius: '8px',
            border: '1px solid hsl(var(--color-border))',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            minWidth: 0
        }}>
            {/* Toolbar. Left padding leaves room for the card's drag handle. */}
            <div className="widget-header-with-space" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 16px', padding: '12px 20px 4px 36px' }}>
                <div style={{
                    ...toolbarItemStyle, padding: '0 8px', gap: '4px', cursor: 'text',
                    border: isSearchFocused ? '1px solid hsl(var(--color-brand-primary))' : '1px solid transparent',
                    backgroundColor: isSearchFocused ? 'white' : 'transparent'
                }}>
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Search items..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onFocus={() => setIsSearchFocused(true)}
                        onBlur={() => setIsSearchFocused(false)}
                        style={{ border: 'none', background: 'none', outline: 'none', fontSize: '14px', color: 'hsl(var(--color-text-primary))', width: '110px', padding: '4px 0' }}
                    />
                </div>

                {filterControl}

                <MenuButton icon={<ArrowUpDown size={16} />} label="Sort" active={!!sort}>
                    {close => (
                        <>
                            <MenuHeading>Sort by</MenuHeading>
                            <button style={menuItemStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff} onClick={() => { setSort(null); close(); }}>
                                <span>None</span>
                            </button>
                            {SORT_OPTIONS.map(option => (
                                <button
                                    key={option.key}
                                    style={menuItemStyle}
                                    onMouseEnter={hoverOn}
                                    onMouseLeave={hoverOff}
                                    // Picking the one already chosen flips its direction, like the board's Sort.
                                    onClick={() => {
                                        setSort(prev => ({ key: option.key, direction: prev?.key === option.key && prev.direction === 'asc' ? 'desc' : 'asc' }));
                                        close();
                                    }}
                                >
                                    <span>{option.label}</span>
                                    {sort?.key === option.key && (
                                        <span style={{ fontSize: '10px', marginLeft: 'auto', opacity: 0.6 }}>{sort.direction === 'asc' ? 'ASC' : 'DESC'}</span>
                                    )}
                                </button>
                            ))}
                        </>
                    )}
                </MenuButton>

                <MenuButton icon={<LayoutPanelLeft size={16} />} label="Group by" active={groupBy !== 'none'}>
                    {close => (
                        <>
                            <MenuHeading>Group by</MenuHeading>
                            {GROUP_BY_OPTIONS.map(option => (
                                <button
                                    key={option.key}
                                    style={menuItemStyle}
                                    onMouseEnter={hoverOn}
                                    onMouseLeave={hoverOff}
                                    onClick={() => { setGroupBy(option.key); close(); }}
                                >
                                    <span>{option.label}</span>
                                    {groupBy === option.key && (
                                        <span style={{ fontSize: '10px', marginLeft: 'auto', color: 'hsl(var(--color-brand-primary))' }}>●</span>
                                    )}
                                </button>
                            ))}
                        </>
                    )}
                </MenuButton>

                <button
                    onClick={() => setShowHidden(v => !v)}
                    title={showHidden ? 'Showing hidden items' : 'Hidden items are not shown'}
                    style={toolbarItemStyle}
                    onMouseEnter={hoverOn}
                    onMouseLeave={hoverOff}
                >
                    {showHidden ? <Eye size={16} /> : <EyeOff size={16} />}
                    <span>Hide</span>
                </button>
            </div>

            {/* Navigator */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 16px', padding: '12px 20px 12px 36px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'hsl(var(--color-text-primary))' }}>{title}</h3>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => shift(-1)} style={navBtnStyle} aria-label="Previous"><ChevronLeft size={18} /></button>
                    <button onClick={() => shift(1)} style={navBtnStyle} aria-label="Next"><ChevronRight size={18} /></button>
                </div>
                <button onClick={() => setViewDate(new Date())} style={{ ...navBtnStyle, fontSize: '14px', padding: '0 12px' }}>Today</button>
                <div style={{ display: 'flex', backgroundColor: '#f5f6f8', borderRadius: '6px', padding: '2px' }}>
                    {(['day', 'month', 'year'] as const).map(type => (
                        <button
                            key={type}
                            onClick={() => setViewType(type)}
                            style={{
                                border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '13px',
                                fontWeight: viewType === type ? 600 : 400,
                                backgroundColor: viewType === type ? 'white' : 'transparent',
                                color: viewType === type ? 'hsl(var(--color-text-primary))' : 'hsl(var(--color-text-tertiary))',
                                cursor: 'pointer', boxShadow: viewType === type ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                textTransform: 'capitalize'
                            }}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid. Capped and scrolled: a workspace's timeline can run to hundreds of rows. */}
            <div style={{ flex: 1, minHeight: 0, maxHeight: '520px', overflow: 'auto', borderTop: '1px solid hsl(var(--color-border))' }}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 'max-content', position: 'relative' }}>
                    <div style={{ display: 'flex', borderBottom: '1px solid hsl(var(--color-border))', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white' }}>
                        <div style={{
                            position: 'sticky', left: 0, zIndex: 11, backgroundColor: 'white',
                            width: `${NAME_COL_WIDTH}px`, flexShrink: 0, boxSizing: 'border-box',
                            borderRight: '1px solid hsl(var(--color-border))', padding: '12px 16px', fontWeight: 600, fontSize: '13px'
                        }}>
                            Item Name
                        </div>
                        {timeGrid.map(unit => {
                            const isCurrent = isCurrentUnit(viewType, unit);
                            return (
                                <div key={unit.toISOString()} style={{
                                    width: `${unitWidth}px`, flexShrink: 0, boxSizing: 'border-box', textAlign: 'center', padding: '12px 0', fontSize: '12px',
                                    borderRight: '1px solid hsl(var(--color-border-subtle, #eee))',
                                    color: isCurrent ? 'hsl(var(--color-brand-primary))' : 'inherit',
                                    fontWeight: isCurrent ? 700 : 400
                                }}>
                                    <div>{viewType === 'day' ? format(unit, 'd') : viewType === 'month' ? format(unit, 'MMM') : format(unit, 'yyyy')}</div>
                                    {viewType === 'day' && <div style={{ fontSize: '10px', opacity: 0.5 }}>{format(unit, 'EEE')}</div>}
                                    {viewType === 'month' && <div style={{ fontSize: '10px', opacity: 0.5 }}>{format(unit, 'yyyy')}</div>}
                                </div>
                            );
                        })}
                    </div>

                    {isLoading ? (
                        <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: '13px', color: 'hsl(var(--color-text-tertiary))', position: 'sticky', left: 0 }}>
                            Loading timeline…
                        </div>
                    ) : rowCount === 0 ? (
                        <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: '13px', color: 'hsl(var(--color-text-tertiary))', position: 'sticky', left: 0 }}>
                            {allRows.length === 0
                                ? 'No scheduled items yet. An item shows here once it has a Date, Timeline or Due date.'
                                : 'No items match.'}
                        </div>
                    ) : (
                        <div style={{ position: 'relative' }}>
                            {todayLeft !== null && (
                                <div style={{
                                    position: 'absolute', left: `${NAME_COL_WIDTH + todayLeft}px`, top: 0, bottom: 0, width: '2px',
                                    backgroundColor: '#f00', zIndex: 4, pointerEvents: 'none', opacity: 0.6
                                }} />
                            )}
                            {sections.map(section => (
                                <div key={section.key}>
                                    {groupBy !== 'none' && (
                                        <div style={{ display: 'flex', height: `${ROW_INNER_HEIGHT}px`, backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9', alignItems: 'center' }}>
                                            <div style={{
                                                position: 'sticky', left: 0, zIndex: 6, backgroundColor: '#f8fafc',
                                                width: `${NAME_COL_WIDTH * 2}px`, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px',
                                                fontSize: '12px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', whiteSpace: 'nowrap', overflow: 'hidden'
                                            }}>
                                                {section.color && <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: section.color, flexShrink: 0 }} />}
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{section.label}</span>
                                                {section.sublabel && <span style={{ fontWeight: 400, color: 'hsl(var(--color-text-tertiary))', overflow: 'hidden', textOverflow: 'ellipsis' }}>{section.sublabel}</span>}
                                                <span style={{ fontWeight: 400, color: 'hsl(var(--color-text-tertiary))' }}>{section.rows.length}</span>
                                            </div>
                                            <div style={{ width: `${Math.max(0, gridWidth - NAME_COL_WIDTH)}px`, flexShrink: 0 }} />
                                        </div>
                                    )}
                                    {section.rows.map(renderRow)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
