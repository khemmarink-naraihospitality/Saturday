import { useMemo, useState, useRef, useEffect } from 'react';
import { Plus, X, ArrowRight } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { wouldCreateCycle } from '../../lib/dependencyUtils';
import type { DependencyType } from '../../types';

interface DependencyLinkSectionProps {
    itemId: string;
    type: DependencyType;
    label: string;
    hint: string;
}

/**
 * One dependency type's outgoing links for an item, as removable chips plus a
 * picker. Rendered once per type in the Timeline date popup, so Finish-to-Start
 * and Finish-to-Finish stay identical to use and only differ in what they mean.
 *
 * A pair of items can only be linked once in one direction (the table's unique
 * edge constraint ignores type), so the picker hides anything this item already
 * points at under *either* type rather than offering a pick that would be
 * rejected on insert.
 */
export const DependencyLinkSection = ({ itemId, type, label, hint }: DependencyLinkSectionProps) => {
    const activeBoardId = useBoardStore(state => state.activeBoardId);
    const board = useBoardStore(state => state.boards.find(b => b.id === activeBoardId));
    const itemDependencies = useBoardStore(state => state.itemDependencies);
    const addItemDependency = useBoardStore(state => state.addItemDependency);
    const removeItemDependency = useBoardStore(state => state.removeItemDependency);

    const [isAdding, setIsAdding] = useState(false);
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);

    const boardDeps = useMemo(
        () => itemDependencies.filter(d => d.boardId === activeBoardId),
        [itemDependencies, activeBoardId]
    );
    const outgoing = useMemo(
        () => boardDeps.filter(d => d.predecessorItemId === itemId && d.type === type),
        [boardDeps, itemId, type]
    );
    const candidates = useMemo(() => {
        if (!board) return [];
        const alreadyLinked = new Set(
            boardDeps.filter(d => d.predecessorItemId === itemId).map(d => d.successorItemId)
        );
        const q = query.trim().toLowerCase();
        return board.items
            .filter(i =>
                i.id !== itemId &&
                !i.parentId &&
                !alreadyLinked.has(i.id) &&
                !wouldCreateCycle(boardDeps, itemId, i.id) &&
                (!q || (i.title || '').toLowerCase().includes(q))
            )
            .slice(0, 30);
    }, [board, boardDeps, itemId, query]);

    useEffect(() => {
        if (!isAdding) return;
        const onClickOutside = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
                setIsAdding(false);
                setQuery('');
                setError(null);
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [isAdding]);

    const handlePick = async (successorId: string) => {
        setError(null);
        const result = await addItemDependency(itemId, successorId, type);
        if (!result.success) {
            setError(result.error || 'Could not link these items');
            return;
        }
        setIsAdding(false);
        setQuery('');
    };

    return (
        <div style={{
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid hsl(var(--color-border))'
        }}>
            <div style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'hsl(var(--color-text-secondary))',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '8px'
            }}>
                {label}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                {outgoing.map(dep => {
                    const successorItem = board?.items.find(i => i.id === dep.successorItemId);
                    return (
                        <span
                            key={dep.id}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                backgroundColor: 'hsl(var(--color-bg-subtle))',
                                border: '1px solid hsl(var(--color-border))',
                                fontSize: '12px',
                                maxWidth: '150px'
                            }}
                        >
                            <ArrowRight size={11} style={{ flexShrink: 0, color: 'hsl(var(--color-text-tertiary))' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={successorItem?.title}>
                                {successorItem?.title || 'Unknown item'}
                            </span>
                            <button
                                onClick={() => removeItemDependency(dep.id)}
                                title="Remove dependency"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'hsl(var(--color-text-tertiary))' }}
                            >
                                <X size={11} />
                            </button>
                        </span>
                    );
                })}

                <div style={{ position: 'relative' }} ref={boxRef}>
                    <button
                        onClick={() => setIsAdding(open => !open)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            border: '1px dashed hsl(var(--color-border))',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: 'hsl(var(--color-text-secondary))'
                        }}
                    >
                        <Plus size={11} />
                        Add item
                    </button>

                    {isAdding && (
                        <div style={{
                            position: 'absolute',
                            bottom: 'calc(100% + 6px)',
                            left: 0,
                            width: '240px',
                            backgroundColor: 'hsl(var(--color-bg-surface))',
                            border: '1px solid hsl(var(--color-border))',
                            borderRadius: '8px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                            zIndex: 1,
                            overflow: 'hidden'
                        }}>
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search items on this board…"
                                style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    border: 'none',
                                    borderBottom: '1px solid hsl(var(--color-border))',
                                    outline: 'none',
                                    fontSize: '12px',
                                    boxSizing: 'border-box',
                                    fontFamily: 'inherit'
                                }}
                            />

                            {error && (
                                <div style={{ padding: '6px 10px', fontSize: '11px', color: '#b91c1c', backgroundColor: '#fef2f2' }}>
                                    {error}
                                </div>
                            )}

                            <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                                {candidates.length === 0 ? (
                                    <div style={{ padding: '10px', fontSize: '11px', color: 'hsl(var(--color-text-tertiary))' }}>
                                        No eligible items
                                    </div>
                                ) : candidates.map(candidate => (
                                    <button
                                        key={candidate.id}
                                        onClick={() => handlePick(candidate.id)}
                                        style={{
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '7px 10px',
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
            </div>

            <p style={{ fontSize: '11px', color: 'hsl(var(--color-text-tertiary))', margin: '6px 0 0' }}>
                {hint}
            </p>
        </div>
    );
};
