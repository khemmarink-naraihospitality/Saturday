// Tracks which private boards have already been unlocked with the correct PIN
// for the current login session. Backed by sessionStorage so it survives page
// reloads/navigation but clears on tab close, and is explicitly cleared on sign-out.

const STORAGE_KEY = 'unlockedBoardIds';

function readSet(): Set<string> {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        return new Set();
    }
}

function writeSet(ids: Set<string>) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

export function isBoardUnlocked(boardId: string): boolean {
    return readSet().has(boardId);
}

export function markBoardUnlocked(boardId: string) {
    const ids = readSet();
    ids.add(boardId);
    writeSet(ids);
}

export function clearBoardUnlock(boardId: string) {
    const ids = readSet();
    if (ids.delete(boardId)) writeSet(ids);
}

export function clearAllBoardUnlocks() {
    sessionStorage.removeItem(STORAGE_KEY);
}
