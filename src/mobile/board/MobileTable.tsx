/**
 * The board's main table on a phone — reference: screenshots 18, 20 and the
 * table part of 25. Placeholder — the "board-table" agent.
 *
 * Contract: BoardScreen renders <MobileTable boardId canEdit /> for the
 * 'main_table' view; the horizontally/vertically scrolling element carries
 * data-testid="m-table-scroll" (the preview scrolls it for board-scrolled).
 */
export const MobileTable = ({ boardId }: { boardId: string; canEdit: boolean }) => (
    <div data-testid="m-table-scroll" style={{ flex: 1, overflow: 'auto', padding: 16 }}>Table for {boardId}</div>
);
