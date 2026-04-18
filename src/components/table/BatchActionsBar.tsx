import { Trash2, Copy, Eye, EyeOff, LayoutDashboard, X } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useState } from 'react';

export const BatchActionsBar = () => {
    const selectedItemIds = useBoardStore(state => state.selectedItemIds);
    const clearSelection = useBoardStore(state => state.clearSelection);
    const deleteSelectedItems = useBoardStore(state => state.deleteSelectedItems);
    const duplicateSelectedItems = useBoardStore(state => state.duplicateSelectedItems);
    const hideSelectedItems = useBoardStore(state => state.hideSelectedItems);
    const unhideSelectedItems = useBoardStore(state => state.unhideSelectedItems);
    const moveSelectedItemsToGroup = useBoardStore(state => state.moveSelectedItemsToGroup);
    const showHiddenItems = useBoardStore(state => state.showHiddenItems);

    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const boards = useBoardStore(state => state.boards);
    const activeBoard = boards.find(b => b.id === activeBoardId);

    const [showMoveMenu, setShowMoveMenu] = useState(false);

    if (selectedItemIds.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '32px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'hsl(var(--color-bg-surface))',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '24px', // Spacing between sections
            zIndex: 1000,
            border: '1px solid hsl(var(--color-border))',
            minWidth: '600px',
            justifyContent: 'space-between'
        }}>
            {/* Left: Count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                    backgroundColor: 'hsl(var(--color-brand-primary))',
                    color: 'white',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600
                }}>
                    {selectedItemIds.length}
                </div>
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'hsl(var(--color-text-primary))' }}>Tasks selected</span>
            </div>

            {/* Center: Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                    className="batch-action-btn"
                    onClick={() => {
                        duplicateSelectedItems();
                        // Optional: clear selection after or keep? usually keep for further actions
                        // User might want to move copies? 
                        // Standard behavior: keep selection on originals? or select copies?
                        // Let's keep selection for now.
                    }}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px', borderRadius: '4px' }}
                >
                    <Copy size={16} color="hsl(var(--color-text-secondary))" />
                    <span style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>Duplicate</span>
                </div>

                <div
                    className="batch-action-btn"
                    onClick={() => {
                        if (showHiddenItems) {
                            unhideSelectedItems();
                        } else {
                            hideSelectedItems();
                        }
                    }}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px', borderRadius: '4px' }}
                >
                    {showHiddenItems ? <Eye size={16} color="hsl(var(--color-text-secondary))" /> : <EyeOff size={16} color="hsl(var(--color-text-secondary))" />}
                    <span style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>{showHiddenItems ? 'Unhide' : 'Hide'}</span>
                </div>

                <div
                    className="batch-action-btn"
                    onClick={deleteSelectedItems}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px', borderRadius: '4px' }}
                >
                    <Trash2 size={16} color="hsl(var(--color-text-secondary))" />
                    <span style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>Delete</span>
                </div>

                <div
                    className="batch-action-btn"
                    onClick={() => setShowMoveMenu(!showMoveMenu)}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px', borderRadius: '4px', position: 'relative' }}
                >
                    <LayoutDashboard size={16} color="hsl(var(--color-text-secondary))" />
                    <span style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))' }}>Move to</span>

                    {showMoveMenu && activeBoard && (
                        <div style={{
                            position: 'absolute',
                            bottom: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            marginBottom: '12px', // gap
                            backgroundColor: 'hsl(var(--color-bg-surface))',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            padding: '4px',
                            minWidth: '180px',
                            border: '1px solid hsl(var(--color-border))'
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '4px 8px', fontSize: '12px', color: 'hsl(var(--color-text-secondary))', fontWeight: 600 }}>Select Group</div>
                            {activeBoard.groups.map(g => (
                                <div
                                    key={g.id}
                                    onClick={() => {
                                        moveSelectedItemsToGroup(g.id);
                                        setShowMoveMenu(false);
                                    }}
                                    style={{
                                        padding: '8px',
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        color: 'hsl(var(--color-text-primary))'
                                    }}
                                    className="menu-item"
                                >
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: g.color }} />
                                    {g.title}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Close */}
            <button onClick={clearSelection} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}>
                <X size={20} color="hsl(var(--color-text-secondary))" />
            </button>

            <style>{`
                .batch-action-btn:hover {
                    background-color: hsl(var(--color-bg-hover));
                }
                .batch-action-btn:hover svg {
                    color: hsl(var(--color-text-primary)) !important;
                }
                .batch-action-btn:hover span {
                    color: hsl(var(--color-text-primary)) !important;
                }
                .menu-item:hover {
                    background-color: hsl(var(--color-bg-hover));
                }
            `}</style>
        </div>
    );
};
