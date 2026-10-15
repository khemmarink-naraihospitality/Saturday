import { useMobileUI } from '../state/mobileStore';
import { BottomSheet } from '../ui';

/** The board's Views sheet — reference: screenshot 26. Placeholder — the "board" agent. */
export const ViewsSheetHost = () => {
    const boardId = useMobileUI(state => state.viewsSheetBoardId);
    const close = useMobileUI(state => state.closeViewsSheet);
    return (
        <BottomSheet open={!!boardId} onClose={close} title="Views" size="tall">
            <div style={{ padding: 24 }}>Views</div>
        </BottomSheet>
    );
};
