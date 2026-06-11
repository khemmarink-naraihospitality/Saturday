import type { Column } from '../types';

export const CURRENCY_OPTIONS: { code: string; symbol: string; label: string }[] = [
    { code: 'USD', symbol: '$', label: 'US Dollar' },
    { code: 'EUR', symbol: '€', label: 'Euro' },
    { code: 'GBP', symbol: '£', label: 'British Pound' },
    { code: 'THB', symbol: '฿', label: 'Thai Baht' },
    { code: 'JPY', symbol: '¥', label: 'Japanese Yen' },
    { code: 'CNY', symbol: '¥', label: 'Chinese Yuan' },
    { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
    { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
    { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
];

export const getCurrencySymbol = (code?: string): string =>
    CURRENCY_OPTIONS.find(c => c.code === code)?.symbol || '$';

// Formats a numeric value for display according to a column's numberFormat setting.
// Used both for individual cell values and for the group summary row aggregates.
export const formatNumberValue = (value: number | string | null | undefined, column: Column): string => {
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    if (value === null || value === undefined || value === '' || isNaN(num)) return '';

    const formatted = num.toLocaleString();

    switch (column.numberFormat) {
        case 'percent':
            return `${formatted}%`;
        case 'currency':
            return `${getCurrencySymbol(column.currencyCode)}${formatted}`;
        default:
            return formatted;
    }
};
