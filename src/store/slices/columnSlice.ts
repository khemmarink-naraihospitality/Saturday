import type { StateCreator } from 'zustand';
import { supabase } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { arrayMove } from '@dnd-kit/sortable';
import type { ColumnType } from '../../types';
import type { BoardState } from '../useBoardStore';

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

        let options: any[] = [];
        if (type === 'status') {
            options = [
                { id: uuidv4(), label: 'Done', color: '#279966' },
                { id: uuidv4(), label: 'Working on it', color: '#F0960A' },
                { id: uuidv4(), label: 'Stuck', color: '#E03333' },
            ];
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
        set(state => ({ boards: state.boards.map(b => b.id === activeBoardId ? { ...b, columns: b.columns.map(c => c.id === columnId ? { ...c, title: newTitle } : c) } : b) }));
        await supabase.from('columns').update({ title: newTitle }).eq('id', columnId);
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
            })
        }));

        if (finalOptions.length > 0) {
            await supabase.from('columns').update({ options: finalOptions }).eq('id', columnId);
        }
    },

    updateColumnOption: async (columnId, optionId, updates) => {
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
                        finalOptions = safeOptions.map(o => o.id === optionId ? { ...o, ...updates } : o);
                        return { ...c, options: finalOptions };
                    })
                };
            })
        }));

        if (finalOptions.length > 0) {
            await supabase.from('columns').update({ options: finalOptions }).eq('id', columnId);
        }
    },

    deleteColumnOption: async (columnId, optionId) => {
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
                        finalOptions = safeOptions.filter(o => o.id !== optionId);
                        return { ...c, options: finalOptions };
                    })
                };
            })
        }));
        await supabase.from('columns').update({ options: finalOptions }).eq('id', columnId);
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
