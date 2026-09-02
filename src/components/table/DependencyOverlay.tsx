import { useState } from 'react';
import type { ItemDependency } from '../../types';
import { buildDependencyPath } from '../../lib/dependencyUtils';
import { NAME_COL_WIDTH, ROW_HEIGHT, type BarGeometry } from './timelineGeometry';

const ARROW_COLOR = '#5b5b7b';

interface DependencyOverlayProps {
    dependencies: ItemDependency[];
    barGeometry: Map<string, BarGeometry>;
    rowCount: number;
    linkDraft: { fromItemId: string; x: number; y: number } | null;
    canEdit: boolean;
    onRemove: (dependencyId: string) => void;
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
    onRemove
}: DependencyOverlayProps) => {
    const [pendingRemoval, setPendingRemoval] = useState<{ id: string; x: number; y: number } | null>(null);

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
                                    onClick={(e) => {
                                        const host = (e.currentTarget.ownerSVGElement?.parentElement)?.getBoundingClientRect();
                                        setPendingRemoval({
                                            id: dep.id,
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

            {pendingRemoval && (
                <>
                    <div
                        onClick={() => setPendingRemoval(null)}
                        style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            left: `${pendingRemoval.x}px`,
                            top: `${pendingRemoval.y}px`,
                            transform: 'translate(-50%, -110%)',
                            backgroundColor: 'white',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '8px',
                            boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                            padding: '10px 12px',
                            zIndex: 41,
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <div style={{ fontSize: '12px', color: 'hsl(var(--color-text-secondary))', marginBottom: '8px' }}>
                            Remove this dependency?
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setPendingRemoval(null)}
                                style={{
                                    padding: '4px 10px',
                                    border: '1px solid hsl(var(--color-border))',
                                    borderRadius: '4px',
                                    background: 'white',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    onRemove(pendingRemoval.id);
                                    setPendingRemoval(null);
                                }}
                                style={{
                                    padding: '4px 10px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    backgroundColor: '#dc2626',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 500
                                }}
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                </>
            )}
        </>
    );
};
