import { create } from 'zustand';
import { createBoardSlice, type BoardSlice } from './slices/boardSlice';
import { createWorkspaceSlice, type WorkspaceSlice } from './slices/workspaceSlice';
import { createItemSlice, type ItemSlice } from './slices/itemSlice';
import { createGroupSlice, type GroupSlice } from './slices/groupSlice';
import { createColumnSlice, type ColumnSlice } from './slices/columnSlice';
import { createMemberSlice, type MemberSlice } from './slices/memberSlice';
import { createGroupLinkSlice, type GroupLinkSlice } from './slices/groupLinkSlice';
import { createItemDependencySlice, type ItemDependencySlice } from './slices/itemDependencySlice';
import { setFormulaPeopleSource } from '../lib/formula';

export type BoardState = BoardSlice & WorkspaceSlice & ItemSlice & GroupSlice & ColumnSlice & MemberSlice & GroupLinkSlice & ItemDependencySlice & {};

export const useBoardStore = create<BoardState>()((...a) => ({
    ...createBoardSlice(...a),
    ...createWorkspaceSlice(...a),
    ...createItemSlice(...a),
    ...createGroupSlice(...a),
    ...createColumnSlice(...a),
    ...createMemberSlice(...a),
    ...createGroupLinkSlice(...a),
    ...createItemDependencySlice(...a),
}));

// {Person} in a formula reads names from the open board's members.
setFormulaPeopleSource(() => useBoardStore.getState().activeBoardMembers || []);
