import { useEffect } from 'react';
import { useBoardStore } from '../store/useBoardStore';
import { usePermission } from './usePermission';
import { useToday } from './useToday';
import { hasMoveRules } from '../lib/formula';

/**
 * Formula rules that move a task to a group act on edits as they happen; this
 * covers a date passing (Timeline has passed, due in 3 days…). The open board
 * is checked when it loads and again at midnight, by someone who may edit it;
 * each column records the day it was checked, so it happens once a day.
 */
export const useDailyRuleMoves = () => {
    const today = useToday();
    const { can } = usePermission();
    const canEdit = can('edit_items');
    const boardId = useBoardStore(state => state.activeBoardId);
    const ready = useBoardStore(state => {
        const board = state.boards.find(b => b.id === state.activeBoardId);
        return !!board?.isDataLoaded && board.columns.some(hasMoveRules);
    });
    const check = useBoardStore(state => state.checkDailyRuleMoves);

    useEffect(() => {
        if (boardId && ready && canEdit) void check(boardId, today);
    }, [boardId, ready, canEdit, today, check]);
};
