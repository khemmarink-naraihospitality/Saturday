import { useEffect, useMemo, useState } from 'react';
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

const SvgCat = ({ size, color }: { size: number, color: string }) => {
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="cute-anim-cat">
            {/* Tail */}
            <path className="cat-tail" d="M 75 45 C 95 30, 95 60, 85 70" stroke={color} strokeWidth="8" strokeLinecap="round" fill="none" style={{ transformOrigin: '75px 45px' }} />
            
            {/* Back Legs */}
            <g className="cat-leg back-leg" style={{ transformOrigin: '65px 75px' }}>
                <rect x="60" y="70" width="12" height="18" rx="6" fill={color} opacity="0.8" />
                <path d="M 60 85 Q 66 88, 72 85" stroke="rgba(0,0,0,0.1)" strokeWidth="2" fill="none" />
            </g>
            <g className="cat-leg front-leg" style={{ transformOrigin: '35px 75px' }}>
                <rect x="30" y="70" width="12" height="18" rx="6" fill={color} opacity="0.8" />
                <path d="M 30 85 Q 36 88, 42 85" stroke="rgba(0,0,0,0.1)" strokeWidth="2" fill="none" />
            </g>

            {/* Body */}
            <rect x="25" y="35" width="55" height="45" rx="22" fill={color} />
            
            {/* Front Legs (closest to viewer) */}
            <g className="cat-leg front-leg-alt" style={{ transformOrigin: '45px 75px' }}>
                <rect x="40" y="72" width="14" height="20" rx="7" fill={color} />
                <path d="M 40 88 Q 47 91, 54 88" stroke="rgba(0,0,0,0.1)" strokeWidth="2" fill="none" />
            </g>
            <g className="cat-leg back-leg-alt" style={{ transformOrigin: '55px 75px' }}>
                <rect x="50" y="72" width="14" height="20" rx="7" fill={color} />
                <path d="M 50 88 Q 57 91, 64 88" stroke="rgba(0,0,0,0.1)" strokeWidth="2" fill="none" />
            </g>

            {/* Head */}
            <circle cx="35" cy="38" r="22" fill={color} />
            
            {/* Ears */}
            <path d="M 18 24 L 14 6 L 28 18" fill={color} />
            <path d="M 42 18 L 56 6 L 52 24" fill={color} />
            
            {/* Inner Ears */}
            <path d="M 20 22 L 17 12 L 25 18" fill="#ffd1dc" />
            <path d="M 45 18 L 53 12 L 50 22" fill="#ffd1dc" />

            {/* Eyes - Large Kawaii Style */}
            <g className="cat-eyes">
                <circle cx="26" cy="38" r="5" fill="#1e1e1e" />
                <circle cx="44" cy="38" r="5" fill="#1e1e1e" />
                {/* Highlights */}
                <circle cx="24" cy="36" r="2" fill="#fff" />
                <circle cx="42" cy="36" r="2" fill="#fff" />
                <circle cx="27.5" cy="40" r="1" fill="#fff" />
                <circle cx="45.5" cy="40" r="1" fill="#fff" />
            </g>

            {/* Blushes */}
            <circle cx="20" cy="45" r="4" fill="#ffb6c1" fillOpacity="0.6" />
            <circle cx="50" cy="45" r="4" fill="#ffb6c1" fillOpacity="0.6" />

            {/* Mouth / Nose */}
            <path d="M 32 44 Q 35 47, 38 44" stroke="#1e1e1e" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d="M 33 42 Q 35 43, 37 42" stroke="#1e1e1e" strokeWidth="1" fill="none" />
        </svg>
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

export const WorkspaceDashboardPage = () => {
    const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
    const workspaces = useBoardStore(state => state.workspaces);
    const allBoards = useBoardStore(state => state.boards);
    const loadBoardData = useBoardStore(state => state.loadBoardData);
    
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

    // Optimization: Fetch all needed data for the workspace in bulk
    const [isWorkspaceDataLoading, setIsWorkspaceDataLoading] = useState(false);
    const [workspaceData, setWorkspaceData] = useState<{ items: any[], columns: any[] }>({ items: [], columns: [] });
    const [recentLogs, setRecentLogs] = useState<any[]>([]);
    const [workspaceMemberProfiles, setWorkspaceMemberProfiles] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!activeWorkspaceId || workspaceBoards.length === 0) return;

        async function fetchWorkspaceData() {
            setIsWorkspaceDataLoading(true);
            const boardIds = workspaceBoards.map(b => b.id);

            try {
                // Batch fetch columns and items for all boards in the workspace
                const [colsRes, itemsRes] = await Promise.all([
                    supabase.from('columns').select('*').in('board_id', boardIds).order('order'),
                    supabase.from('items').select('id, board_id, group_id, values').in('board_id', boardIds)
                ]);

                const columns = colsRes.data || [];
                const items = itemsRes.data || [];

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
            } finally {
                setIsWorkspaceDataLoading(false);
            }
        }

        fetchWorkspaceData();
    }, [activeWorkspaceId, workspaceBoards]);

    useEffect(() => {
        if (!activeWorkspaceId || workspaceBoards.length === 0) return;
        
        async function fetchLogs() {

    useEffect(() => {
        if (!activeWorkspaceId || workspaceBoards.length === 0) return;
        
        async function fetchLogs() {
            const boardIds = workspaceBoards.map(b => b.id);
            const { data } = await supabase
                .from('activity_logs')
                .select(`*, profiles!activity_logs_actor_id_fkey(full_name, avatar_url)`)
                .order('created_at', { ascending: false })
                .limit(100);
                
            if (data) {
                const filtered = data.filter(log => boardIds.includes(log.target_id) || boardIds.includes(log.metadata?.board_id));
                setRecentLogs(filtered.slice(0, 5));
            }
        }
        fetchLogs();
    }, [activeWorkspaceId, workspaceBoards]);

    // Note: loadBoardData is no longer needed here as we use workspaceData for stats
    // This dramatically improves performance in the dashboard view.
    useEffect(() => {
        // Only load data if specifically requested by other components or store actions
    }, []);

    const stats = useMemo(() => {
        let totalTasks = 0;
        let totalStatusValues = 0;
        const statusCounts: Record<string, { count: number, workloadCount: number, color: string, label: string, people: Record<string, { count: number, name: string }> }> = {};
        const peopleMap: Record<string, { name: string, color: string, totalTasks: number }> = {};
        
        const stringToColor = (str: string) => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            const h = Math.abs(hash) % 360;
            return `hsl(${h}, 85%, 55%)`;
        };

        if (!workspaceData.items.length) {
            return { totalTasks: 0, totalStatusValues: 0, statusCounts: {}, workloadData: [], catsToRender: [], completionPercent: 0 };
        }

        totalTasks = workspaceData.items.length;
        let doneCount = 0;

        // Group columns by board for quick lookup
        const columnsByBoard: Record<string, any[]> = {};
        workspaceData.columns.forEach(c => {
            if (!columnsByBoard[c.board_id]) columnsByBoard[c.board_id] = [];
            columnsByBoard[c.board_id].push(c);
        });

        workspaceData.items.forEach(item => {
            const boardCols = columnsByBoard[item.board_id] || [];
            const statusCols = boardCols.filter(c => c.type === 'status');
            const peopleCols = boardCols.filter(c => c.type === 'people');

            if (statusCols.length > 0) {
                const primaryStatusCol = statusCols[0];
                const statusOptions = typeof primaryStatusCol.options === 'string' ? JSON.parse(primaryStatusCol.options) : (primaryStatusCol.options || []);
                const statusValueId = item.values?.[primaryStatusCol.id];
                const statusOption = statusOptions.find((opt: any) => opt.id === statusValueId);

                if (statusOption) {
                    const color = statusOption.color || '#c4c4c4';
                    const key = `${statusOption.label}-${color}`;

                    if (!statusCounts[key]) {
                        statusCounts[key] = { count: 0, workloadCount: 0, color, label: statusOption.label, people: {} };
                    }
                    statusCounts[key].count++;
                    statusCounts[key].workloadCount++;
                    totalStatusValues++;
                    
                    if (statusOption.label?.toLowerCase() === 'done' || statusOption.label?.toLowerCase() === 'complete') {
                        doneCount++;
                    }

                    // Workload calculation
                    peopleCols.forEach(pCol => {
                        const pVal = item.values?.[pCol.id];
                        const assignedPeopleIds = Array.isArray(pVal) ? pVal.map((p: any) => typeof p === 'string' ? p : (p?.id || p?.user_id)) : (pVal ? [typeof pVal === 'string' ? pVal : (pVal?.id || pVal?.user_id)] : []);
                        
                        assignedPeopleIds.forEach((pId: string) => {
                            if (pId) {
                                const pName = workspaceMemberProfiles[pId] || 'Member';
                                if (!statusCounts[key].people[pId]) {
                                    statusCounts[key].people[pId] = { count: 0, name: pName };
                                }
                                statusCounts[key].people[pId].count++;

                                if (!peopleMap[pId]) {
                                    peopleMap[pId] = { name: pName, color: stringToColor(pName), totalTasks: 0 };
                                }
                                peopleMap[pId].totalTasks++;
                            }
                        });
                    });
                }
            }
        });
        const completionPercent = totalStatusValues > 0 ? ((doneCount / totalStatusValues) * 100).toFixed(1) : 0;
        
        // Generate reproducible Cat placements for the farm based on status counts
        // Cap total cats at 150 to keep performance good, scale proportionally if needed
        const catsToRender: any[] = [];
        let catIdCounter = 0;
        const MAX_CATS = 150;
        let multiplier = 1;
        if (totalStatusValues > MAX_CATS) {
            multiplier = MAX_CATS / totalStatusValues;
        }

        Object.values(statusCounts).forEach(status => {
            const countToRender = Math.max(1, Math.floor(status.count * multiplier)); // At least 1 if it has value
            for (let i = 0; i < countToRender; i++) {
                const behaviorChance = Math.random();
                let behavior = 'walk';
                if (behaviorChance < 0.3) behavior = 'sit';
                else if (behaviorChance < 0.6) behavior = 'sleep';
                
                catsToRender.push({
                    id: `cat-${catIdCounter++}`,
                    color: status.color,
                    behavior,
                    left: 2 + Math.random() * 92,
                    bottom: Math.random() * 60,
                    delay: Math.random() * -10,
                    duration: behavior === 'walk' ? 25 + Math.random() * 35 : 5 + Math.random() * 5,
                    size: behavior === 'sleep' ? 20 + Math.random() * 15 : 24 + Math.random() * 20,
                    zIndex: 0,
                    flip: Math.random() > 0.5,
                    walkOffset: Math.random() * -50
                });
            }
        });
        
        // Sort by bottom descending so cats in front (lower bottom) have higher z-index generally
        catsToRender.sort((a, b) => b.bottom - a.bottom);
        catsToRender.forEach((cat, index) => cat.zIndex = index);

        return { totalTasks, statusCounts, totalStatusValues, completionPercent, catsToRender, peopleMap };
    }, [workspaceBoards, workspaceMemberProfiles]);

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
        const headerStyle: React.CSSProperties = { 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            marginBottom: '16px',
            paddingLeft: '36px', // Balanced for proximity
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
                                <Filter size={16} color="#64748b" style={{ cursor: 'pointer' }} />
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
                        backgroundColor: '#f3e8ff',
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--color-border))',
                        padding: '20px',
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        minHeight: '200px',
                        height: '100%'
                    }}>
                         <div style={{ position: 'absolute', top: '20px', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 10 }}>
                            <div className="widget-header-with-space" style={{ backgroundColor: 'rgba(255,255,255,0.85)', padding: '6px 20px', borderRadius: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: '1px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center' }}>
                                <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#7e22ce', whiteSpace: 'nowrap' }}>
                                    {workspace.title} {stats.totalStatusValues} Task Farm
                                </h3>
                            </div>
                        </div>
                        {/* House Background */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '60%', backgroundColor: '#e9d5ff', borderBottom: '4px solid #d8b4fe', zIndex: 1 }}>
                            <div style={{ position: 'absolute', right: '40px', top: '20px', width: '60px', height: '60px', backgroundColor: '#1e1b4b', border: '4px solid white', borderRadius: '4px' }} />
                        </div>
                        <div style={{ position: 'absolute', top: '40%', left: 0, right: 0, bottom: 0, backgroundColor: '#f3e8ff', zIndex: 1 }} />
                         <div style={{ position: 'absolute', top: '30%', left: 0, right: 0, bottom: '10px', zIndex: 2 }}>
                            {stats.catsToRender.map(cat => (
                                <div key={cat.id} style={{ position: 'absolute', bottom: `${cat.bottom}%`, zIndex: cat.zIndex, width: '60px', height: '60px', animation: cat.behavior === 'walk' ? `catPatrol ${cat.duration}s linear infinite` : 'none', animationDelay: `${cat.walkOffset}s`, left: cat.behavior !== 'walk' ? `${cat.left}%` : 'auto' }}>
                                    <div style={{ animation: cat.behavior === 'sleep' ? `catSleep 5s ease-in-out infinite` : `catBob 1.2s ease-in-out infinite alternate`, filter: cat.behavior === 'sleep' ? `brightness(0.9)` : `none` }}>
                                        <SvgCat size={cat.size} color={cat.color} />
                                    </div>
                                </div>
                            ))}
                        </div>
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
                                <Filter size={16} color="#64748b" style={{ cursor: 'pointer' }} />
                            </div>
                            <MoreHorizontal size={18} color="#64748b" style={{ cursor: 'pointer' }} />
                        </div>
                        
                        <div style={{ height: '260px', display: 'flex', alignItems: 'flex-end', gap: '20px', paddingBottom: '40px', paddingLeft: '40px', paddingRight: '20px', borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', position: 'relative', marginTop: '20px' }}>
                            {(() => {
                                const maxValue = Math.max(...Object.values(stats.statusCounts).map(s => s.workloadCount), 5);
                                const rawStep = Math.ceil(maxValue / 5);
                                const niceSteps = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 500];
                                const stepSize = niceSteps.find(n => n >= rawStep) || Math.ceil(rawStep / 50) * 50;
                                
                                const yCeiling = stepSize * 5;
                                const ySteps = [yCeiling, yCeiling - stepSize, yCeiling - stepSize * 2, yCeiling - stepSize * 3, yCeiling - stepSize * 4, 0];

                                return (
                                    <>
                                        {/* Background Grid Lines */}
                                        <div style={{ position: 'absolute', top: 0, left: '40px', right: '20px', bottom: '40px', pointerEvents: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                            {ySteps.map(val => (
                                                <div key={val} style={{ width: '100%', borderTop: '1px solid #f1f5f9', position: 'relative' }}></div>
                                            ))}
                                        </div>

                                        {/* Y-axis labels */}
                                        <div style={{ position: 'absolute', left: '-35px', top: 0, bottom: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', textAlign: 'right', width: '30px' }}>
                                            {ySteps.map(val => (
                                                <span key={val}>{val}</span>
                                            ))}
                                        </div>

                                        {/* Stacked Bars */}
                                        {Object.entries(stats.statusCounts)
                                            .sort((a, b) => a[1].workloadCount - b[1].workloadCount)
                                            .map(([label, status], i) => {
                                                const barHeight = (status.workloadCount / yCeiling) * 220;
                                                const sortedPeople = Object.entries(status.people).sort((a, b) => b[1].count - a[1].count);

                                                return (
                                                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '60px', position: 'relative' }}>
                                                        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b', marginBottom: '2px' }}>
                                                            {status.workloadCount > 0 ? status.workloadCount : ''}
                                                        </div>
                                                        <div style={{ width: '100%', height: `${Math.max(2, barHeight)}px`, display: 'flex', flexDirection: 'column-reverse', borderRadius: '3px 3px 0 0', overflow: 'hidden', backgroundColor: '#f1f5f9' }}>
                                                            {sortedPeople.map(([pName, pData], j) => (
                                                                <div 
                                                                    key={j}
                                                                    title={`${label} - ${pName}: ${pData.count} tasks`}
                                                                    style={{
                                                                        width: '100%',
                                                                        height: `${(pData.count / status.workloadCount) * 100}%`,
                                                                        backgroundColor: stats.peopleMap[pName]?.color || '#cbd5e1',
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
                                                        <span style={{ position: 'absolute', top: 'calc(100% + 10px)', fontSize: '11px', color: '#64748b', fontWeight: 600, textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {status.label}
                                                        </span>
                                                    </div>
                                                );
                                            })}
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
                        height: '100%'
                    }}>
                        <div className="widget-header-with-space" style={headerStyle}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Board Updates</h3>
                            <Clock size={16} color="hsl(var(--color-text-tertiary))" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {recentLogs.slice(0, 4).map((log) => (
                                <div key={log.id} style={{ display: 'flex', gap: '12px', paddingBottom: '16px', borderBottom: '1px solid hsl(var(--color-border))' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' }}>
                                        {(log.profiles?.full_name || 'U').substring(0, 1).toUpperCase()}
                                    </div>
                                    <div style={{ fontSize: '13px' }}>
                                        <strong>{log.profiles?.full_name}</strong>
                                        <div style={{ color: 'hsl(var(--color-text-tertiary))' }}>{log.metadata?.item_title || 'Update'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: 'hsl(var(--color-bg-base, #f8fafc))' }}>
            
            {/* Header */}
            <header style={{ 
                padding: '24px 32px', 
                borderBottom: '1px solid hsl(var(--color-border))',
                backgroundColor: 'hsl(var(--color-bg-surface, #ffffff))',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
            }}>
                <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'hsl(var(--color-text-primary))', margin: 0 }}>
                    {workspace.title} Dashboard
                </h1>
            </header>

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
                @keyframes catPatrol {
                    0% { left: -10%; transform: scaleX(1); }
                    49% { transform: scaleX(1); }
                    50% { left: 100%; transform: scaleX(-1); }
                    99% { transform: scaleX(-1); }
                    100% { left: -10%; transform: scaleX(1); }
                }
                @keyframes catBob {
                    0% { transform: translateY(0) rotate(0deg); }
                    100% { transform: translateY(-6px) rotate(3deg); }
                }
                
                .interesting-scroll::-webkit-scrollbar {
                    width: 6px;
                }
                .interesting-scroll::-webkit-scrollbar-thumb {
                    background: hsl(var(--color-border));
                    border-radius: 10px;
                }
            `}</style>
        </div>
    );
};
