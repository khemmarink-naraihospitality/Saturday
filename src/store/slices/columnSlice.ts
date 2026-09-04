import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { arrayMove } from '@dnd-kit/sortable';
import type { ColumnType } from '../../types';
import type { BoardState } from '../useBoardStore';
import { getDefaultStatusOptions } from '../../lib/statusDefaults';

export interface ColumnSlice {
    // Column Actions
    addColumn: (title: string, type: ColumnType, index?: number) => Promise<void>;
    deleteColumn: (columnId: string) => Promise<void>;
    updateColumnTitle: (columnId: string, newTitle: string) => Promise<void>;
    updateColumnWidth: (columnId: string, width: number) => void;
    persistColumnWidth: (columnId: string, width: number) => Promise<void>;
    moveColumn: (fromIndex: number, toIndex: number) => void;
    // Options
    addColumnOption: (columnId: string, label: string, color: string) => void;
    updateColumnOption: (columnId: string, optionId: string, updates: Partial<{ label: string; color: string }>) => void;
    deleteColumnOption: (columnId: string, optionId: string) => void;
    setColumnAggregation: (columnId: string, type: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'none') => void;
    setColumnNumberFormat: (columnId: string, format: 'number' | 'percent' | 'currency', currencyCode?: string) => Promise<void>;
    setColumnAlignment: (columnId: string, align: 'left' | 'center' | 'right') => Promise<void>;
    // Board View Settings
    updateBoardItemColumnTitle: (newTitle: string) => void;
    updateBoardItemColumnWidth: (width: number) => void;
    // Sorting & Filtering
    setColumnSort: (columnId: string, direction: 'asc' | 'desc' | null) => void;
    setColumnFilter: (columnId: string, values: string[]) => void;
    clearColumnFilter: (columnId: string) => void;
    duplicateColumn: (columnId: string) => void;
}

export const createColumnSlice: StateCreator<
    BoardState,
    [],
    [],
    ColumnSlice
