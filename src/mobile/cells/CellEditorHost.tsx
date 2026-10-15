import { useMobileUI } from '../state/mobileStore';
import { BottomSheet } from '../ui';

/**
 * Renders the editor sheet for useMobileUI().cellEditor. Mounted once by
 * MobileApp. Placeholder — the "cells" agent builds one sheet per column type.
 */
export const CellEditorHost = () => {
    const target = useMobileUI(state => state.cellEditor);
    const close = useMobileUI(state => state.closeCellEditor);
    return (
        <BottomSheet open={!!target} onClose={close} title="Edit">
            <div style={{ padding: 24 }}>Editor</div>
        </BottomSheet>
    );
};
