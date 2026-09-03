import { useState } from 'react';
import type { ItemDependency } from '../../types';
import { buildDependencyPath, wouldCreateCycle } from '../../lib/dependencyUtils';
import { NAME_COL_WIDTH, ROW_HEIGHT, type BarGeometry } from './timelineGeometry';

const ARROW_COLOR = '#5b5b7b';

interface DependencyOverlayProps {
    dependencies: ItemDependency[];
    barGeometry: Map<string, BarGeometry>;
    rowCount: number;
    linkDraft: { fromItemId: string; x: number; y: number } | null;
    canEdit: boolean;
    onRemove: (dependencyId: string) => void;
    items: { id: string; title: string }[];
    onUpdate: (dependencyId: string, predecessorItemId: string, successorItemId: string) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Finish-to-Start arrows drawn over the Timeline rows.
 *
 * The SVG itself ignores the pointer so bars stay draggable; only the invisible
 * fat stroke on each arrow accepts clicks, which is what makes a 1.5px line
 * realistically clickable.
 */
export const DependencyOverlay = ({
    dependencies,
    barGeometry,
    rowCount,
    linkDraft,
    canEdit,
    onRemove,
    items,
    onUpdate
}: DependencyOverlayProps) => {
    const [editing, setEditing] = useState<{ dep: ItemDependency; x: number; y: number } | null>(null);

    const anchorsFor = (dep: ItemDependency) => {
        const from = barGeometry.get(dep.predecessorItemId);
        const to = barGeometry.get(dep.successorItemId);
        // Either end may be filtered out of the view or sitting outside the
        // visible date window — then there is nothing to connect.
        if (!from || !to) return null;
        return {
            start: {
                x: NAME_COL_WIDTH + from.left + from.width,
                y: from.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2
            },
            end: {
                x: NAME_COL_WIDTH + to.left,
                y: to.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2
            }
        };
    };

    const draftAnchor = linkDraft ? barGeometry.get(linkDraft.fromItemId) : null;

    return (
        <>
            <svg
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${rowCount * ROW_HEIGHT}px`,
                    pointerEvents: 'none',
                    overflow: 'visible',
                    zIndex: 6
                }}
            >
                <defs>
                    <marker
                        id="dep-arrowhead"
                        markerWidth="8"
                        markerHeight="8"
                        refX="6"
                        refY="3"
                        orient="auto"
                        markerUnits="userSpaceOnUse"
                    >
                        <path d="M 0 0 L 6 3 L 0 6 z" fill={ARROW_COLOR} />
                    </marker>
                </defs>

                {dependencies.map(dep => {
                    const anchors = anchorsFor(dep);
                    if (!anchors) return null;
                    const path = buildDependencyPath(anchors.start, anchors.end);

                    return (
                        <g key={dep.id}>
                            {canEdit && (
                                <path
                                    d={path}
                                    stroke="transparent"
                                    strokeWidth={12}
                                    fill="none"
                                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                    onDoubleClick={(e) => {
                                        const host = (e.currentTarget.ownerSVGElement?.parentElement)?.getBoundingClientRect();
                                        setEditing({
                                            dep,
                                            x: host ? e.clientX - host.left : anchors.end.x,
                                            y: host ? e.clientY - host.top : anchors.end.y
                                        });
                                    }}
                                />
                            )}
                            <path
                                d={path}
                                stroke={ARROW_COLOR}
                                strokeWidth={1.5}
                                fill="none"
                                markerEnd="url(#dep-arrowhead)"
                                pointerEvents="none"
                            />
                        </g>
                    );
                })}

                {linkDraft && draftAnchor && (
                    <path
                        d={buildDependencyPath(
                            {
                                x: NAME_COL_WIDTH + draftAnchor.left + draftAnchor.width,
                                y: draftAnchor.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2
                            },
                            { x: linkDraft.x, y: linkDraft.y }
                        )}
                        stroke={ARROW_COLOR}
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        fill="none"
                        pointerEvents="none"
                    />
                )}
            </svg>

            {editing && (
                <DependencyEditPopover
                    dep={editing.dep}
                    x={editing.x}
                    y={editing.y}
                    items={items}
                    dependencies={dependencies}
                    onUpdate={onUpdate}
                    onRemove={onRemove}
                    onClose={() => setEditing(null)}
                />
            )}
        </>
    );
};

interface DependencyEditPopoverProps {
    dep: ItemDependency;
    x: number;
    y: number;
    items: { id: string; title: string }[];
    dependencies: ItemDependency[];
    onUpdate: (dependencyId: string, predecessorItemId: string, successorItemId: string) => Promise<{ success: boolean; error?: string }>;
    onRemove: (dependencyId: string) => void;
    onClose: () => void;
}

/**
 * Double-click on an arrow opens this: a quick way to re-point either end of
 * an existing link, or remove it, without leaving the Timeline.
 */
const DependencyEditPopover = ({ dep, x, y, items, dependencies, onUpdate, onRemove, onClose }: DependencyEditPopoverProps) => {
    const [predecessorId, setPredecessorId] = useState(dep.predecessorItemId);
    const [successorId, setSuccessorId] = useState(dep.successorItemId);
    const [openField, setOpenField] = useState<'predecessor' | 'successor' | null>(null);
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const itemTitle = (id: string) => items.find(i => i.id === id)?.title || 'Unknown item';

    // The graph as it would look with this edge already removed, so
    // re-pointing an end doesn't see the edge fighting itself.
    const otherDeps = dependencies.filter(d => d.id !== dep.id);

    const candidatesFor = (field: 'predecessor' | 'successor') => {
        const otherEndId = field === 'predecessor' ? successorId : predecessorId;
        const q = query.trim().toLowerCase();
        return items
            .filter(i =>
                i.id !== otherEndId &&
                (!q || i.title.toLowerCase().includes(q)) &&
                !wouldCreateCycle(
                    otherDeps,
                    field === 'predecessor' ? i.id : predecessorId,
                    field === 'predecessor' ? successorId : i.id
                )
            )
            .slice(0, 30);
    };

    const openPicker = (field: 'predecessor' | 'successor') => {
        setOpenField(prev => (prev === field ? null : field));
        setQuery('');
        setError(null);
    };

    const pick = (field: 'predecessor' | 'successor', id: string) => {
        if (field === 'predecessor') setPredecessorId(id); else setSuccessorId(id);
        setOpenField(null);
        setError(null);
    };

    const handleSave = async () => {
        setIsSaving(true);
        const result = await onUpdate(dep.id, predecessorId, successorId);
        setIsSaving(false);
        if (!result.success) {
            setError(result.error || 'Could not save this change');
            return;
        }
        onClose();
    };

    const fieldRow = (label: string, field: 'predecessor' | 'successor', currentId: string) => (
        <div style={{ position: 'relative' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'hsl(var(--color-text-tertiary))', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>
                {label}
            </div>
            <button
                onClick={() => openPicker(field)}
                style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: '1px solid hsl(var(--color-border))',
                    backgroundColor: openField === field ? 'hsl(var(--color-bg-hover))' : 'white',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: 'hsl(var(--color-text-primary))',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}
            >
                {itemTitle(currentId)}
            </button>

            {openField === field && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    width: '220px',
                    backgroundColor: 'white',
                    border: '1px solid hsl(var(--color-border))',
                    borderRadius: '8px',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                    zIndex: 43,
                    overflow: 'hidden'
                }}>
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search items…"
                        style={{
                            width: '100%',
                            padding: '7px 9px',
                            border: 'none',
                            borderBottom: '1px solid hsl(var(--color-border))',
                            outline: 'none',
                            fontSize: '12px',
                            boxSizing: 'border-box',
                            fontFamily: 'inherit'
                        }}
                    />
                    <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                        {candidatesFor(field).length === 0 ? (
                            <div style={{ padding: '9px', fontSize: '11px', color: 'hsl(var(--color-text-tertiary))' }}>
                                No eligible items
                            </div>
                        ) : candidatesFor(field).map(candidate => (
                            <button
                                key={candidate.id}
                                onClick={() => pick(field, candidate.id)}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '7px 9px',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    color: 'hsl(var(--color-text-primary))',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--color-bg-hover))'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                {candidate.title || 'Untitled'}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
            <div
                style={{
                    position: 'absolute',
                    left: `${x}px`,
                    top: `${y}px`,
                    transform: 'translate(-50%, -110%)',
                    backgroundColor: 'white',
                    border: '1px solid hsl(var(--color-border))',
                    borderRadius: '8px',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                    padding: '12px',
                    zIndex: 41,
                    width: '220px'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {fieldRow('Predecessor (finishes)', 'predecessor', predecessorId)}
                    {fieldRow('Successor (then starts)', 'successor', successorId)}
                </div>

                {error && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#b91c1c' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid hsl(var(--color-border))' }}>
                    <button
                        onClick={() => { onRemove(dep.id); onClose(); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#dc2626', padding: 0 }}
                    >
                        Remove
                    </button>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={onClose}
                            style={{ padding: '4px 10px', border: '1px solid hsl(var(--color-border))', borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '12px' }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving || (predecessorId === dep.predecessorItemId && successorId === dep.successorItemId)}
                            style={{
                                padding: '4px 10px',
                                border: 'none',
                                borderRadius: '4px',
                                backgroundColor: 'hsl(var(--color-brand-primary))',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 500,
                                opacity: (isSaving || (predecessorId === dep.predecessorItemId && successorId === dep.successorItemId)) ? 0.6 : 1
                            }}
                        >
                            {isSaving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};
