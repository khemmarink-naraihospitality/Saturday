import { useThemeStore } from '../store/useThemeStore';
import { isNewUi } from './brand';
import type { PaletteId } from './palettes';

/**
 * The names of things, as the UI says them. Saturday's are the words the app
 * has always used, so swapping a literal for one of these leaves Saturday's
 * text exactly as it was; NHG's are the New UI's (src/lib/brand.ts). Each word
 * comes in the forms the copy needs, so a sentence keeps its own capitals:
 * `Add ${t.board}` is "Add board" or "Add space".
 */
export interface Terms {
    Board: string; Boards: string; board: string; boards: string;
    Workspace: string; Workspaces: string; workspace: string; workspaces: string;
    Group: string; Groups: string; group: string; groups: string;
    Item: string; Items: string; item: string; items: string;
    Subitem: string; Subitems: string; subitem: string; subitems: string;
    Update: string; Updates: string; update: string; updates: string;
    /** The first view tab. */
    mainTable: string;
}

const SATURDAY: Terms = {
    Board: 'Board', Boards: 'Boards', board: 'board', boards: 'boards',
    Workspace: 'Workspace', Workspaces: 'Workspaces', workspace: 'workspace', workspaces: 'workspaces',
    Group: 'Group', Groups: 'Groups', group: 'group', groups: 'groups',
    Item: 'Item', Items: 'Items', item: 'item', items: 'items',
    Subitem: 'Subitem', Subitems: 'Subitems', subitem: 'subitem', subitems: 'subitems',
    Update: 'Update', Updates: 'Updates', update: 'update', updates: 'updates',
    mainTable: 'Main table',
};

const NHG: Terms = {
    Board: 'Space', Boards: 'Spaces', board: 'space', boards: 'spaces',
    Workspace: 'Space Folder', Workspaces: 'Space Folders', workspace: 'space folder', workspaces: 'space folders',
    Group: 'Task Group', Groups: 'Task Groups', group: 'task group', groups: 'task groups',
    Item: 'Task', Items: 'Tasks', item: 'task', items: 'tasks',
    Subitem: 'Subtask', Subitems: 'Subtasks', subitem: 'subtask', subitems: 'subtasks',
    Update: 'Comment', Updates: 'Comments', update: 'comment', updates: 'comments',
    mainTable: 'Table',
};

export const termsFor = (palette: PaletteId): Terms => (isNewUi(palette) ? NHG : SATURDAY);

/** For components: re-renders when someone switches palette. */
export const useTerms = (): Terms => useThemeStore(s => termsFor(s.palette));

/** For code outside React (store actions, toasts, confirm texts). */
export const terms = (): Terms => termsFor(useThemeStore.getState().palette);

const WORDS = /\b(Sub-?items?|sub-?items?|Workspaces?|workspaces?|Boards?|boards?|Groups?|groups?|Items?|items?)\b/g;

const WORD_KEY: Record<string, keyof Terms> = {
    subitem: 'subitem', subitems: 'subitems', Subitem: 'Subitem', Subitems: 'Subitems',
    workspace: 'workspace', workspaces: 'workspaces', Workspace: 'Workspace', Workspaces: 'Workspaces',
    board: 'board', boards: 'boards', Board: 'Board', Boards: 'Boards',
    group: 'group', groups: 'groups', Group: 'Group', Groups: 'Groups',
    item: 'item', items: 'items', Item: 'Item', Items: 'Items',
};

/**
 * A fixed phrase of the app's own — a log label, a message — in the current
 * words: Board, Workspace, Group, Item and Sub-item as whole words, either
 * case, singular or plural. Never for user data. "Update" is left alone, since
 * it is also a verb ("Updated", "update the date"); those are worded where
 * they're written. Saturday gets the text back untouched.
 */
export const reword = (text: string, t: Terms): string =>
    t === SATURDAY ? text : text.replace(WORDS, word => t[WORD_KEY[word.replace('-', '')]] ?? word);

/** "1 task" / "3 tasks". */
export const countOf = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
