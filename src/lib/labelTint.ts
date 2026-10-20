/**
 * How a Status / Dropdown label colour is drawn. A label's colour is stored as
 * one of the system hexes (labelColors.ts) and drawn as that hex under the
 * Saturday palette; Narai sets --label-tint (how far toward --label-tint-base
 * each colour is pulled, 0% = untouched) and --label-text (the ink on top), so
 * every status reads as a pastel there. It is a CSS expression rather than a
 * second colour table, so it follows a palette change with no re-render, keeps
 * the stored colour untouched, and also covers a hex outside the palette.
 *
 * Use tintLabel() wherever a label's colour paints something, LABEL_TEXT for
 * text on top of it, and plain CSS `color: var(--label-text, #fff)` in a
 * stylesheet. Keep a raw hex only where it is compared or written back.
 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export const tintLabel = <T extends string | undefined>(color: T): T | string =>
    color && HEX.test(color)
        ? `color-mix(in srgb, ${color} calc(100% - var(--label-tint, 0%)), var(--label-tint-base, #ffffff))`
        : color;

export const LABEL_TEXT = 'var(--label-text, #fff)';
