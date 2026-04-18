import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createBoardSlice, type BoardSlice } from './slices/boardSlice';
import { createWorkspaceSlice, type WorkspaceSlice } from './slices/workspaceSlice';
import { createItemSlice, type ItemSlice } from './slices/itemSlice';
import { createGroupSlice, type GroupSlice } from './slices/groupSlice';
import { createColumnSlice, type ColumnSlice } from './slices/columnSlice';
import { createMemberSlice, type MemberSlice } from './slices/memberSlice';

export type BoardState = BoardSlice & WorkspaceSlice & ItemSlice & GroupSlice & ColumnSlice & MemberSlice & {};

export const useBoardStore = create<BoardState>()(
    persist(
        (...a) => ({
            ...createBoardSlice(...a),
            ...createWorkspaceSlice(...a),
            ...createItemSlice(...a),
            ...createGroupSlice(...a),
            ...createColumnSlice(...a),
            ...createMemberSlice(...a),
        }),
        {
            name: 'nhgone-local-cache',
            partialize: (state) => ({
                workspaces: state.workspaces,
                boards: state.boards, // Method 2: Cache boards for instant UI load
                activeWorkspaceId: state.activeWorkspaceId,
                activeBoardId: state.activeBoardId,
                activePage: state.activePage
            })
        }
    )
);
