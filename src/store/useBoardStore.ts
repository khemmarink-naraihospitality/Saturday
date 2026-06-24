import { create } from 'zustand';
import { createBoardSlice, type BoardSlice } from './slices/boardSlice';
import { createWorkspaceSlice, type WorkspaceSlice } from './slices/workspaceSlice';
import { createItemSlice, type ItemSlice } from './slices/itemSlice';
import { createGroupSlice, type GroupSlice } from './slices/groupSlice';
import { createColumnSlice, type ColumnSlice } from './slices/columnSlice';
import { createMemberSlice, type MemberSlice } from './slices/memberSlice';
import { createGroupLinkSlice, type GroupLinkSlice } from './slices/groupLinkSlice';

export type BoardState = BoardSlice & WorkspaceSlice & ItemSlice & GroupSlice & ColumnSlice & MemberSlice & GroupLinkSlice & {};

export const useBoardStore = create<BoardState>()((...a) => ({
    ...createBoardSlice(...a),
    ...createWorkspaceSlice(...a),
    ...createItemSlice(...a),
    ...createGroupSlice(...a),
    ...createColumnSlice(...a),
    ...createMemberSlice(...a),
    ...createGroupLinkSlice(...a),
}));