> = (set, get) => ({
    addColumn: async (title, type, index) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;
        const newColId = uuidv4();
        const board = get().boards.find(b => b.id === activeBoardId);
        const order = index !== undefined ? index : (board ? board.columns.length : 0);

        // Seed Status columns from the admin-configured Status-to-Color Mapping so a
        // column added to an existing board starts with the same vocabulary a brand new
        // board gets, instead of a separate hardcoded three-option list.
        let options: any[] = [];
        if (type === 'status') {
            options = await getDefaultStatusOptions();
        }

        const newCol = { id: newColId, title, type, order, width: 140, options };

        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ?
                { ...b, columns: [...b.columns, newCol].sort((a, b) => a.order - b.order) } : b
            )
        }));
        await supabase.from('columns').insert({
            id: newColId, board_id: activeBoardId, title, type, order, width: 140, options
        });

        get().logActivity('column_created', 'board', activeBoardId, {
            board_id: activeBoardId,
            column_title: title,
            column_type: type
        });
    },

    deleteColumn: async (columnId) => {
        const { activeBoardId } = get();
        const column = get().boards.find(b => b.id === activeBoardId)?.columns.find(c => c.id === columnId);

        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ?
                { ...b, columns: b.columns.filter(c => c.id !== columnId) } : b
            )
        }));
        await supabase.from('columns').delete().eq('id', columnId);

        if (activeBoardId) {
            get().logActivity('column_deleted', 'board', activeBoardId, {
                board_id: activeBoardId,
                column_title: column?.title || 'Unknown'
            });
        }
    },

    updateColumnTitle: async (columnId, newTitle) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;
        const oldTitle = get().boards.find(b => b.id === activeBoardId)?.columns.find(c => c.id === columnId)?.title;
        set(state => ({ boards: state.boards.map(b => b.id === activeBoardId ? { ...b, columns: b.columns.map(c => c.id === columnId ? { ...c, title: newTitle } : c) } : b) }));
        await supabase.from('columns').update({ title: newTitle }).eq('id', columnId);
        if (oldTitle && oldTitle !== newTitle) {
            get().logActivity('column_renamed', 'board', activeBoardId, {
                board_id: activeBoardId,
                old_title: oldTitle,
                new_title: newTitle
            });
        }
    },

    updateColumnWidth: (columnId, width) => {
        const { activeBoardId } = get();
        set(state => ({ boards: state.boards.map(b => b.id === activeBoardId ? { ...b, columns: b.columns.map(c => c.id === columnId ? { ...c, width } : c) } : b) }));
    },

    // Called once when a resize drag ends (not on every mousemove, unlike
    // updateColumnWidth above) so the width the user settled on survives a
    // reload instead of only living in local state.
    persistColumnWidth: async (columnId, width) => {
        await supabase.from('columns').update({ width }).eq('id', columnId);
    },

    moveColumn: async (fromIndex, toIndex) => {
        const { activeBoardId, boards } = get();
        if (!activeBoardId) return;

        const board = boards.find(b => b.id === activeBoardId);
        if (!board) return;

        const newColumns = arrayMove(board.columns, fromIndex, toIndex);
        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? { ...b, columns: newColumns } : b)
        }));

        const columnIds = newColumns.map(c => c.id);
        await supabase.rpc('reorder_columns', {
            _board_id: activeBoardId,
            _column_ids: columnIds
        });
    },

    duplicateColumn: async (columnId) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;

        const board = get().boards.find(b => b.id === activeBoardId);
        if (!board) return;

        const sourceCol = board.columns.find(c => c.id === columnId);
        if (!sourceCol) return;

        const newColId = uuidv4();
        // Deep copy options with new IDs
        const newOptions = (Array.isArray(sourceCol.options) ? sourceCol.options : []).map((opt: any) => ({
            ...opt,
            id: uuidv4()
        }));

        const sourceIndex = board.columns.findIndex(c => c.id === columnId);
        const newOrder = sourceCol.order + 0.5; // Temporary order, will normalize later or simple insert

        const newCol = {
            ...sourceCol,
            id: newColId,
            title: `Copy of ${sourceCol.title}`,
            options: newOptions,
            order: newOrder
        };

        const newColumns = [...board.columns];
        newColumns.splice(sourceIndex + 1, 0, newCol);

        // Re-index orders
        newColumns.forEach((c, idx) => c.order = idx);

        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? { ...b, columns: newColumns } : b)
        }));

        await supabase.from('columns').insert({
            id: newColId,
            board_id: activeBoardId,
            title: newCol.title,
            type: newCol.type,
            order: sourceIndex + 1, // We should probably re-save all orders if we want to be safe, but insertion is okay for now
            width: newCol.width,
            options: newOptions
        });

        // We technically should update all subsequent column orders in DB to be safe, 
        // but for now let's just insert. If drag-drop relies on strict integer orders, we might need a reorder RPC.
        // Let's call reorder RPC to be safe.
        const columnIds = newColumns.map(c => c.id);
        await supabase.rpc('reorder_columns', {
            _board_id: activeBoardId,
            _column_ids: columnIds
        });

        get().logActivity('column_created', 'board', activeBoardId, {
            board_id: activeBoardId,
            column_title: newCol.title,
            column_type: newCol.type
        });
    },

    setColumnAggregation: (columnId, type) => {
        const { activeBoardId } = get();
        set(state => ({ boards: state.boards.map(b => b.id === activeBoardId ? { ...b, columns: b.columns.map(c => c.id === columnId ? { ...c, aggregation: type } : c) } : b) }));
    },

    setColumnNumberFormat: async (columnId, format, currencyCode) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;
        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? {
                ...b, columns: b.columns.map(c => c.id === columnId ? { ...c, numberFormat: format, currencyCode: format === 'currency' ? currencyCode : undefined } : c)
            } : b)
        }));
        await supabase.from('columns').update({
            number_format: format,
            currency_code: format === 'currency' ? (currencyCode ?? null) : null
        }).eq('id', columnId);
    },

    setColumnAlignment: async (columnId, align) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;
        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? {
                ...b, columns: b.columns.map(c => c.id === columnId ? { ...c, numberAlign: align } : c)
            } : b)
        }));
        await supabase.from('columns').update({ number_align: align }).eq('id', columnId);
    },

    addColumnOption: async (columnId, label, color) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;
        let finalOptions: any[] = [];

        set(state => ({
            boards: state.boards.map(b => {
                if (b.id !== activeBoardId) return b;
                return {
                    ...b,
                    columns: b.columns.map(c => {
                        if (c.id !== columnId) return c;
                        const safeOptions = Array.isArray(c.options) ? c.options : [];
                        finalOptions = [...safeOptions, { id: uuidv4(), label, color }];
                        return { ...c, options: finalOptions };
                    })
                };
            }),
            lastOptimisticUpdate: { ...state.lastOptimisticUpdate, [columnId]: Date.now() }
        }));

        if (finalOptions.length > 0) {
            await supabase.from('columns').update({ options: finalOptions }).eq('id', columnId);
        }
    },

    updateColumnOption: async (columnId, optionId, updates) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;
        let finalOptions: any[] = [];

        // Typing a label fires one of these per keystroke. Each write races
        // its own realtime echo back from Postgres — without marking the
        // column as "just written by us", an echo for an earlier keystroke
        // could land after a later keystroke's local update and blow it
        // away, making characters flash and disappear mid-typing before the
        // final write's echo caught up and silently restored them.
        set(state => ({
            boards: state.boards.map(b => {
                if (b.id !== activeBoardId) return b;
                return {
                    ...b,
                    columns: b.columns.map(c => {
                        if (c.id !== columnId) return c;
                        const safeOptions = Array.isArray(c.options) ? c.options : [];
                        finalOptions = safeOptions.map(o => o.id === optionId ? { ...o, ...updates } : o);
                        return { ...c, options: finalOptions };
                    })
                };
            }),
            lastOptimisticUpdate: { ...state.lastOptimisticUpdate, [columnId]: Date.now() }
        }));

        if (finalOptions.length > 0) {
            await supabase.from('columns').update({ options: finalOptions }).eq('id', columnId);
        }
    },

    deleteColumnOption: async (columnId, optionId) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;
        let finalOptions: any[] = [];
        let deletedOption: any = null;
        let colType: string | undefined;

        set(state => ({
            boards: state.boards.map(b => {
                if (b.id !== activeBoardId) return b;
                return {
                    ...b,
                    columns: b.columns.map(c => {
                        if (c.id !== columnId) return c;
                        colType = c.type;
                        const safeOptions = Array.isArray(c.options) ? c.options : [];
                        deletedOption = safeOptions.find(o => o.id === optionId) || null;
                        finalOptions = safeOptions.filter(o => o.id !== optionId);
                        return { ...c, options: finalOptions };
                    })
                };
            }),
            lastOptimisticUpdate: { ...state.lastOptimisticUpdate, [columnId]: Date.now() }
        }));
        await supabase.from('columns').update({ options: finalOptions }).eq('id', columnId);

        // Removing the option here doesn't touch any item that still has it
        // selected — Dropdown stores its multi-select values as label
        // strings and Status as the option id, and neither is derived from
        // the options list at read time. Without this, a deleted label kept
        // showing up forever as an orphaned tag (Dropdown) or a raw id
        // (Status) on every item that had picked it.
        if (deletedOption && (colType === 'status' || colType === 'dropdown')) {
            const board = get().boards.find(b => b.id === activeBoardId);
            if (!board) return;

            const stripValue = (value: any): any => {
                if (colType === 'dropdown') {
                    if (!Array.isArray(value)) return value;
                    const cleaned = value.filter(v => v !== deletedOption.label && v !== deletedOption.id);
                    return cleaned.length === value.length ? value : cleaned;
                }
                return (value === deletedOption.id || value === deletedOption.label) ? null : value;
            };

            const affectedIds = new Set<string>();
            board.items.forEach(i => {
                const current = i.values?.[columnId];
                if (current === undefined) return;
                if (stripValue(current) !== current) affectedIds.add(i.id);
            });
            if (affectedIds.size === 0) return;

            const applyStrip = <T extends { id: string; values: any }>(item: T): T =>
                affectedIds.has(item.id)
                    ? { ...item, values: { ...item.values, [columnId]: stripValue(item.values?.[columnId]) } }
                    : item;

            set(state => ({
                boards: state.boards.map(b => b.id === activeBoardId
                    ? { ...b, items: b.items.map(applyStrip), groups: b.groups.map(g => ({ ...g, items: g.items.map(applyStrip) })) }
                    : b),
                lastOptimisticUpdate: Array.from(affectedIds).reduce(
                    (acc, id) => ({ ...acc, [id]: Date.now() }),
                    state.lastOptimisticUpdate
                )
            }));

            const updatedBoard = get().boards.find(b => b.id === activeBoardId);
            const results = await Promise.allSettled(
                Array.from(affectedIds).map(id => {
                    const values = updatedBoard?.items.find(i => i.id === id)?.values;
                    if (!values) return Promise.resolve(null);
                    return supabase.from('items').update({ values }).eq('id', id);
                })
            );
            const failed = results.filter(r => r.status === 'rejected').length;
            if (failed > 0) {
                console.error(`[Columns] ${failed}/${affectedIds.size} items failed to clear a deleted option`);
            }
        }
    },

    updateBoardItemColumnTitle: (newTitle) => {
        const { activeBoardId } = get();
        set(state => ({ boards: state.boards.map(b => b.id === activeBoardId ? { ...b, itemColumnTitle: newTitle } : b) }));
    },
    updateBoardItemColumnWidth: async (width) => {
        const { activeBoardId } = get();
        if (!activeBoardId) return;

        // 1. Update local state immediately
        set(state => ({
            boards: state.boards.map(b => b.id === activeBoardId ? { ...b, itemColumnWidth: width } : b)
        }));

        // 2. Persist to DB (Debounced via a simple timeout to avoid excessive writes during resize)
        // Note: In a real heavy-use app, we'd use a proper debounce utility, 
        // but for now we'll handle it with a basic persistence call in the background.
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Load existing settings first to preserve other settings if we ever add them
        const { data: currentMember } = await supabase
            .from('board_members')
            .select('settings')
            .eq('board_id', activeBoardId)
            .eq('user_id', user.id)
            .single();

        const currentSettings = currentMember?.settings || {};
        const newSettings = { ...currentSettings, itemColumnWidth: width };

        await supabase
            .from('board_members')
            .update({ settings: newSettings })
            .eq('board_id', activeBoardId)
            .eq('user_id', user.id);
    },

    setColumnSort: (columnId, direction) => set(state => ({ boards: state.boards.map(b => b.id === state.activeBoardId ? { ...b, sort: direction ? { columnId, direction } : null } : b) })),
    setColumnFilter: (columnId, values) => set(state => ({
        boards: state.boards.map(b => {
            if (b.id !== state.activeBoardId) return b;
            const filters = (b.filters || []).filter(f => f.columnId !== columnId);
            if (values.length) filters.push({ columnId, values });
            return { ...b, filters };
        })
    })),
    clearColumnFilter: (columnId) => set(state => ({ boards: state.boards.map(b => b.id === state.activeBoardId ? { ...b, filters: (b.filters || []).filter(f => f.columnId !== columnId) } : b) })),
});
