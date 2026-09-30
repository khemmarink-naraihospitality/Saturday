import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActivityLogItem, type ActivityLog } from '../components/common/ActivityLogList';
import { buildCatCushions, NO_STATUS_KEY, NEUTRAL_CUSHION_COLOR, type CatFarmGroup } from '../lib/catFarmLayout';
import { useBoardStore } from '../store/useBoardStore';
import { BarChart2, Clock, Filter, MoreHorizontal, GripVertical } from 'lucide-react';
import { 
    DndContext, 
    closestCenter, 
    KeyboardSensor, 
    PointerSensor, 
    useSensor, 
    useSensors, 
    DragOverlay,
    type DragEndEvent
} from '@dnd-kit/core';
import { 
    arrayMove, 
    SortableContext, 
    sortableKeyboardCoordinates, 
    useSortable,
    rectSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '../lib/supabase';

const SvgCat = ({ size, color, pose = 'walk' }: { size: number, color: string, pose?: string }) => {
    const isWalking = pose === 'walk';
    const isSleeping = pose === 'sleep';
    const isSitting = pose === 'sit';

    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={`cute-anim-cat ${pose}`}>
            {/* Tail */}
            <path className="cat-tail" d="M 75 45 C 95 30, 95 60, 85 70" stroke={color} strokeWidth="8" strokeLinecap="round" fill="none" style={{ transformOrigin: '75px 45px' }} />
            
            {/* Back Legs */}
            <g className={`cat-leg back-leg ${isWalking ? 'wiggle' : ''} ${isSitting ? 'sitting' : ''}`} style={{ transformOrigin: '65px 75px' }}>
                <rect x="60" y={isSitting ? 75 : 70} width="12" height={isSitting ? 12 : 18} rx="6" fill={color} opacity="0.8" />
                <path d="M 60 85 Q 66 88, 72 85" stroke="rgba(0,0,0,0.1)" strokeWidth="2" fill="none" />
            </g>
            <g className={`cat-leg front-leg ${isWalking ? 'wiggle-alt' : ''} ${isSitting ? 'sitting' : ''}`} style={{ transformOrigin: '35px 75px' }}>
                <rect x="30" y={isSitting ? 75 : 70} width="12" height={isSitting ? 12 : 18} rx="6" fill={color} opacity="0.8" />
                <path d="M 30 85 Q 36 88, 42 85" stroke="rgba(0,0,0,0.1)" strokeWidth="2" fill="none" />
            </g>

            {/* Body */}
            <rect x="25" y={isSitting ? 30 : 35} width="55" height={isSitting ? 50 : 45} rx="22" fill={color} />
            
            {/* Front Legs (closest to viewer) */}
            <g className={`cat-leg front-leg-alt ${isWalking ? 'wiggle' : ''}`} style={{ transformOrigin: '45px 75px' }}>
                <rect x="40" y={isSitting ? 77 : 72} width="14" height={isSitting ? 15 : 20} rx="7" fill={color} />
                <path d="M 40 88 Q 47 91, 54 88" stroke="rgba(0,0,0,0.1)" strokeWidth="2" fill="none" />
            </g>
            <g className={`cat-leg back-leg-alt ${isWalking ? 'wiggle-alt' : ''}`} style={{ transformOrigin: '55px 75px' }}>
                <rect x="50" y={isSitting ? 77 : 72} width="14" height={isSitting ? 15 : 20} rx="7" fill={color} />
                <path d="M 50 88 Q 57 91, 64 88" stroke="rgba(0,0,0,0.1)" strokeWidth="2" fill="none" />
            </g>

            {/* Head */}
            <circle cx="35" cy={isSitting ? 33 : 38} r="22" fill={color} />
            
            {/* Ears */}
            <path d={`M 18 ${isSitting ? 19 : 24} L 14 ${isSitting ? 1 : 6} L 28 ${isSitting ? 13 : 18}`} fill={color} />
            <path d={`M 42 ${isSitting ? 13 : 18} L 56 ${isSitting ? 1 : 6} L 52 ${isSitting ? 22 : 24}`} fill={color} />
            
            {/* Inner Ears */}
            <path d={`M 20 ${isSitting ? 17: 22} L 17 ${isSitting ? 7 : 12} L 25 ${isSitting ? 13 : 18}`} fill="#ffd1dc" />
            <path d={`M 45 ${isSitting ? 13: 18} L 53 ${isSitting ? 7 : 12} L 50 ${isSitting ? 17 : 22}`} fill="#ffd1dc" />

            {/* Eyes */}
            <g className="cat-eyes">
                {isSleeping ? (
                    <>
                        <path d="M 22 38 Q 26 42, 30 38" stroke="#1e1e1e" strokeWidth="2" strokeLinecap="round" fill="none" />
                        <path d="M 40 38 Q 44 42, 48 38" stroke="#1e1e1e" strokeWidth="2" strokeLinecap="round" fill="none" />
                    </>
                ) : (
                    <>
                        <circle cx="26" cy={isSitting ? 35 : 38} r="5" fill="#1e1e1e" />
                        <circle cx="44" cy={isSitting ? 35 : 38} r="5" fill="#1e1e1e" />
                        {/* Highlights */}
                        <circle cx="24" cy={isSitting ? 33 : 36} r="2" fill="#fff" />
                        <circle cx="42" cy={isSitting ? 33 : 36} r="2" fill="#fff" />
                        <circle cx="27.5" cy={isSitting ? 37 : 40} r="1" fill="#fff" />
                        <circle cx="45.5" cy={isSitting ? 37 : 40} r="1" fill="#fff" />
                    </>
                )}
            </g>

            {/* Blushes */}
            <circle cx="20" cy={isSitting ? 42 : 45} r="4" fill="#ffb6c1" fillOpacity="0.6" />
            <circle cx="50" cy={isSitting ? 42 : 45} r="4" fill="#ffb6c1" fillOpacity="0.6" />

            {/* Mouth / Nose */}
            <path d={`M 32 ${isSitting ? 41 : 44} Q 35 ${isSitting ? 44 : 47}, 38 ${isSitting ? 41 : 44}`} stroke="#1e1e1e" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d={`M 33 ${isSitting ? 39 : 42} Q 35 ${isSitting ? 40 : 43}, 37 ${isSitting ? 39 : 42}`} stroke="#1e1e1e" strokeWidth="1" fill="none" />
        </svg>
    );
};

