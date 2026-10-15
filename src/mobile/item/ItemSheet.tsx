import { useBoardStore } from '../../store/useBoardStore';
import { BottomSheet } from '../ui';

/** An item's own screen — reference: screenshot 19. Placeholder — the "item" agent. */
export const ItemSheet = () => {
    const itemId = useBoardStore(state => state.activeItemId);
    const close = () => useBoardStore.getState().setActiveItem(null);
    return (
        <BottomSheet open={!!itemId} onClose={close} size="full" title="Item">
            <div style={{ padding: 24 }}>{itemId}</div>
        </BottomSheet>
    );
};
