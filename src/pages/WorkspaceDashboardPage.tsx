import { useEffect, useMemo, useState } from 'react';
import { useBoardStore } from '../store/useBoardStore';
import { BarChart2, Clock, Filter, MoreHorizontal } from 'lucide-react';
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

export const WorkspaceDashboardPage = () => {
    const activeWorkspaceId = useBoardStore(state => state.activeWorkspaceId);
    const workspaces = useBoardStore(state => state.workspaces);
    const allBoards = useBoardStore(state => state.boards);
    const loadBoardData = useBoardStore(state => state.loadBoardData);
    
    const workspace = workspaces.find(w => w.id === activeWorkspaceId);
    const workspaceBoards = useMemo(() => 
        allBoards.filter(b => b.workspaceId === activeWorkspaceId && !b.is_archived),
    [allBoards, activeWorkspaceId]);

    // Ensure all boards in workspace are loaded
    const [recentLogs, setRecentLogs] = useState<any[]>([]);
    const [workspaceMemberProfiles, setWorkspaceMemberProfiles] = useState<Record<string, string>>({});

    useEffect(() => {
        if (workspaceBoards.length === 0) return;
        
        async function fetchProfiles() {
            // Extract all unique user IDs from all tasks in all boards
            const userIds = new Set<string>();
            
            workspaceBoards.forEach(board => {
                const peopleCols = board.columns.filter(c => c.type === 'people');
                board.items.forEach(item => {
                    peopleCols.forEach(pCol => {
                        const pVal = item.values?.[pCol.id];
                        const assignedPeople = Array.isArray(pVal) ? pVal : (pVal ? [pVal] : []);
                        assignedPeople.forEach(p => {
                            if (typeof p === 'string') {
                                userIds.add(p);
                            } else if (p && typeof p === 'object') {
                                const pId = p.id || p.user_id;
                                if (pId) userIds.add(pId);
                            }
                        });
                    });
                });
            });

            if (userIds.size > 0) {
                const idsArray = Array.from(userIds);
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, full_name, email')
                    .in('id', idsArray);

                if (profiles) {
                    const map: Record<string, string> = {};
                    profiles.forEach((p: any) => {
                        const name = p.full_name || p.display_name || (p.email ? p.email.split('@')[0] : 'Member');
                        map[p.id] = name;
                    });
                    setWorkspaceMemberProfiles(map);
                }
            }
        }
        fetchProfiles();
    }, [workspaceBoards]);

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

    useEffect(() => {
        workspaceBoards.forEach(b => {
            if (!b.isDataLoaded) {
                loadBoardData(b.id);
            }
        });
    }, [workspaceBoards, loadBoardData]);

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
            return `hsl(${h}, 85%, 55%)`; // Vibrant
        };

        workspaceBoards.forEach(b => {
            if (!b.isDataLoaded) return;
            totalTasks += (b.items?.length || 0);

            const statusCols = b.columns?.filter(c => c.type === 'status') || [];
            const peopleCols = b.columns?.filter(c => c.type === 'people') || [];
            
            if (statusCols.length === 0) return;

            statusCols.forEach(col => {
                b.items?.forEach(item => {
                    const statusVal = item.values?.[col.id];
                    let statusLabel = 'Empty';
                    let statusColor = '#c4c4c4';

                    if (statusVal) {
                        const optionId = typeof statusVal === 'string' ? statusVal : statusVal.id;
                        const option = col.options?.find(o => o.id === optionId);
                        if (option) {
                            statusLabel = option.label;
                            statusColor = option.color || '#c4c4c4';
                        }
                    }

                    if (!statusCounts[statusLabel]) {
                        statusCounts[statusLabel] = { count: 0, workloadCount: 0, color: statusColor, label: statusLabel, people: {} };
                    }
                    
                    statusCounts[statusLabel].count++;
                    totalStatusValues++;

                    // Handle People data for this item
                    peopleCols.forEach(pCol => {
                        const pVal = item.values?.[pCol.id];
                        const assignedPeople = Array.isArray(pVal) ? pVal : (pVal ? [pVal] : []);
                        
                        if (assignedPeople.length === 0) {
                            // Skip Unassigned tasks for the people workload breakdown
                        } else {
                            assignedPeople.forEach(p => {
                                let pName = 'Member';
                                if (typeof p === 'string') {
                                    pName = workspaceMemberProfiles[p];
                                } else if (p && typeof p === 'object') {
                                    const pId = p.id || p.user_id;
                                    pName = workspaceMemberProfiles[pId] || p.name || p.full_name || p.displayName;
                                }

                                // If we don't have a name yet (could be a local/placeholder user or still loading), skip it for now
                                if (!pName || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pName)) {
                                    return;
                                }
                                
                                if (!statusCounts[statusLabel].people[pName]) {
                                    statusCounts[statusLabel].people[pName] = { count: 0, name: pName };
                                }
                                statusCounts[statusLabel].people[pName].count++;
                                statusCounts[statusLabel].workloadCount++;
                                if (!peopleMap[pName]) peopleMap[pName] = { name: pName, color: stringToColor(pName), totalTasks: 0 };
                                peopleMap[pName].totalTasks++;
                            });
                        }
                    });
                });
            });
        });

        const doneCount = statusCounts['Done']?.count || 0;
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

            {/* Content Scrollable Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                
                {/* Top Row Widgets */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '24px' }}>
                    
                    {/* Total Work Task */}
                    <div style={{
                        backgroundColor: 'hsl(var(--color-bg-surface, white))',
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--color-border))',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Total Work Task</h3>
                            <BarChart2 size={16} color="hsl(var(--color-text-tertiary))" />
                        </div>
                        <div style={{ fontSize: '48px', fontWeight: '500', color: 'hsl(var(--color-text-primary))', textAlign: 'center', marginTop: '20px', marginBottom: '20px' }}>
                            {stats.totalTasks}
                        </div>
                    </div>

                    {/* Total Status */}
                    <div className="dashboard-widget" style={{
                        backgroundColor: 'hsl(var(--color-bg-surface, white))',
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--color-border))',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', margin: '-20px -20px 16px -20px', padding: '12px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#1e293b' }}>Total Status</h3>
                                <Filter size={16} color="#64748b" style={{ cursor: 'pointer' }} />
                            </div>
                            <MoreHorizontal size={18} color="#64748b" style={{ cursor: 'pointer' }} />
                        </div>
                        <div style={{ height: '110px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            <div style={{ position: 'relative', width: '260px', height: '70px', display: 'flex', alignItems: 'center' }}>
                                {/* Battery Body */}
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
                                            className="interactive-bar-segment"
                                            style={{ 
                                                width: `${(status.count / Math.max(1, stats.totalStatusValues)) * 100}%`, 
                                                backgroundColor: status.color,
                                                cursor: 'pointer',
                                                transition: 'filter 0.2s ease',
                                                borderRadius: i === 0 ? '4px 0 0 4px' : (i === Object.values(stats.statusCounts).length - 1 && stats.totalStatusValues > 0 ? '0 4px 4px 0' : '0')
                                            }}
                                        ></div>
                                    ))}
                                    {stats.totalStatusValues === 0 && <div style={{ width: '100%', backgroundColor: '#e2e8f0', borderRadius: '4px' }}></div>}
                                </div>
                                {/* Battery Nub */}
                                <div style={{ 
                                    width: '10px', 
                                    height: '38px', 
                                    backgroundColor: '#e2e8f0', 
                                    borderRadius: '0 6px 6px 0',
                                    marginLeft: '-1px'
                                }}></div>
                            </div>
                            
                            {/* Percentage Label centered below battery */}
                            <div style={{ marginTop: '12px', fontSize: '15px', color: '#1e293b', fontWeight: 600 }}>
                                {stats.completionPercent}% Done
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px', flexWrap: 'wrap' }}>
                            {Object.values(stats.statusCounts).map((status, i) => (
                                <div 
                                    key={i} 
                                    title={status.label}
                                    style={{ 
                                        width: '24px', 
                                        height: '10px', 
                                        borderRadius: '3px', 
                                        backgroundColor: status.color,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                    }}
                                    className="legend-pill"
                                ></div>
                            ))}
                        </div>

                    </div>

                    {/* Workspace Cat Farm */}
                    <div style={{
                        backgroundColor: '#f3e8ff', // Soft purple base
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--color-border))',
                        padding: '20px',
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        minHeight: '200px'
                    }}>
                        <div style={{ 
                            position: 'absolute', 
                            top: '20px', 
                            left: 0, 
                            right: 0, 
                            display: 'flex', 
                            justifyContent: 'center', 
                            zIndex: 10 
                        }}>
                            <div style={{ 
                                backgroundColor: 'rgba(255,255,255,0.85)', 
                                padding: '6px 20px', 
                                borderRadius: '30px', 
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                border: '1px solid rgba(255,255,255,0.5)',
                                display: 'flex',
                                alignItems: 'center'
                            }}>
                                <h3 style={{ 
                                    fontSize: '15px', 
                                    fontWeight: 800, 
                                    margin: 0, 
                                    color: '#7e22ce',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {workspace.title} {stats.totalStatusValues} Task Farm
                                </h3>
                            </div>
                        </div>

                        {/* Cute Cat House Background */}
                        <div style={{ 
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: '60%', 
                            backgroundColor: '#e9d5ff', // Wall color
                            borderBottom: '4px solid #d8b4fe', // Baseboard
                            zIndex: 1
                        }}>
                            {/* Window */}
                            <div style={{ position: 'absolute', right: '40px', top: '20px', width: '60px', height: '60px', backgroundColor: '#1e1b4b', border: '4px solid white', borderRadius: '4px', overflow: 'hidden' }}>
                                {/* Stars */}
                                <div style={{ position: 'absolute', top: '10px', left: '15px', width: '2px', height: '2px', backgroundColor: 'white', borderRadius: '50%' }}></div>
                                <div style={{ position: 'absolute', top: '25px', left: '40px', width: '2px', height: '2px', backgroundColor: 'white', borderRadius: '50%' }}></div>
                                <div style={{ position: 'absolute', top: '45px', left: '20px', width: '2px', height: '2px', backgroundColor: 'white', borderRadius: '50%' }}></div>
                                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '4px', backgroundColor: 'white', transform: 'translateX(-50%)' }}></div>
                                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '4px', backgroundColor: 'white', transform: 'translateY(-50%)' }}></div>
                            </div>
                            
                            {/* Cat Tree 1 - Tall */}
                            <div style={{ position: 'absolute', left: '20px', bottom: 0, width: '70px', height: '140px' }}>
                                <div style={{ position: 'absolute', bottom: 0, left: '28px', width: '14px', height: '140px', backgroundColor: '#d1d5db', borderRadius: '4px' }}></div>
                                <div style={{ position: 'absolute', bottom: '130px', left: 0, width: '70px', height: '12px', backgroundColor: '#9ca3af', borderRadius: '6px' }}></div>
                                <div style={{ position: 'absolute', bottom: '80px', left: '10px', width: '50px', height: '10px', backgroundColor: '#9ca3af', borderRadius: '6px' }}></div>
                                <div style={{ position: 'absolute', bottom: '40px', left: '35px', width: '30px', height: '8px', backgroundColor: '#9ca3af', borderRadius: '6px' }}></div>
                            </div>
                            
                            {/* Cat Tree 2 - Right Side Playhouse */}
                            <div style={{ position: 'absolute', right: '120px', bottom: 0, width: '80px', height: '100px' }}>
                                <div style={{ position: 'absolute', bottom: 0, left: '10px', width: '60px', height: '50px', backgroundColor: '#e5e7eb', border: '3px solid #d1d5db', borderRadius: '8px' }}>
                                    <div style={{ position: 'absolute', bottom: '10px', left: '20px', width: '20px', height: '25px', backgroundColor: '#4b5563', borderRadius: '10px 10px 0 0' }}></div>
                                </div>
                                <div style={{ position: 'absolute', bottom: '50px', left: '32px', width: '16px', height: '40px', backgroundColor: '#d1d5db' }}></div>
                                <div style={{ position: 'absolute', bottom: '90px', left: 0, width: '80px', height: '10px', backgroundColor: '#9ca3af', borderRadius: '6px' }}></div>
                            </div>

                            {/* Hanging Toy */}
                            <div style={{ position: 'absolute', right: '320px', top: 0, width: '2px', height: '60px', backgroundColor: '#9ca3af' }}>
                                <div style={{ position: 'absolute', bottom: '-8px', left: '-4px', width: '10px', height: '10px', backgroundColor: '#f43f5e', borderRadius: '50%' }}></div>
                            </div>
                            
                            {/* Hanging Bridge */}
                            <div style={{ position: 'absolute', left: '100px', top: '30px', width: '120px', height: '6px', backgroundColor: '#d1d5db', borderRadius: '4px', transform: 'rotate(5deg)' }}>
                                <div style={{ position: 'absolute', left: '10px', bottom: '-15px', width: '2px', height: '15px', backgroundColor: '#9ca3af' }}></div>
                                <div style={{ position: 'absolute', left: '30px', bottom: '-15px', width: '2px', height: '15px', backgroundColor: '#9ca3af' }}></div>
                                <div style={{ position: 'absolute', left: '50px', bottom: '-15px', width: '2px', height: '15px', backgroundColor: '#9ca3af' }}></div>
                                <div style={{ position: 'absolute', left: '70px', bottom: '-15px', width: '2px', height: '15px', backgroundColor: '#9ca3af' }}></div>
                                <div style={{ position: 'absolute', left: '90px', bottom: '-15px', width: '2px', height: '15px', backgroundColor: '#9ca3af' }}></div>
                            </div>
                        </div>
                        
                        {/* Floor */}
                        <div style={{ 
                            position: 'absolute', top: '40%', left: 0, right: 0, bottom: 0, 
                            backgroundColor: '#f3e8ff',
                            zIndex: 1
                        }}>
                            {/* Scratch post on floor */}
                            <div style={{ position: 'absolute', right: '40px', bottom: '20px', width: '40px', height: '15px', backgroundColor: '#d1d5db', borderRadius: '10px' }}>
                                <div style={{ position: 'absolute', bottom: '15px', left: '15px', width: '10px', height: '40px', backgroundColor: '#e5e7eb', border: '1px solid #d1d5db' }}></div>
                            </div>
                            
                            {/* Cat Tunnel */}
                            <div style={{ position: 'absolute', left: '150px', bottom: '20px', width: '80px', height: '35px', backgroundColor: '#cbd5e1', borderRadius: '40px 40px 0 0', border: '3px solid #94a3b8', borderBottom: 'none' }}>
                                <div style={{ position: 'absolute', top: '10px', left: '10px', right: '10px', bottom: 0, backgroundColor: '#334155', borderRadius: '30px 30px 0 0' }}></div>
                            </div>

                            {/* Food Bowl */}
                            <div style={{ position: 'absolute', left: '80px', bottom: '10px', width: '25px', height: '10px', backgroundColor: '#f87171', borderRadius: '0 0 10px 10px' }}>
                                <div style={{ position: 'absolute', top: '-4px', left: '2px', width: '21px', height: '6px', backgroundColor: '#fbbf24', borderRadius: '10px' }}></div>
                            </div>
                        </div>
                        
                        {/* The Cats Container */}
                        <div style={{ position: 'absolute', top: '30%', left: 0, right: 0, bottom: '10px', zIndex: 2 }}>
                            {stats.catsToRender.map(cat => (
                                <div
                                    key={cat.id}
                                    style={{
                                        position: 'absolute',
                                        bottom: `${cat.bottom}%`,
                                        zIndex: cat.zIndex,
                                        width: '60px',
                                        height: '60px',
                                        animation: cat.behavior === 'walk' ? `catPatrol ${cat.duration}s linear infinite` : 'none',
                                        animationDelay: `${cat.walkOffset}s`,
                                        left: cat.behavior !== 'walk' ? `${cat.left}%` : 'auto'
                                    }}
                                >
                                    <div style={{
                                        animation: cat.behavior === 'sleep' ? `catSleep 5s ease-in-out infinite` : 
                                                   `catBob 1.2s ease-in-out infinite alternate`,
                                        filter: cat.behavior === 'sleep' ? `brightness(0.9) drop-shadow(0px 1px 1px rgba(0,0,0,0.1))` : `drop-shadow(0px 2px 1px rgba(107,33,168,0.2))`,
                                        transform: cat.behavior === 'sleep' ? 'rotate(90deg) scale(0.9)' : 'none',
                                        transformOrigin: 'center'
                                    }}>
                                        <SvgCat size={cat.size} color={cat.color} />
                                    </div>
                                </div>
                            ))}
                            {stats.catsToRender.length === 0 && (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7e22ce' }}>
                                    No tasks to show yet!
                                </div>
                            )}
                        </div>

                    </div>
                </div>

                {/* Bottom Row Widgets */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                    
                    {/* Work Status Chart Placeholder */}
                    <div className="dashboard-widget" style={{
                        backgroundColor: 'hsl(var(--color-bg-surface, white))',
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--color-border))',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        minHeight: '300px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', margin: '-20px -20px 16px -20px', padding: '12px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#1e293b' }}>Work Status</h3>
                                <Filter size={16} color="#64748b" style={{ cursor: 'pointer' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <MoreHorizontal size={18} color="#64748b" style={{ cursor: 'pointer' }} />
                            </div>
                        </div>
                        <div style={{ height: '260px', display: 'flex', alignItems: 'flex-end', gap: '20px', paddingBottom: '40px', paddingLeft: '40px', paddingRight: '20px', borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', position: 'relative', marginTop: '20px' }}>
                            
                            {/* Dynamic Y-Axis Calculation */}
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

                                        {/* Simulated Interactive Bars */}
                                        {Object.entries(stats.statusCounts)
                                            .sort((a, b) => a[1].workloadCount - b[1].workloadCount) // Sort ascending
                                            .map(([label, status], i) => {
                                            const barHeight = (status.workloadCount / yCeiling) * 220;
                                            
                                            // Sort people so the segments are consistent
                                            const sortedPeople = Object.entries(status.people).sort((a, b) => b[1].count - a[1].count);

                                            return (
                                                <div 
                                                    key={i} 
                                                    className="interactive-bar-group"
                                                    style={{ 
                                                        flex: 1, 
                                                        display: 'flex', 
                                                        flexDirection: 'column', 
                                                        alignItems: 'center', 
                                                        gap: '4px', 
                                                        minWidth: '60px',
                                                        position: 'relative'
                                                    }}
                                                >
                                                    {/* Total Count on Top */}
                                                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b', marginBottom: '2px' }}>
                                                        {status.workloadCount > 0 ? status.workloadCount : ''}
                                                    </div>

                                                    {/* The Stacked Bar */}
                                                    <div 
                                                        style={{ 
                                                            width: '100%', 
                                                            height: `${Math.max(2, barHeight)}px`, 
                                                            display: 'flex',
                                                            flexDirection: 'column-reverse',
                                                            borderRadius: '3px 3px 0 0',
                                                            overflow: 'hidden',
                                                            transition: 'all 0.3s ease',
                                                            cursor: 'pointer',
                                                            backgroundColor: '#f1f5f9'
                                                        }}
                                                        className="interactive-bar"
                                                    >
                                                        {sortedPeople.map(([pName, pData], j) => {
                                                            const segHeight = (pData.count / status.workloadCount) * 100;
                                                            return (
                                                                <div 
                                                                    key={j}
                                                                    title={`${label} - ${pName}: ${pData.count} tasks`}
                                                                    style={{
                                                                        width: '100%',
                                                                        height: `${segHeight}%`,
                                                                        backgroundColor: stats.peopleMap[pName]?.color || '#cbd5e1',
                                                                        borderBottom: j < sortedPeople.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        color: 'white',
                                                                        fontSize: '11px',
                                                                        fontWeight: 'bold',
                                                                        textShadow: '0 1px 1px rgba(0,0,0,0.2)'
                                                                    }}
                                                                >
                                                                    {segHeight > 10 ? pData.count : ''}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    
                                                    {/* Permanent Label matching Total Status */}
                                                    <span style={{ 
                                                        position: 'absolute',
                                                        top: 'calc(100% + 10px)',
                                                        left: '50%',
                                                        transform: 'translateX(-50%)',
                                                        fontSize: '11px',
                                                        color: '#64748b',
                                                        textAlign: 'center',
                                                        fontWeight: 600,
                                                        width: '100px',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }} title={label}>
                                                        {label}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                        {Object.keys(stats.statusCounts).length === 0 && (
                                            <div style={{ width: '100%', textAlign: 'center', color: 'hsl(var(--color-text-secondary))', paddingBottom: '20px' }}>No status data available</div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        {/* People Legend for Stacked Chart - Original Text Style */}
                        <div style={{ display: 'flex', gap: '16px', marginTop: '32px', padding: '12px 20px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap', justifyContent: 'center' }}>
                            {Object.values(stats.peopleMap)
                                .filter(person => person.name !== 'Unassigned')
                                .sort((a, b) => b.totalTasks - a.totalTasks)
                                .map((person, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: person.color }}></div>
                                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#475569' }}>
                                        {person.name} <span style={{ color: '#94a3b8', fontSize: '11px', marginLeft: '2px' }}>({person.totalTasks})</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Board Updates Feed Placeholder */}
                    <div style={{
                        backgroundColor: 'hsl(var(--color-bg-surface, white))',
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--color-border))',
                        padding: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Board Updates</h3>
                            <Clock size={16} color="hsl(var(--color-text-tertiary))" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {recentLogs.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'hsl(var(--color-text-secondary))', padding: '20px 0' }}>No recent activities</div>
                            ) : (
                                recentLogs.map((log) => (
                                    <div key={log.id} style={{ display: 'flex', gap: '12px', paddingBottom: '16px', borderBottom: '1px solid hsl(var(--color-border))' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', overflow: 'hidden' }}>
                                            {log.profiles?.avatar_url ? (
                                                <img src={log.profiles.avatar_url} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                                            ) : (
                                                (log.profiles?.full_name || 'U').substring(0, 1).toUpperCase()
                                            )}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                                                <strong>{log.profiles?.full_name || 'Unknown User'}</strong> 
                                                <span style={{ color: 'hsl(var(--color-text-tertiary))', marginLeft: '8px' }}>
                                                    {new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))', marginBottom: '8px' }}>
                                                {log.action_type.replace(/_/g, ' ')}
                                            </div>
                                            <div style={{ fontSize: '14px' }}>
                                                {log.metadata?.item_title ? `Updated "${log.metadata.item_title}"` : 'Updated workspace'}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    
                </div>
            </div>

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
                
                @keyframes legWalkFront {
                    0%, 100% { transform: rotate(-15deg) translateY(0); }
                    50% { transform: rotate(15deg) translateY(-2px); }
                }
                @keyframes legWalkBack {
                    0%, 100% { transform: rotate(15deg) translateY(-2px); }
                    50% { transform: rotate(-15deg) translateY(0); }
                }
                @keyframes tailWag {
                    0%, 100% { transform: rotate(-15deg); }
                    50% { transform: rotate(15deg); }
                }
                @keyframes blink {
                    0%, 90%, 100% { transform: scaleY(1); }
                    95% { transform: scaleY(0.1); }
                }
                
                .cute-anim-cat .cat-leg.front-leg, .cute-anim-cat .cat-leg.back-leg-alt {
                    animation: legWalkFront 1.2s ease-in-out infinite;
                }
                .cute-anim-cat .cat-leg.back-leg, .cute-anim-cat .cat-leg.front-leg-alt {
                    animation: legWalkBack 1.2s ease-in-out infinite;
                }
                .cute-anim-cat .cat-tail {
                    animation: tailWag 2.5s ease-in-out infinite;
                }
                .cute-anim-cat .cat-eyes {
                    animation: blink 4s infinite;
                    transform-origin: center 38px;
                }

                .interactive-bar-segment:hover {
                    filter: brightness(1.1) saturate(1.2);
                    z-index: 10;
                }

                .interactive-bar-group:hover .bar-tooltip {
                    opacity: 1 !important;
                }

                .interactive-bar-group:hover .interactive-bar {
                    filter: brightness(1.1);
                    transform: scaleX(1.05);
                }

                .dashboard-widget:hover .hover-label {
                    opacity: 1 !important;
                }

                .legend-pill:hover {
                    transform: scaleY(1.3);
                    filter: brightness(1.1);
                }
            `}</style>
        </div>
    );
};