/**
 * The Cat Farm's contents: a cushion per status with that status's cats piled
 * on top, each cushion as wide as its share of the tasks.
 *
 * A component of its own rather than part of renderWidget because it has to
 * measure itself: how many cushions fit, and how many cats each can seat,
 * depends on the card's real width, which varies with the dashboard layout.
 */
const CatCushionFarm = ({ groups }: { groups: CatFarmGroup[] }) => {
    const rowRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const hasTasks = groups.some(group => group.items.length > 0);

    // Keyed on hasTasks: while the farm is empty the row isn't rendered, so the
    // observer has to attach again once the first task shows up.
    useEffect(() => {
        const row = rowRef.current;
        if (!row) return;
        const observer = new ResizeObserver(entries => {
            setWidth(Math.floor(entries[0].contentRect.width));
        });
        observer.observe(row);
        return () => observer.disconnect();
    }, [hasTasks]);

    const { cushions } = useMemo(() => buildCatCushions(groups, { width }), [groups, width]);

    if (!hasTasks) {
        return (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: '24px', zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div style={{ animation: 'catSleep 5s ease-in-out infinite' }}>
                    <SvgCat size={40} color={NEUTRAL_CUSHION_COLOR} pose="sleep" />
                </div>
                <span style={{ fontSize: '12px', color: '#64748b' }}>No tasks yet</span>
            </div>
        );
    }

    return (
        <div
            ref={rowRef}
            style={{ position: 'absolute', left: '16px', right: '16px', bottom: '12px', height: '116px', zIndex: 3, display: 'flex', alignItems: 'stretch', gap: '6px' }}
        >
            {cushions.map((cushion, index) => {
                // The outer tooltips hug their own edge so a wide one isn't cut
                // off by the card, which clips its overflow.
                const edge = cushions.length > 1 && index === 0 ? ' edge-left'
                    : cushions.length > 1 && index === cushions.length - 1 ? ' edge-right'
                        : '';

                return (
                    <div key={cushion.key} style={{ width: `${cushion.width}px`, flex: 'none', position: 'relative' }}>
                        {/* The pile, sitting on the cushion's top edge */}
                        <div style={{ position: 'absolute', left: 0, right: 0, bottom: '34px', height: '64px' }}>
                            {cushion.cats.map(cat => (
                                <div
                                    key={cat.id}
                                    className="cat-container"
                                    style={{
                                        position: 'absolute',
                                        // Centred with calc rather than a transform:
                                        // .cat-container:hover sets transform to scale
                                        // it up, which would wipe out a translateX.
                                        left: `calc(${cat.leftPct}% - ${cat.size / 2}px)`,
                                        bottom: `${cat.bottomPx}px`,
                                        width: `${cat.size}px`,
                                        height: `${cat.size}px`,
                                        zIndex: cat.zIndex,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div className="cat-tooltip">{cat.taskName}</div>
                                    <div className="cat-visual" style={{
                                        animation: cat.pose === 'sleep'
                                            ? 'catSleep 5s ease-in-out infinite'
                                            : 'catBob 1.2s ease-in-out infinite alternate',
                                        animationDelay: `${cat.delay}s`
                                    }}>
                                        {/* Own element, since the animation above
                                            already drives this one's transform.
                                            SvgCat's sleep pose only shuts the eyes,
                                            so sleepers are squashed a little to read
                                            as lying on the cushion rather than
                                            dozing on their feet. */}
                                        <div style={{
                                            transform: `scaleX(${cat.flip ? -1 : 1})${cat.pose === 'sleep' ? ' scaleY(0.82)' : ''}`,
                                            transformOrigin: 'center bottom'
                                        }}>
                                            <SvgCat size={cat.size} color={cat.color} pose={cat.pose} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Cushion and label — hovering either explains the cushion */}
                        <div className="cushion-hit" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '34px' }}>
                            <div className={`cat-tooltip${edge}`}>
                                {cushion.members ? (
                                    <>
                                        <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                                            {cushion.count} tasks · {cushion.percent}%
                                        </div>
                                        {cushion.members.map(member => (
                                            <div key={member.label}>{member.label} · {member.count}</div>
                                        ))}
                                    </>
                                ) : (
                                    <>{cushion.label} · {cushion.count} {cushion.count === 1 ? 'task' : 'tasks'} · {cushion.percent}%</>
                                )}
                            </div>
                            <div style={{
                                height: '14px',
                                borderRadius: '999px',
                                // A pastel tint of the status colour, so the cats,
                                // drawn in the full colour, stand out on it rather
                                // than melting into it.
                                background: `linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.3)), ${cushion.color}`,
                                boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.10)'
                            }} />
                            <div style={{ marginTop: '5px', display: 'flex', justifyContent: 'center', gap: '4px', fontSize: '11px', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cushion.label}</span>
                                <strong style={{ color: '#1e293b', flexShrink: 0 }}>{cushion.count}</strong>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const DraggableDashboardWidget = ({ id, children, isFullWidth = false }: { id: string, children: React.ReactNode, isFullWidth?: boolean }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 1,
        position: 'relative' as const,
        opacity: isDragging ? 0.3 : 1,
        gridColumn: isFullWidth ? 'span 2' : 'span 1',
        height: '100%',
        touchAction: 'none'
    };

    return (
        <div ref={setNodeRef} style={style} className="dashboard-draggable-wrapper">
            <div className="widget-drag-handle-container" style={{ position: 'relative', height: '100%', width: '100%' }}>
                {/* Drag Handle - Slimmer, positioned further left */}
                <div 
                    {...attributes} 
                    {...listeners}
                    style={{
                        position: 'absolute',
                        top: '21px', // Center point of the header content (12px padding + ~9px half-text height)
                        left: '10px', 
                        transform: 'translateY(-50%)',
                        cursor: 'grab',
                        padding: '4px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0,
                        transition: 'all 0.2s ease',
                        zIndex: 20,
                        color: 'hsl(var(--color-text-tertiary))'
                    }}
                    className="grip-handle"
                    title="Drag to reorder"
                >
                    <GripVertical size={14} />
                </div>

                {children}
            </div>

            <style>{`
                .dashboard-draggable-wrapper:hover .grip-handle {
                    opacity: 1 !important;
                }
                .grip-handle:hover {
                    background: hsl(var(--color-bg-base, #f1f5f9));
                    color: hsl(var(--color-text-primary)) !important;
                    transform: scale(1.1);
                }
                .grip-handle:active {
                    cursor: grabbing;
                    transform: scale(0.95);
                }
            `}</style>
        </div>
    );
};

interface StatusColumnOption {
    key: string;
    label: string;
    columnIds: Set<string>;
}

/**
 * Picks which Status column the status widgets count.
 *
 * A board can carry more than one Status column (a delivery status and an
 * approval status, say). Counting them together produces a chart of two
 * unrelated vocabularies and a "% Done" whose denominator is one row counted
 * twice, so the column has to be selectable.
 */
const StatusColumnFilter = ({ options, value, onChange, isOpen, onToggle, onClose }: {
    options: StatusColumnOption[];
    value: string | null;
    onChange: (key: string | null) => void;
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
}) => {
    const buttonRef = useRef<HTMLButtonElement>(null);

    if (options.length < 2) return null; // nothing to disambiguate

    const active = options.find(o => o.key === value);

    // Fixed to the viewport and hung off the button's rect rather than absolutely
    // positioned inside it: the cat widget clips its own overflow, which would
    // otherwise cut the menu off at the edge of the card.
    const menuPosition = () => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect) return { top: 0, left: 0 };
        const WIDTH = 220;
        const HEIGHT = 260;
        const top = rect.bottom + HEIGHT > window.innerHeight
            ? Math.max(8, rect.top - HEIGHT - 6)
            : rect.bottom + 6;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8));
        return { top, left };
    };

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                ref={buttonRef}
                onClick={onToggle}
                title={active ? `Showing: ${active.label}` : 'Showing: all status columns'}
                style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: value ? 'hsl(var(--color-brand-primary))' : '#64748b'
                }}
            >
                <Filter size={16} />
                {active && (
                    <span style={{ fontSize: '12px', fontWeight: 500, maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {active.label}
                    </span>
                )}
            </button>

            {isOpen && createPortal(
                <>
                    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                    <div style={{
                        position: 'fixed',
                        ...menuPosition(),
                        minWidth: '220px',
                        backgroundColor: 'white',
                        border: '1px solid hsl(var(--color-border))',
                        borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                        zIndex: 61,
                        overflow: 'hidden'
                    }}>
                        <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
                            Status column
                        </div>
                        {[{ key: null as string | null, label: 'All status columns' }, ...options].map(option => (
                            <button
                                key={option.key ?? '__all__'}
                                onClick={() => { onChange(option.key); onClose(); }}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '8px 12px',
                                    border: 'none',
                                    background: option.key === value ? 'hsl(var(--color-bg-hover, #f1f5f9))' : 'transparent',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    color: '#0f172a',
                                    fontWeight: option.key === value ? 600 : 400,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}
                                onMouseEnter={(e) => { if (option.key !== value) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                                onMouseLeave={(e) => { if (option.key !== value) e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};

export const WorkspaceDashboardPage = () => {
    const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
    const workspaces = useBoardStore(state => state.workspaces);
    const allBoards = useBoardStore(state => state.boards);
    
    // Track widget order
    const [widgetOrder, setWidgetOrder] = useState(['totalTasks', 'totalStatus', 'catFarm', 'workStatusChart', 'boardUpdates']);

    // Configure DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // 5px movement required to start drag
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        
        if (over && active.id !== over.id) {
            setWidgetOrder((items) => {
                const oldIndex = items.indexOf(active.id as string);
                const newIndex = items.indexOf(over.id as string);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const workspace = workspaces.find(w => w.id === activeWorkspaceId);
    const workspaceBoards = useMemo(() => 
        allBoards.filter(b => b.workspaceId === activeWorkspaceId && !b.is_archived),
    [allBoards, activeWorkspaceId]);

    // What the dashboard's fetches actually depend on: which boards, not the
    // board objects. `boards` is replaced on every store write (a realtime edit
    // anywhere, the 5-minute poll), and keying the fetches on workspaceBoards
    // itself re-ran them all each time — the feed blanked to "Loading…" and
    // came back, and the cats re-shuffled, whenever anything changed anywhere.
    const workspaceBoardIdsKey = useMemo(
        () => workspaceBoards.map(b => b.id).sort().join(','),
        [workspaceBoards]
    );

    // The feed spans every board in the workspace, so each entry names its board.
    const boardTitleById = useMemo(
        () => new Map(workspaceBoards.map(b => [b.id, b.title])),
        [workspaceBoards]
    );

    // Optimization: Fetch all needed data for the workspace in bulk
    const [workspaceData, setWorkspaceData] = useState<{ items: any[], columns: any[] }>({ items: [], columns: [] });
    const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);
    const [logsLoading, setLogsLoading] = useState(true);
    // Which workspace the rows in recentLogs belong to.
    const logsWorkspaceRef = useRef<string | null>(null);
    const [workspaceMemberProfiles, setWorkspaceMemberProfiles] = useState<Record<string, string>>({});

    // Which Status column each widget counts; null keeps the original behaviour
    // of counting every one of them together. Held per widget, not per board:
    // one shared choice meant picking a column for the Work Status chart
    // silently re-scoped Total Status and the cats along with it. Remembered
    // per workspace, since the choice is about that workspace's own columns.
    const STATUS_FILTER_WIDGETS = ['totalStatus', 'workStatusChart', 'catFarm'];
    const statusFilterKey = (widgetId: string) =>
        `dashboardStatusColumn:${activeWorkspaceId || 'none'}:${widgetId}`;
    const legacyStatusFilterKey = `dashboardStatusColumn:${activeWorkspaceId || 'none'}`;

    const [statusColFilters, setStatusColFilters] = useState<Record<string, string | null>>({});
    const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null);

    useEffect(() => {
        try {
            // One-time migration of the old shared key: whatever was selected
            // becomes each widget's own starting point, so nobody's dashboard
            // silently resets. Removed afterwards so clearing a widget's filter
            // later isn't undone by the old value reappearing on reload.
            const legacy = localStorage.getItem(legacyStatusFilterKey);
            if (legacy !== null) {
                STATUS_FILTER_WIDGETS.forEach(id => {
                    if (localStorage.getItem(statusFilterKey(id)) === null) {
                        localStorage.setItem(statusFilterKey(id), legacy);
                    }
                });
                localStorage.removeItem(legacyStatusFilterKey);
            }

            const stored: Record<string, string | null> = {};
            STATUS_FILTER_WIDGETS.forEach(id => {
                stored[id] = localStorage.getItem(statusFilterKey(id));
            });
            setStatusColFilters(stored);
        } catch {
            setStatusColFilters({});
        }
    }, [activeWorkspaceId]);

    const applyStatusColFilter = (widgetId: string, key: string | null) => {
        setStatusColFilters(prev => ({ ...prev, [widgetId]: key }));
        try {
            if (key) localStorage.setItem(statusFilterKey(widgetId), key);
            else localStorage.removeItem(statusFilterKey(widgetId));
        } catch { /* private mode — the choice just won't persist */ }
    };

    /**
     * The selectable Status columns, as the reader thinks of them rather than
     * as raw rows: the same column exists once per board, so they're grouped by
     * title and counted together across boards. A board with two columns of the
     * same name (the case that prompted this) disambiguates by position — the
     * second "Status" becomes "Status (2)".
     */
    const statusColumnOptions = useMemo<StatusColumnOption[]>(() => {
        const byBoard = new Map<string, any[]>();
        workspaceData.columns
            .filter(c => c?.type === 'status')
            .forEach(c => {
                const list = byBoard.get(c.board_id) || [];
                list.push(c);
                byBoard.set(c.board_id, list);
            });

        const identities = new Map<string, StatusColumnOption>();
        byBoard.forEach(cols => {
            const seen = new Map<string, number>();
            cols.forEach(col => {
                const title = (col.title || 'Status').trim();
                const normalized = title.toLowerCase();
                const occurrence = (seen.get(normalized) || 0) + 1;
                seen.set(normalized, occurrence);

                const key = `${normalized}#${occurrence}`;
                const existing = identities.get(key);
                if (existing) {
                    existing.columnIds.add(col.id);
                } else {
                    identities.set(key, {
                        key,
                        label: occurrence === 1 ? title : `${title} (${occurrence})`,
                        columnIds: new Set([col.id])
                    });
                }
            });
        });

        return Array.from(identities.values());
    }, [workspaceData.columns]);

    useEffect(() => {
        if (!activeWorkspaceId || workspaceBoards.length === 0) return;

        async function fetchWorkspaceData() {
            const boardIds = workspaceBoards.map(b => b.id);

            try {
                // Batch fetch columns and items for all boards in the workspace
                const [colsRes, itemsRes] = await Promise.all([
                    supabase.from('columns').select('*').in('board_id', boardIds).order('order'),
                    // title is what each cat's hover tooltip shows. It was missing from
                    // this list, so every cat said "Untitled Task".
                    supabase.from('items').select('id, title, board_id, group_id, values, is_hidden, parent_id').in('board_id', boardIds)
                ]);

                const columns = colsRes.data || [];
                const items = itemsRes.data || [];

                console.log("Dashboard: Data Fetched", { 
                    colCount: columns.length, 
                    itemCount: items.length, 
                    sampleItem: items[0] ? { ...items[0], values: '...' } : null 
                });

                setWorkspaceData({ items, columns });

                // Optimize Profile Fetching using the newly loaded items
                const userIds = new Set<string>();
                const peopleCols = columns.filter(c => c.type === 'people');
                
                items.forEach(item => {
                    peopleCols.forEach(pCol => {
                        const pVal = item.values?.[pCol.id];
                        const assignedPeople = Array.isArray(pVal) ? pVal : (pVal ? [pVal] : []);
                        assignedPeople.forEach(p => {
                            if (typeof p === 'string') userIds.add(p);
                            else if (p && typeof p === 'object') {
                                const pId = p.id || p.user_id;
                                if (pId) userIds.add(pId);
                            }
                        });
                    });
                });

                if (userIds.size > 0) {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, full_name, email')
                        .in('id', Array.from(userIds));

                    if (profiles) {
                        const map: Record<string, string> = {};
                        profiles.forEach((p: any) => {
                            map[p.id] = p.full_name || p.email?.split('@')[0] || 'Member';
                        });
                        setWorkspaceMemberProfiles(map);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch workspace summary data:", err);
            }
        }

        fetchWorkspaceData();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the board ids on purpose, see workspaceBoardIdsKey
    }, [activeWorkspaceId, workspaceBoardIdsKey]);

    useEffect(() => {
        if (!activeWorkspaceId) return;
        if (workspaceBoards.length === 0) {
            setRecentLogs([]);
            setLogsLoading(false);
            return;
        }

        let cancelled = false;
        async function fetchLogs() {
            // Only blank the list when switching workspace. A refresh of the one
            // already on screen keeps showing it until the new rows land.
            if (logsWorkspaceRef.current !== activeWorkspaceId) {
                setRecentLogs([]);
                setLogsLoading(true);
            }

            // Server-side, through get_workspace_activity: it narrows to this
            // workspace's rows with indexes and only then applies the RLS rule,
            // where querying the table directly made Postgres check the rule on
            // every log in the system first (1 s for an admin, 6 s for a member).
            const { data, error } = await supabase.rpc('get_workspace_activity', {
                p_workspace_id: activeWorkspaceId,
                p_limit: 30
            });

            if (cancelled) return;
            if (error) {
                console.error('Dashboard: failed to load workspace activity', error);
            } else {
                setRecentLogs((data || []).map((row: any) => ({
                    ...row,
                    actor_name: row.actor_name || row.actor_email?.split('@')[0] || 'System'
                })));
                logsWorkspaceRef.current = activeWorkspaceId;
            }
            setLogsLoading(false);
        }

        fetchLogs();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the board ids on purpose, see workspaceBoardIdsKey
    }, [activeWorkspaceId, workspaceBoardIdsKey]);

    // The board activity panel only highlights a row, because a board is already
    // open there. From the dashboard nothing is, so a click opens the task on its
    // own board instead — the same board + item route notifications take.
    const openTaskFromActivity = (itemId: string) => {
        const boardId = workspaceData.items.find(i => i.id === itemId)?.board_id;
        if (!boardId) return;
        const store = useBoardStore.getState();
        store.setActiveBoard(boardId);
        store.setActiveItem(itemId);
    };

    // Note: loadBoardData is no longer needed here as we use workspaceData for stats
    // This dramatically improves performance in the dashboard view.
    useEffect(() => {
        // Only load data if specifically requested by other components or store actions
    }, []);

    // Parameterised by the filter rather than closing over one shared value, so
    // each widget can be costed for its own selection.
    const computeStats = useCallback((statusColFilter: string | null) => {
        // Defensive check for missing or empty data
        if (!workspaceData?.items || !workspaceData?.columns || workspaceData.columns.length === 0) {
            console.log("Dashboard: No data to render stats", { items: workspaceData?.items?.length, cols: workspaceData?.columns?.length });
            return { 
                totalTasks: 0, 
                statusCounts: {}, 
                totalStatusValues: 0, 
                completionPercent: "0", 
                catGroups: [] as CatFarmGroup[], 
                peopleMap: {} 
            };
        }

        const statusCounts: Record<string, { label: string, color: string, count: number, workloadCount: number, people: Record<string, { count: number, name: string }> }> = {};
        const peopleMap: Record<string, { name: string, color: string, totalTasks: number }> = {};
        
        const stringToColor = (str: string) => {
            let hash = 0;
            for (let i = 0; i < (str || '').length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            const h = Math.abs(hash) % 360;
            return `hsl(${h}, 85%, 55%)`;
        };

        // When a specific Status column is selected, every figure below — the
        // bar, the % Done, the workload chart, the cats' colours — is computed
        // from that column alone.
        const selectedStatusIdentity = statusColFilter
            ? statusColumnOptions.find(o => o.key === statusColFilter)
            : null;
        const statusCols = workspaceData.columns.filter(c =>
            c?.type === 'status' && (!selectedStatusIdentity || selectedStatusIdentity.columnIds.has(c.id))
        );
        const peopleCols = workspaceData.columns.filter(c => c?.type === 'people');

        // 1. Initialize statusCounts map from all status columns
        statusCols.forEach(col => {
            if (!col) return;
            try {
                // schema uses 'options', code also supports 'settings' for flexibility
                const labels = col.options || col.settings ? (typeof col.settings === 'string' ? JSON.parse(col.settings) : (col.settings || col.options)) : {};
                
                const entries = Array.isArray(labels) ? labels.map((l, idx) => [l.id || idx.toString(), l]) : Object.entries(labels);

                (entries as any[]).forEach(([key, label]: [string, any]) => {
                    if (!key || !label) return;
                    
                    const parsedLabel = typeof label === 'string' ? label : (label.text || label.label || label.title || 'Unknown');
                    
                    // Exclude "Unknown" status from being calculated in the dashboard
                    if (parsedLabel.toLowerCase() === 'unknown') return;

                    if (!statusCounts[key]) {
                        statusCounts[key] = {
                            label: parsedLabel,
                            color: label.color || '#cbd5e1',
                            count: 0,
                            workloadCount: 0,
                            people: {}
                        };
                    }
                });
            } catch (e) {
                console.error("Dashboard: Error parsing status settings", e);
            }
        });

        let totalTasks = workspaceData.items.length;
        let doneCount = 0;
        let totalStatusValues = 0;

        // Filter out Subitems (items that have a parent_id)
        const mainItems = workspaceData.items.filter(item => !item.parent_id);

        // Which status each main item shows under in the Cat Farm: its first
        // matched status, same precedence the old cat loop used. Keyed by option
        // id here, merged by label once the loop is done.
        const firstStatusKeyByItem = new Map<string, string>();

        // 2. Count statuses and workload (Only for main items)
        mainItems.forEach(item => {
            if (!item || !item.values) return;

            statusCols.forEach(sCol => {
                const val = item.values[sCol.id];
                if (!val) return;

                // Handle both option ID and object-based status values
                let matchedKey = null;
                if (typeof val === 'string' && statusCounts[val]) {
                    matchedKey = val;
                } else {
                    // Try to match by label text if it's an object
                    const labelText = typeof val === 'string' ? val : (val.label || val.text || '');
                    if (labelText) {
                        matchedKey = Object.keys(statusCounts).find(k => statusCounts[k].label === labelText);
                    }
                }

                if (matchedKey) {
                    if (item.id && !firstStatusKeyByItem.has(item.id)) {
                        firstStatusKeyByItem.set(item.id, matchedKey);
                    }
                    const status = statusCounts[matchedKey];
                    status.count++;
                    status.workloadCount++;
                    totalStatusValues++;
                    
                    const labelLower = (status.label || "").toLowerCase();
                    if (labelLower === 'done' || labelLower === 'completed') {
                        doneCount++;
                    }

                    // People/Workload per status
                    peopleCols.forEach(pCol => {
                        const pVal = item.values[pCol.id];
                        const rawPeople = Array.isArray(pVal) ? pVal : (pVal ? [pVal] : []);
                        
                        const assignedPeopleIds = rawPeople.map((p: any) => {
                            if (!p) return null;
                            if (typeof p === 'string') return p;
                            return p.id || p.user_id;
                        }).filter(Boolean) as string[];
                        
                        assignedPeopleIds.forEach((pId: string) => {
                            const pName = workspaceMemberProfiles[pId] || 'Member';
                            if (!status.people[pId]) {
                                status.people[pId] = { count: 0, name: pName };
                            }
                            status.people[pId].count++;

                            if (!peopleMap[pId]) {
                                peopleMap[pId] = { name: pName, color: stringToColor(pName), totalTasks: 0 };
                            }
                            peopleMap[pId].totalTasks++;
                        });
                    });
                }
            });
        });

        // Clean up empty statuses so they don't appear in the graphs
        Object.keys(statusCounts).forEach(key => {
            if (statusCounts[key].workloadCount === 0) {
                delete statusCounts[key];
            }
        });

        const completionPercent = totalStatusValues > 0 ? ((doneCount / totalStatusValues) * 100).toFixed(1) : "0";
        
        // 3. Cat Farm: one cushion per status. Grouped by label rather than by
        // option id: every board has its own copy of a column's options, so
        // "Done" on three boards is three ids — as separate cushions that would
        // read as three different statuses. Items with no status get their own
        // "No status" cushion instead of borrowing the first status's colour,
        // which made them look like a real status they weren't.
        const catGroups = new Map<string, CatFarmGroup>();
        mainItems.forEach(item => {
            if (!item) return;
            const statusKey = item.id ? firstStatusKeyByItem.get(item.id) : undefined;
            const status = statusKey ? statusCounts[statusKey] : undefined;

            const groupKey = status ? status.label.trim().toLowerCase() : NO_STATUS_KEY;
            let group = catGroups.get(groupKey);
            if (!group) {
                group = status
                    ? { key: groupKey, label: status.label, color: status.color || NEUTRAL_CUSHION_COLOR, items: [] }
                    : { key: NO_STATUS_KEY, label: 'No status', color: NEUTRAL_CUSHION_COLOR, items: [] };
                catGroups.set(groupKey, group);
            }
            group.items.push({ id: item.id, taskName: item.title || 'Untitled Task' });
        });

        // Shuffled once here, where the result is cached per filter selection, so
        // a big status shows a fair sample of its tasks and the same ones keep
        // showing across re-renders. Which of them fit is decided at render
        // time, once the card's width is known.
        const catFarmGroups = Array.from(catGroups.values()).map(group => {
            const items = [...group.items];
            for (let i = items.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [items[i], items[j]] = [items[j], items[i]];
            }
            return { ...group, items };
        });

        return { totalTasks, statusCounts, totalStatusValues, completionPercent, catGroups: catFarmGroups, peopleMap };
    }, [workspaceData, workspaceBoards, workspaceMemberProfiles, statusColumnOptions]);

    // Cached per distinct selection, so two widgets showing the same column
    // still cost one pass, and the cats keep their positions between renders
    // instead of being re-scattered.
    const statsFor = useMemo(() => {
        const cache = new Map<string, ReturnType<typeof computeStats>>();
        return (filterKey: string | null) => {
            const k = filterKey ?? '';
            let hit = cache.get(k);
            if (!hit) {
                hit = computeStats(filterKey);
                cache.set(k, hit);
            }
            return hit;
        };
    }, [computeStats]);

    if (!workspace) {
        return (
            <div style={{ padding: '60px', textAlign: 'center', color: 'hsl(var(--color-text-secondary))' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '8px', color: 'hsl(var(--color-text-primary))' }}>Workspace Not Found</h2>
                <button 
                    onClick={() => useBoardStore.getState().navigateTo('home')}
                    className="btn-primary" 
                    style={{ marginTop: '24px', padding: '8px 16px', borderRadius: '6px' }}
                >
                    Return to Home
                </button>
            </div>
        );
    }

    const renderWidget = (id: string) => {
        // Every widget reads the figures for its own filter. Ones without a
        // filter control fall through to null, i.e. all status columns counted
        // together, which is what they showed before filters existed.
        const stats = statsFor(statusColFilters[id] ?? null);

        const headerStyle: React.CSSProperties = { 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            marginBottom: '16px',
            paddingLeft: '36px', 
        };

        switch (id) {
            case 'totalTasks':
                return (
                    <div style={{
                        backgroundColor: 'hsl(var(--color-bg-surface, white))',
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--color-border))',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        height: '100%'
                    }}>
                        <div className="widget-header-with-space" style={headerStyle}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0, color: 'hsl(var(--color-text-primary))' }}>Total Work Task</h3>
                            <BarChart2 size={16} color="hsl(var(--color-text-tertiary))" />
                        </div>
                        <div style={{ fontSize: '64px', fontWeight: '700', color: 'hsl(var(--color-text-primary))', textAlign: 'center', marginTop: '20px', marginBottom: '20px' }}>
                            {stats.totalTasks}
                        </div>
                    </div>
                );
            case 'totalStatus':
                return (
                    <div className="dashboard-widget" style={{
                        backgroundColor: 'hsl(var(--color-bg-surface, white))',
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--color-border))',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%'
                    }}>
                        <div className="widget-header-with-space" style={{ ...headerStyle, borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', margin: '-20px -20px 16px -20px', padding: '12px 20px 12px 36px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#1e293b' }}>Total Status</h3>
                                <StatusColumnFilter
                                    options={statusColumnOptions}
                                    value={statusColFilters['totalStatus'] ?? null}
                                    onChange={(key) => applyStatusColFilter('totalStatus', key)}
                                    isOpen={statusMenuFor === 'totalStatus'}
                                    onToggle={() => setStatusMenuFor(prev => (prev === 'totalStatus' ? null : 'totalStatus'))}
                                    onClose={() => setStatusMenuFor(null)}
                                />
                            </div>
                            <MoreHorizontal size={18} color="#64748b" style={{ cursor: 'pointer' }} />
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ height: '110px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                <div style={{ position: 'relative', width: '260px', height: '70px', display: 'flex', alignItems: 'center' }}>
                                    <div style={{ 
                                        flex: 1, 
                                        height: '74px', 
                                        border: '4px solid #e2e8f0', 
                                        borderRadius: '10px', 
                                        padding: '5px', 
                                        display: 'flex', 
                                        overflow: 'hidden',
                                        backgroundColor: '#fff',
                                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)'
                                    }}>
                                        {Object.values(stats.statusCounts).map((status, i) => (
                                            <div 
                                                key={i} 
                                                title={`${status.label}: ${status.count} tasks`}
                                                style={{ 
                                                    width: `${(status.count / Math.max(1, stats.totalStatusValues)) * 100}%`, 
                                                    backgroundColor: status.color,
                                                    cursor: 'pointer',
                                                    transition: 'filter 0.2s ease',
                                                    borderRadius: i === 0 ? '4px 0 0 4px' : (i === Object.values(stats.statusCounts).length - 1 && stats.totalStatusValues > 0 ? '0 4px 4px 0' : '0')
                                                }}
                                            />
                                        ))}
                                        {stats.totalStatusValues === 0 && <div style={{ width: '100%', backgroundColor: '#e2e8f0', borderRadius: '4px' }}></div>}
                                    </div>
                                    <div style={{ width: '10px', height: '38px', backgroundColor: '#e2e8f0', borderRadius: '0 6px 6px 0', marginLeft: '-1px' }} />
                                </div>
                                <div style={{ marginTop: '12px', fontSize: '15px', color: '#1e293b', fontWeight: 600 }}>
                                    {stats.completionPercent}% Done
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px', flexWrap: 'wrap' }}>
                                {Object.values(stats.statusCounts).map((status, i) => (
                                    <div key={i} title={status.label} style={{ width: '24px', height: '10px', borderRadius: '3px', backgroundColor: status.color, cursor: 'pointer' }} className="legend-pill" />
                                ))}
                            </div>
                        </div>
                    </div>
                );
            case 'catFarm':
                return (
                    <div style={{
                        backgroundColor: '#fff', // White house floor
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--color-border))',
                        padding: '20px',
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                        minHeight: '220px',
                        height: '100%'
                    }}>
                         <div style={{ position: 'absolute', top: '20px', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 10 }}>
                            <div className="widget-header-with-space" style={{ backgroundColor: 'rgba(255,255,255,0.9)', padding: '6px 20px', borderRadius: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: '1px solid rgba(126, 34, 206, 0.2)', display: 'flex', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '13px', fontWeight: 800, margin: 0, color: '#7e22ce', whiteSpace: 'nowrap' }}>
                                    {stats.totalTasks} tasks · {stats.completionPercent}% Done
                                </h3>
                                <div style={{ marginLeft: '10px', display: 'flex', alignItems: 'center' }}>
                                    <StatusColumnFilter
                                        options={statusColumnOptions}
                                        value={statusColFilters['catFarm'] ?? null}
                                        onChange={(key) => applyStatusColFilter('catFarm', key)}
                                        isOpen={statusMenuFor === 'catFarm'}
                                        onToggle={() => setStatusMenuFor(prev => (prev === 'catFarm' ? null : 'catFarm'))}
                                        onClose={() => setStatusMenuFor(null)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* House Wall Background */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '55%', backgroundColor: '#f3e8ff', borderBottom: '6px solid #e9d5ff', zIndex: 1 }}>
                            {/* Simple Window - Explicitly Styled */}
                            <div style={{ 
                                position: 'absolute', 
                                right: '40px', 
                                top: '15px', 
                                width: '60px', 
                                height: '50px', 
                                backgroundColor: '#ffffff', 
                                border: '4px solid #a855f7', 
                                borderRadius: '6px', 
                                overflow: 'hidden', 
                                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <div style={{ flex: 1, backgroundColor: '#7dd3fc' }} />
                                <div style={{ height: '3px', backgroundColor: '#a855f7' }} />
                                <div style={{ flex: 1, backgroundColor: '#0ea5e9' }} />
                                {/* Window Panes */}
                                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '3px', backgroundColor: '#a855f7', transform: 'translateX(-50%)' }} />
                            </div>
                        </div>

                        <CatCushionFarm groups={stats.catGroups} />
                    </div>
                );
            case 'workStatusChart':
                return (
                    <div className="dashboard-widget" style={{
                        backgroundColor: 'hsl(var(--color-bg-surface, white))',
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--color-border))',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        minHeight: '340px', // slightly taller to accommodate legend
                        height: '100%'
                    }}>
                        <div className="widget-header-with-space" style={{ ...headerStyle, borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', margin: '-20px -20px 16px -20px', padding: '12px 20px 12px 36px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#1e293b' }}>Work Status</h3>
                                <StatusColumnFilter
                                    options={statusColumnOptions}
                                    value={statusColFilters['workStatusChart'] ?? null}
                                    onChange={(key) => applyStatusColFilter('workStatusChart', key)}
                                    isOpen={statusMenuFor === 'workStatusChart'}
                                    onToggle={() => setStatusMenuFor(prev => (prev === 'workStatusChart' ? null : 'workStatusChart'))}
                                    onClose={() => setStatusMenuFor(null)}
                                />
                            </div>
                            <MoreHorizontal size={18} color="#64748b" style={{ cursor: 'pointer' }} />
                        </div>
                        
                        <div style={{ height: '260px', position: 'relative', marginTop: '20px' }}>
                            {(() => {
                                const maxValue = Math.max(...Object.values(stats.statusCounts).map(s => s.workloadCount), 5);
                                const rawStep = Math.ceil(maxValue / 5);
                                const niceSteps = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 500];
                                const stepSize = niceSteps.find(n => n >= rawStep) || Math.ceil(rawStep / 50) * 50;
                                
                                const yCeiling = stepSize * 5;
                                const ySteps = [yCeiling, yCeiling - stepSize, yCeiling - stepSize * 2, yCeiling - stepSize * 3, yCeiling - stepSize * 4, 0];

                                return (
                                    <>
                                        {/* Background Grid Lines (Fixed) */}
                                        <div style={{ position: 'absolute', top: 0, left: '40px', right: 0, bottom: '40px', pointerEvents: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 0 }}>
                                            {ySteps.map(val => (
                                                <div key={val} style={{ width: '100%', borderTop: '1px solid #f1f5f9', position: 'relative' }}></div>
                                            ))}
                                        </div>

                                        {/* Y-axis labels (Fixed) */}
                                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', textAlign: 'right', width: '30px', zIndex: 10 }}>
                                            {ySteps.map(val => (
                                                <span key={val}>{val}</span>
                                            ))}
                                        </div>

                                        {/* Chart Area wrapper with scroll */}
                                        <div className="interesting-scroll" style={{ 
                                            height: '100%', 
                                            marginLeft: '40px', 
                                            borderLeft: '1px solid #e2e8f0', 
                                            borderBottom: '1px solid #e2e8f0', 
                                            position: 'relative',
                                            overflowX: 'auto',
                                            overflowY: 'hidden',
                                            display: 'flex',
                                            alignItems: 'flex-end',
                                            paddingBottom: '40px', // Extra padding for x-labels
                                            paddingTop: '20px' // Space for bar top numbers
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', paddingRight: '20px', paddingLeft: '16px', height: '100%', minWidth: 'min-content' }}>
                                                {/* Stacked Bars */}
                                                {Object.entries(stats.statusCounts)
                                                    .sort((a, b) => a[1].workloadCount - b[1].workloadCount)
                                                    .map(([label, status], i) => {
                                                        const barHeight = (status.workloadCount / yCeiling) * 200; // Adjusted for padding
                                                        const sortedPeople = Object.entries(status.people).sort((a, b) => b[1].count - a[1].count);

                                                        return (
                                                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '60px', position: 'relative' }}>
                                                                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b', marginBottom: '2px', position: 'absolute', bottom: `${Math.max(2, barHeight) + 4}px` }}>
                                                                    {status.workloadCount > 0 ? status.workloadCount : ''}
                                                                </div>
                                                                <div style={{ width: '100%', height: `${Math.max(2, barHeight)}px`, display: 'flex', flexDirection: 'column-reverse', borderRadius: '3px 3px 0 0', overflow: 'hidden', backgroundColor: '#f1f5f9', zIndex: 2 }}>
                                                                    {sortedPeople.map(([pName, pData], j) => (
                                                                        <div 
                                                                            key={j}
                                                                            title={`${label} - ${pName}: ${pData.count} tasks`}
                                                                            style={{
                                                                                width: '100%',
                                                                                height: `${(pData.count / status.workloadCount) * 100}%`,
                                                                                backgroundColor: (stats.peopleMap as Record<string, any>)[pName]?.color || '#cbd5e1',
                                                                                borderBottom: j < sortedPeople.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                color: 'white',
                                                                                fontSize: '10px',
                                                                                fontWeight: 'bold'
                                                                            }}
                                                                        >
                                                                            {(pData.count / status.workloadCount) * 100 > 15 ? pData.count : ''}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <span title={status.label} style={{ position: 'absolute', top: '100%', marginTop: '10px', fontSize: '11px', color: '#64748b', fontWeight: 600, textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {status.label}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>

                        {/* People Legend */}
                        <div style={{ display: 'flex', gap: '16px', marginTop: '32px', padding: '12px 20px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap', justifyContent: 'center' }}>
                            {Object.values(stats.peopleMap)
                                .filter(person => person.name !== 'Unassigned')
                                .sort((a, b) => b.totalTasks - a.totalTasks)
                                .map((person, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: person.color }}></div>
                                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#475569' }}>
                                        {person.name} <span style={{ color: '#94a3b8', fontSize: '10px' }}>({person.totalTasks})</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'boardUpdates':
                return (
                    <div style={{
                        backgroundColor: 'hsl(var(--color-bg-surface, white))',
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--color-border))',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        boxSizing: 'border-box'
                    }}>
                        <div className="widget-header-with-space" style={headerStyle}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Board Updates</h3>
                            <Clock size={16} color="hsl(var(--color-text-tertiary))" />
                        </div>
                        {/* Capped and scrolled rather than left to grow: grid rows size to
                            their tallest widget, so an unbounded feed would stretch the
                            Work Status chart beside it to match. */}
                        <div style={{ flex: 1, minHeight: 0, maxHeight: '400px', overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
                            {logsLoading ? (
                                <div style={{ padding: '24px 0', textAlign: 'center', fontSize: '13px', color: 'hsl(var(--color-text-tertiary))' }}>
                                    Loading activity…
                                </div>
                            ) : recentLogs.length === 0 ? (
                                <div style={{ padding: '24px 0', textAlign: 'center', fontSize: '13px', color: 'hsl(var(--color-text-tertiary))' }}>
                                    No activity in this workspace yet.
                                </div>
                            ) : (
                                recentLogs.map(log => (
                                    <ActivityLogItem
                                        key={log.id}
                                        log={log}
                                        onClickTask={openTaskFromActivity}
                                        boardName={boardTitleById.get(log.metadata?.board_id || log.target_id || '')}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: 'hsl(var(--color-bg-base, #f8fafc))' }}>
            
            {/* No page heading here: the top bar already shows "{workspace} Dashboard",
                so repeating it above the widgets only pushed them down. */}

            {/* Content Scrollable Area with DnD Context */}
            <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(3, 1fr)', 
                        gridAutoRows: 'minmax(200px, auto)',
                        gap: '24px' 
                    }}>
                        <SortableContext 
                            items={widgetOrder}
                            strategy={rectSortingStrategy}
                        >
                            {widgetOrder.map((id) => (
                                <DraggableDashboardWidget 
                                    key={id} 
                                    id={id} 
                                    isFullWidth={id === 'workStatusChart'}
                                >
                                    {renderWidget(id)}
                                </DraggableDashboardWidget>
                            ))}
                        </SortableContext>
                    </div>
                </div>
                
                {/* Overlay for smoother dragging experience */}
                <DragOverlay adjustScale={true}>
                    {/* Simplified overlay logic can be added here if needed */}
                </DragOverlay>
            </DndContext>

            <style>{`
                @keyframes catSleep {
                    0%, 100% { transform: scale(1); opacity: 0.8; }
                    50% { transform: scale(1.05); opacity: 0.6; }
                }
                @keyframes catBob {
                    0% { transform: translateY(0) rotate(0deg); }
                    100% { transform: translateY(-4px) rotate(2deg); }
                }
                @keyframes wiggleLeg {
                    0% { transform: rotate(0deg); }
                    50% { transform: rotate(25deg); }
                    100% { transform: rotate(0deg); }
                }
                @keyframes wiggleLegAlt {
                    0% { transform: rotate(0deg); }
                    50% { transform: rotate(-25deg); }
                    100% { transform: rotate(0deg); }
                }

                .cat-leg.wiggle {
                    animation: wiggleLeg 0.3s infinite ease-in-out;
                }
                .cat-leg.wiggle-alt {
                    animation: wiggleLegAlt 0.3s infinite ease-in-out;
                    animation-delay: 0.15s;
                }
                
                .interesting-scroll::-webkit-scrollbar {
                    width: 6px;
                }
                .interesting-scroll::-webkit-scrollbar-thumb {
                    background: hsl(var(--color-border));
                    border-radius: 10px;
                }

                .cat-container {
                    transition: transform 0.2s ease;
                }
                .cat-container:hover {
                    transform: scale(1.15);
                    z-index: 100 !important;
                }
                .cat-tooltip {
                    position: absolute;
                    bottom: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(30, 41, 59, 0.95);
                    color: white;
                    padding: 6px 10px;
                    border-radius: 6px;
                    font-size: 11px;
                    white-space: nowrap;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.2s ease, transform 0.2s ease;
                    margin-bottom: 8px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                    z-index: 101;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    max-width: 150px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .cat-container:hover .cat-tooltip {
                    opacity: 1;
                    transform: translateX(-50%) translateY(-5px);
                }
                /* Cushion tooltips reuse the cat tooltip's look, but wrap (the
                   "+N more" one lists several statuses) and are raised above the
                   pile on hover so the cats sitting on top don't cover them. */
                .cushion-hit .cat-tooltip {
                    white-space: normal;
                    width: max-content;
                    max-width: 200px;
                    line-height: 1.5;
                    text-align: left;
                }
                .cushion-hit:hover {
                    z-index: 50;
                }
                .cushion-hit:hover .cat-tooltip {
                    opacity: 1;
                    transform: translateX(-50%) translateY(-5px);
                }
                .cushion-hit .cat-tooltip.edge-left {
                    left: 0;
                    transform: none;
                }
                .cushion-hit .cat-tooltip.edge-right {
                    left: auto;
                    right: 0;
                    transform: none;
                }
                .cushion-hit:hover .cat-tooltip.edge-left,
                .cushion-hit:hover .cat-tooltip.edge-right {
                    transform: translateY(-5px);
                }
                .cat-tooltip.edge-left::after,
                .cat-tooltip.edge-right::after {
                    display: none;
                }
                .cat-tooltip::after {
                    content: '';
                    position: absolute;
                    top: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    border-width: 5px;
                    border-style: solid;
                    border-color: rgba(30, 41, 59, 0.95) transparent transparent transparent;
                }
            `}</style>
        </div>
    );
};
