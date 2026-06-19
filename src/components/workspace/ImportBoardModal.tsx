import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, Loader2, CheckCircle2, Layers, Plus, AlertCircle } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { showToast } from '../../utils/toast';
import { supabase } from '../../lib/supabase';

interface ImportBoardModalProps {
    onClose: () => void;
}

// Returns YYYY-MM-DD format for compatibility with TimelineCell
const toYMD = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const parseDate = (val: any, _isUpdate = false): string | null => {
    if (val === null || val === undefined || val === '') return null;

    // 1. JS Date object (xlsx returns this with cellDates:true)
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        return toYMD(val);
    }

    // 2. Number → Excel serial date
    const num = Number(val);
    if (!isNaN(num) && num > 1 && num < 2958466) {
        const d = new Date(Math.round((num - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime())) return toYMD(d);
        return null;
    }

    const s = String(val).trim();
    if (!s) return null;

    // 3. Already YYYY-MM-DD
    const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) {
        const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
        if (!isNaN(d.getTime())) return toYMD(d);
    }

    // 4. dd/mm/yyyy or dd-mm-yyyy
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
        const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
        if (!isNaN(d.getTime())) return toYMD(d);
    }

    // 5. dd-MMM-yyyy  e.g. "15-Jun-2025", "1 Jan 2025"
    const monthNames: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const dmm = s.match(/^(\d{1,2})[\/\-\s](\w{3,9})[\/\-\s](\d{4})$/i);
    if (dmm) {
        const mIdx = monthNames[dmm[2].substring(0, 3).toLowerCase()];
        if (mIdx !== undefined) {
            const d = new Date(Number(dmm[3]), mIdx, Number(dmm[1]));
            if (!isNaN(d.getTime())) return toYMD(d);
        }
    }

    // 6. MMM dd, yyyy  e.g. "Jun 15, 2025"
    const mdy2 = s.match(/^(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})$/i);
    if (mdy2) {
        const mIdx = monthNames[mdy2[1].substring(0, 3).toLowerCase()];
        if (mIdx !== undefined) {
            const d = new Date(Number(mdy2[3]), mIdx, Number(mdy2[2]));
            if (!isNaN(d.getTime())) return toYMD(d);
        }
    }

    // 7. General JS Date.parse fallback
    const d = new Date(s);
    if (!isNaN(d.getTime())) return toYMD(d);

    // 8. Unparsable → null
    return null;
};

// Parses the "Created At" cell of the Updates sheet, preserving time-of-day.
// Unlike parseDate (which is date-only, for board column values), this keeps the
// exact timestamp so Monday exports like "27/January/2025 14:30:05" don't collapse
// to midnight (which would display as 07:00 in UTC+7).
const parseUpdateDateTime = (val: any): Date => {
    if (val instanceof Date && !isNaN(val.getTime())) return val;

    // Excel serial number — the fractional part carries the time-of-day. Excel serials are
    // timezone-naive, so read the UTC wall-clock and rebuild it as a local Date so the
    // displayed time matches the source value rather than shifting by the local offset.
    if (typeof val === 'number' || (typeof val === 'string' && /^\d+(\.\d+)?$/.test(val.trim()))) {
        const num = Number(val);
        if (!isNaN(num) && num > 1 && num < 2958466) {
            const u = new Date(Math.round((num - 25569) * 86400 * 1000));
            if (!isNaN(u.getTime())) {
                return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
            }
        }
    }

    const s = String(val ?? '').trim();
    if (!s) return new Date();

    // Native ISO 8601 (e.g. "2025-01-27T14:30:05Z")
    if (s.includes('T')) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d;
    }

    // Pull out the time-of-day, if any (HH:MM[:SS] with optional AM/PM)
    let hh = 0, mm = 0, ss = 0;
    const timeMatch = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/);
    if (timeMatch) {
        hh = Number(timeMatch[1]);
        mm = Number(timeMatch[2]);
        ss = timeMatch[3] ? Number(timeMatch[3]) : 0;
        const ap = timeMatch[4]?.toLowerCase();
        if (ap === 'pm' && hh < 12) hh += 12;
        if (ap === 'am' && hh === 12) hh = 0;
    }

    // Parse the date portion (with the time substring removed) and combine.
    // Build from local components so the displayed time matches the source value.
    const dateStr = timeMatch ? s.replace(timeMatch[0], '').trim() : s;
    const ymd = parseDate(dateStr, true);
    if (ymd) {
        const [y, m, d] = ymd.split('-').map(Number);
        const dt = new Date(y, m - 1, d, hh, mm, ss);
        if (!isNaN(dt.getTime())) return dt;
    }

    // General fallback — keeps time if Date.parse understands the string.
    const d2 = new Date(s);
    if (!isNaN(d2.getTime())) return d2;

    return new Date();
};

// Helper to extract font color from an Excel cell
const getCellFontColor = (worksheet: XLSX.WorkSheet, cellRef: string): string | null => {
    const cell = worksheet[cellRef];
    if (!cell || !cell.s) return null;
    const s = cell.s as any;
    
    // 1. Check for explicit RGB color
    let rgb = s?.font?.color?.rgb || s?.color?.rgb || s?.fgColor?.rgb;
    
    // 2. Fallback to common Theme colors if RGB is missing
    if (!rgb && s?.font?.color?.theme !== undefined) {
        const theme = s.font.color.theme;
        if (theme === 4 || theme === 5 || theme === 1) rgb = '579bfc'; // Blue
        if (theme === 6) rgb = 'e2445c'; // Red
        if (theme === 7) rgb = 'fdab3d'; // Orange
        if (theme === 8) rgb = '00c875'; // Green
    }

    // 3. Fallback to Indexed colors
    if (!rgb && s?.font?.color?.indexed !== undefined) {
        const idx = s.font.color.indexed;
        const indexMap: Record<number, string> = {
            2: 'e2445c', // Red
            3: '00c875', // Green
            4: '579bfc', // Blue
            5: 'ff9800', // Yellow/Orange
            6: 'a25ddc', // Purple
            8: 'e2445c', // Red
            10: 'e2445c', // Red
            11: '00c875', // Green
            12: '579bfc'  // Blue
        };
        if (indexMap[idx]) rgb = indexMap[idx];
    }

    if (!rgb) return null;
    
    // Strip alpha prefix if present (AARRGGBB → RRGGBB)
    const hex = String(rgb).length > 6 ? String(rgb).substring(2) : String(rgb);
    if (hex.toLowerCase() === 'ffffff' || hex.toLowerCase() === '000000') return null; 
    return `#${hex}`;
};

// Helper to extract background color from an Excel cell (Fill color)
const getCellBgColor = (worksheet: XLSX.WorkSheet, cellRef: string): string | null => {
    const cell = worksheet[cellRef];
    if (!cell || !cell.s || !cell.s.fill) return null;
    const s = cell.s as any;
    
    // 1. Check for explicit RGB color in fgColor (Foreground of the pattern, i.e., the background color we see)
    let rgb = s?.fill?.fgColor?.rgb || s?.fill?.bgColor?.rgb;
    
    // 2. Fallback to common Theme colors if RGB is missing
    if (!rgb && s?.fill?.fgColor?.theme !== undefined) {
        const theme = s.fill.fgColor.theme;
        
        // Common monday.com theme colors
        if (theme === 4 || theme === 5 || theme === 1) rgb = '579bfc'; // Blue
        if (theme === 6) rgb = 'e2445c'; // Red
        if (theme === 7) rgb = 'fdab3d'; // Orange
        if (theme === 8) rgb = '00c875'; // Green
        if (theme === 9) rgb = 'a25ddc'; // Purple
    }

    if (!rgb) return null;
    
    // Strip alpha prefix if present (AARRGGBB → RRGGBB)
    const hex = String(rgb).length > 6 ? String(rgb).substring(2) : String(rgb);
    if (hex.toLowerCase() === 'ffffff' || hex.toLowerCase() === '000000') return null;
    return `#${hex}`;
};

// Converts plain-text Update content (from Monday.com Excel export) to HTML.
// Preserves newlines, converts basic markdown syntax, and leaves existing HTML untouched.
const richifyUpdateContent = (raw: string): string => {
    if (!raw) return '';
    // Already HTML — leave as-is. Hyperlinks stay clickable, and any color the source
    // specifies (inline style) is preserved as-is; see narai-update-content's `a` rule
    // for the default (no forced color) applied when the source has none.
    if (/<[a-z][^>]*>/i.test(raw)) return raw;

    // Handle \r\n (Windows), \r (old Mac), \n (Unix)
    const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const parts: string[] = [];

    interface ListEntry { text: string; gapBefore?: boolean; }
    let listItems: ListEntry[] = [];
    let orderedItems: ListEntry[] = [];
    // True when a blank line was seen while inside a list — deferred until we know if next line is also a list item
    let gapPending = false;

    const inlineFormat = (text: string): string =>
        text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.+?)__/g, '<strong>$1</strong>')
            // Image URLs → <img>
            .replace(/(https?:\/\/[^\s<]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s<]*)?)/gi,
                '<img src="$1" style="max-width:100%;border-radius:6px;margin-top:8px;border:1px solid #eee;" />')
            // Remaining URLs → <a>
            .replace(/(https?:\/\/[^\s<"]+)/g,
                '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#0073ea;text-decoration:underline;">$1</a>');

    const flushLists = () => {
        if (listItems.length) {
            parts.push(`<ul>${listItems.map(li =>
                `<li style="${li.gapBefore ? 'margin-top:10px;' : ''}">${li.text}</li>`
            ).join('')}</ul>`);
            listItems = [];
        }
        if (orderedItems.length) {
            parts.push(`<ol>${orderedItems.map(li =>
                `<li style="${li.gapBefore ? 'margin-top:10px;' : ''}">${li.text}</li>`
            ).join('')}</ol>`);
            orderedItems = [];
        }
        gapPending = false;
    };

    for (const line of lines) {
        const trimmed = line.trim();
        const isUnordered = /^[-*•]\s*\S/.test(trimmed);
        const isOrdered   = /^\d+[.)]\s+/.test(trimmed);

        if (isUnordered) {
            // Switch from ordered → unordered
            if (orderedItems.length) { flushLists(); }
            listItems.push({ text: inlineFormat(trimmed.replace(/^[-*•]\s*/, '')), gapBefore: gapPending });
            gapPending = false;
        } else if (isOrdered) {
            // Switch from unordered → ordered
            if (listItems.length) { flushLists(); }
            orderedItems.push({ text: inlineFormat(trimmed.replace(/^\d+[.)]\s+/, '')), gapBefore: gapPending });
            gapPending = false;
        } else if (trimmed === '' && (orderedItems.length || listItems.length)) {
            // Blank line INSIDE a list — defer; next item will get gapBefore spacing
            gapPending = true;
        } else {
            // Non-list content (or blank line outside a list)
            if (gapPending) {
                // Blank was after the list, before this non-list content → flush list then <br>
                flushLists();
                parts.push('<br>');
            } else {
                flushLists();
            }
            if (trimmed === '') {
                parts.push('<br>');
            } else {
                parts.push(`<p style="margin:0 0 4px 0">${inlineFormat(trimmed)}</p>`);
            }
        }
    }
    flushLists();
    return parts.join('');
};

const parseFiles = (val: any) => {
    if (!val) return [];
    const s = String(val).trim();
    if (!s) return [];
    
    const urls = s.split(/[\s,]+/).filter(u => u.startsWith('http'));
    return urls.map(url => ({
        id: Math.random().toString(36).substring(7),
        name: url.split('/').pop() || 'File',
        url: url,
        type: 'link'
    }));
};

export const ImportBoardModal: React.FC<ImportBoardModalProps> = ({ onClose }) => {
    const [files, setFiles] = useState<File[]>([]);
    const [isParsing, setIsParsing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [importResults, setImportResults] = useState<{ boards: number; items: number; updates: number } | null>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const [parseWarnings, setParseWarnings] = useState<string[]>([]);
    const [previews, setPreviews] = useState<any[]>([]);
    const [selectedSheetIds, setSelectedSheetIds] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    
    const importExcelBoard = useBoardStore(state => state.importExcelBoard);


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length > 0) {
            const excelFiles = selectedFiles.filter(f => f.name.endsWith('.xlsx'));
            if (excelFiles.length > 0) {
                setFiles(prev => [...prev, ...excelFiles]);
                excelFiles.forEach(f => parseExcel(f));
            } else {
                showToast('Please select valid .xlsx files', 'error');
            }
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const parseExcel = async (file: File) => {
        setIsParsing(true);
        try {
            // 🔄 Fetch latest status mappings directly before parsing to avoid stale state/closures
            console.log('[Import] Fetching status mappings from DB...');
            let currentMappings: Record<string, string> = {};
            try {
                const { data } = await supabase
                    .from('system_settings')
                    .select('value')
                    .eq('key', 'status_color_mapping')
                    .single();
                
                if (data?.value) {
                    currentMappings = data.value as Record<string, string>;
                    console.log('[Import] Mappings loaded:', currentMappings);
                }
            } catch (err) {
                console.error('[Import] Failed to fetch mappings:', err);
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellStyles: true });
                
                // 🌈 Define Status Color Map early for use in row parsing
                const standardStatusColorMap: Record<string, string> = {
                    'done': '#00c875',
                    'completed': '#00c875',
                    'working on it': '#fdab3d',
                    'in progress': '#fdab3d',
                    'stuck': '#e2445c',
                    'at risk': '#e2445c',
                    'ready for review': '#ffd533',
                    'waiting': '#ffd533',
                    'on hold': '#a1a1a1',
                    'rfp': '#ff158a',
                    'not start': '#333333',
                    'n/a': '#333333',
                    'active': '#00c875',
                    'inactive': '#e2445c',
                    'ready': '#ffd533',
                    'ready to use': '#333333',
                    'in use': '#00c875',
                    'cancelled': '#333333',
                    'canceled': '#333333',
                    // Normalize keys to lowercase for reliable matching
                    ...Object.keys(currentMappings).reduce((acc, k) => ({
                        ...acc,
                        [k.toLowerCase()]: currentMappings[k]
                    }), {})
                };
                console.log('[Import] Effective Color Map:', standardStatusColorMap);

                // --- 1. Parse Updates Map ---
                const updatesMap: Record<string, any[]> = {};
                const updatesSheet = workbook.SheetNames.find(n => {
                    const low = n.toLowerCase();
                    return low.includes('update') || low.includes('อัพเดท') || low.includes('อัปเดต') || low.includes('record');
                });
                if (updatesSheet) {
                    // raw:false → dates come back as their displayed text (incl. time-of-day),
                    // so parseUpdateDateTime can preserve the exact timestamp instead of a serial.
                    const uRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[updatesSheet], { header: 1, raw: false });
                    
                    // 🔍 Robust Header Detection for Updates Sheet
                    let uHeaderRowIdx = uRows.findIndex(r => Array.isArray(r) && r.some(c => {
                        const s = String(c || '').toLowerCase();
                        return s.includes('user') || s.includes('created at') || s.includes('update content');
                    }));
                    if (uHeaderRowIdx === -1) uHeaderRowIdx = 0; // Fallback to first row

                    const uHeader: string[] = (uRows[uHeaderRowIdx] || []).map((h: any) => String(h || '').toLowerCase().trim());
                    
                    const colIdx = {
                        itemId: uHeader.findIndex((h: string) => h === 'item id' || h === 'id' || h.includes('id')) !== -1
                            ? uHeader.findIndex((h: string) => h === 'item id' || h === 'id' || h.includes('id'))
                            : 0,
                        user: uHeader.indexOf('user') !== -1 ? uHeader.indexOf('user') : 4,
                        createdAt: uHeader.indexOf('created at') !== -1 ? uHeader.indexOf('created at') : 5,
                        content: uHeader.findIndex((h: string) => h.includes('update content') || h === 'content') !== -1
                            ? uHeader.findIndex((h: string) => h.includes('update content') || h === 'content')
                            : 6,
                        postId: uHeader.indexOf('post id') !== -1 ? uHeader.indexOf('post id') : 7,
                        parentId: uHeader.indexOf('parent post id') !== -1 ? uHeader.indexOf('parent post id') : 8
                    };

                    // ⚠️ Monday.com exports sometimes repeat the "Content Type" header across two columns —
                    // "Update" lands in the first one, "Reply" lands in the second. Collect all matching
                    // column indices and read whichever one is non-empty for a given row.
                    const contentTypeIndices = uHeader.reduce<number[]>((acc, h, idx) => {
                        if (h === 'content type') acc.push(idx);
                        return acc;
                    }, []);
                    if (contentTypeIndices.length === 0) contentTypeIndices.push(3);

                    const normalizeId = (id: any): string => {
                        let s = String(id || '').trim();
                        if (s.endsWith('.0')) s = s.substring(0, s.length - 2);
                        return s;
                    };

                    uRows.forEach((uRow, uIdx) => {
                        if (uIdx <= uHeaderRowIdx) return;
                        const itemId = normalizeId(uRow[colIdx.itemId]);
                        if (!itemId) return;
                        if (!updatesMap[itemId]) updatesMap[itemId] = [];
                        
                        const createdAtRaw = uRow[colIdx.createdAt];
                        // Monday's "Created At" export column is stored in UTC and is 7 hours behind
                        // the actual local (Asia/Bangkok, UTC+7) time of the update, so shift it
                        // forward by 7 hours after parsing.
                        const dateObj = new Date(parseUpdateDateTime(createdAtRaw).getTime() + 7 * 60 * 60 * 1000);

                        const content = richifyUpdateContent(String(uRow[colIdx.content] || '').trim());

                        const contentTypeRaw = contentTypeIndices
                            .map(idx => String(uRow[idx] || '').trim())
                            .find(v => v !== '') || 'Update';

                        updatesMap[itemId].push({
                            id: Math.random().toString(36).substring(7),
                            author: String(uRow[colIdx.user] || 'System'),
                            createdAt: dateObj.toISOString(),
                            content: content,
                            contentType: contentTypeRaw,
                            postId: String(uRow[colIdx.postId] || ''),
                            parentId: String(uRow[colIdx.parentId] || '')
                        });
                    });
                    
                    // 🧹 Deduplicate updates per item — re-imports and Monday exports can repeat the
                    // same post, sometimes as near-identical copies that differ only in length. Treat
                    // updates as the same when they share author + timestamp + the first 50 chars of
                    // their plain-text content, and keep the longest (most complete) version.
                    const plainTextOf = (html: any): string =>
                        String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
                    const minuteKeyOf = (createdAt: any): string => {
                        const d = new Date(createdAt);
                        if (isNaN(d.getTime())) return String(createdAt || '');
                        return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
                    };
                    const dedupeKeyOf = (u: any): string =>
                        `${u.author}::${minuteKeyOf(u.createdAt)}::${plainTextOf(u.content).slice(0, 50)}`;
                    Object.keys(updatesMap).forEach(itemId => {
                        const list = updatesMap[itemId];
                        const bestByKey = new Map<string, any>();
                        for (const u of list) {
                            const k = dedupeKeyOf(u);
                            const existing = bestByKey.get(k);
                            if (!existing || plainTextOf(u.content).length > plainTextOf(existing.content).length) {
                                bestByKey.set(k, u);
                            }
                        }
                        const seen = new Set<string>();
                        const result: any[] = [];
                        for (const u of list) {
                            const k = dedupeKeyOf(u);
                            if (seen.has(k)) continue;
                            seen.add(k);
                            result.push(bestByKey.get(k));
                        }
                        updatesMap[itemId] = result;
                    });

                    // 🕒 Sort updates by date descending (latest first)
                    Object.keys(updatesMap).forEach(itemId => {
                        updatesMap[itemId].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    });
                }

                // --- 2. Iterate Data Sheets ---
                const filePreviews: any[] = [];
                workbook.SheetNames.forEach((sheetName) => {
                    if (sheetName.toLowerCase().includes('update')) return;

                    const worksheet = workbook.Sheets[sheetName];
                    const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
                    if (rows.length < 3) return;

                    // --- Detect colored text in column A for Group Names ---
                    // Build a map of row indices where column A has colored font
                    const coloredGroupRows: Map<number, string> = new Map();
                    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
                    for (let r = range.s.r; r <= range.e.r; r++) {
                        const ref = XLSX.utils.encode_cell({ r, c: 0 });
                        const color = getCellFontColor(worksheet, ref);
                        if (color) coloredGroupRows.set(r, color);
                    }

                    // Heuristic No Description Detection:
                    // 1. If A2 (idx 1) has colored text (Requires Pro XLSX, fallback to heuristic)
                    // 2. If row 1 has a single value, row 2 is the header, and row 1 text is short (< 30 chars)
                    const headerRowIdx = rows.findIndex(r => Array.isArray(r) && r.some((c: any) => {
                        const s = String(c).toLowerCase();
                        return s === 'status' || s === 'champion' || s === 'owner' || s === 'person' || s === 'subitems';
                    }));

                    // 🔗 Monday.com export marker: column C on the first-group row always reads
                    // "Try it free →". This is more reliable than font-color detection (which can
                    // silently fail), so use it to pin down the exact row that holds the first group name.
                    const normalizeMark = (s: any) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
                    const tryFreeRowIdx = rows.findIndex((r, idx) =>
                        idx < 5 && Array.isArray(r) && normalizeMark(r[2]).includes('tryitfree')
                    );

                    const row1Values = rows[1]?.filter((v: any) => v !== undefined && v !== '');
                    const hasNoDescription = tryFreeRowIdx !== -1
                        ? tryFreeRowIdx <= 1
                        : (coloredGroupRows.has(1) ||
                           (row1Values?.length === 1 && headerRowIdx === 2 && String(row1Values[0]).length < 40));

                    // Row 1 (between the title and the first group) holds the board description, when present
                    const boardDescription = !hasNoDescription ? String(rows[1]?.[0] || '').trim() : '';

                    const palette = ['#579bfc', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#333333'];

                    let dynamicColumns: any[] = [];
                    let itemIdIdx = -1;
                    
                    if (headerRowIdx !== -1) {
                        const h = rows[headerRowIdx].map((c: any) => String(c || '').trim());
                        const hLower = h.map((s: string) => s.toLowerCase());
                        const handledIndices = new Set<number>();

                        // 1. Find System column: Item ID
                        itemIdIdx = hLower.findIndex((c: string) => c.includes('item id') || c === 'id' || c.startsWith('item id') || c.endsWith('id'));
                        if (itemIdIdx !== -1) handledIndices.add(itemIdIdx);

                        // 2. Process all columns in original order
                        h.forEach((headerText: string, idx: number) => {
                            if (!headerText || handledIndices.has(idx)) return;
                            const text = headerText.toLowerCase();

                            // Skip system internal markers
                            if (text === 'name' || text === 'item' || text === 'subitems') return;

                            // --- A. Timeline Pairing (Merge if found) ---
                            const isStart = text.includes('timeline') && (text.includes('start') || text.includes('เริ่ม'));
                            if (isStart) {
                                // Greedily find the VERY NEXT "End" column that hasn't been handled yet and has 'timeline'
                                const endIdx = hLower.findIndex((endText: string, j: number) => 
                                    j > idx && 
                                    !handledIndices.has(j) &&
                                    endText.includes('timeline') && 
                                    (endText.includes('end') || endText.includes('finish') || endText.includes('จบ'))
                                );

                                if (endIdx !== -1) {
                                    // Pair them up! 
                                    const pairTitle = h[idx].replace(/-\s*start|start|เริ่ม/gi, '').trim() || 'Timeline';
                                    dynamicColumns.push({ 
                                        title: pairTitle, 
                                        type: 'timeline', 
                                        originalIndices: [idx, endIdx] 
                                    });
                                    handledIndices.add(idx);
                                    handledIndices.add(endIdx);
                                    return;
                                }
                            }

                            // --- B. Map Other Types ---
                            let colType = 'text';
                            if (text.includes('status') || text.includes('complete') || text.includes('approved') || text.includes('sent')) {
                                colType = 'status';
                            } else if (text === 'dropdown' || text.includes('dropdown')) {
                                colType = 'dropdown';
                            } else if (text === 'checkbox' || text.includes('checkbox')) {
                                colType = 'checkbox';
                            } else if (text.includes('file') || text.includes('quote')) {
                                colType = 'files';
                            } else if (text.includes('cost') || text.includes('budget') || text.includes('number') || text.includes('amount')) {
                                colType = 'number';
                            } else if (text === 'date' || text.includes(' date')) {
                                colType = 'date';
                            } else if (text.includes('timeline')) {
                                colType = 'timeline';
                            }

                            const colDef: any = { title: headerText, type: colType, originalIndex: idx, subIndex: idx, options: [] };
                            dynamicColumns.push(colDef);
                            handledIndices.add(idx);
                        });
                    }

                    // Fallback generating 'columns' variable for downstream use
                    const columns = dynamicColumns;

                    const groups: any[] = [];
                    let currentGroup: any = null;
                    let currentMainItem: any = null;
                    let isInsideSubitems = false;

                    let groupCount = 0;

                    rows.forEach((row, rIdx) => {
                        // 1. Skip system rows
                        if (hasNoDescription) {
                            if (rIdx < 1) return; // skip only title
                        } else {
                            if (rIdx < 2) return; // skip title + description
                        }

                        const firstVal = row[0]?.toString().trim();
                        const secondVal = row[1]?.toString().trim();

                        // 2. Skip Header Row (must be done before group detection)
                        if (headerRowIdx !== -1 && rIdx === headerRowIdx) return;

                        // Pre-compute group name candidate: handle col A empty OR col A = numeric ID
                        const isFirstNumericId = itemIdIdx === 0 && /^\d+$/.test(String(firstVal || ''));
                        // Group name lives in col A normally, or col B when col A is empty/numeric-ID
                        const groupNameCandidate = (!firstVal || isFirstNumericId) && secondVal ? secondVal : (firstVal || '');

                        // 2.5 "Try it free" marker row = definitive first-group row (overrides color/fallback detection)
                        if (tryFreeRowIdx !== -1 && rIdx === tryFreeRowIdx) {
                            const groupColor = coloredGroupRows.get(rIdx) || palette[groupCount % palette.length];
                            currentGroup = { title: groupNameCandidate || 'Group 1', color: groupColor, items: [] };
                            groups.push(currentGroup);
                            groupCount++;
                            currentMainItem = null;
                            isInsideSubitems = false;
                            return;
                        }

                        // 3. Handle 'Subitems' or 'Name' header rows
                        // 🧠 Skip any row that looks like a header (starting with Name, Item, or Subitems)
                        const isHeaderRow = firstVal === 'Subitems' || firstVal === 'Name' || firstVal === 'Item' || firstVal === 'หัวข้อ';

                        if (isHeaderRow) {
                            if (firstVal === 'Subitems') {
                                isInsideSubitems = true;
                                
                                // 🔍 RESCAN FOR SUBITEM HEADERS
                                const subHeaders = row.map((c: any) => String(c || '').trim());
                                
                                subHeaders.forEach((sh: string, shIdx: number) => {
                                    if (!sh || sh.toLowerCase() === 'subitems') return;
                                    const shLower = sh.toLowerCase();
                                    if (shLower === 'name' || shLower === 'item') return;
                                    
                                    // Find existing column by title
                                    let col = dynamicColumns.find(c => c.title.toLowerCase() === shLower);
                                    
                                    if (col) {
                                        col.subIndex = shIdx;
                                    } else {
                                        // Check for Timeline Start in sub-row
                                        const isSTimeline = shLower.includes('timeline') && (shLower.includes('start') || shLower.includes('เริ่ม'));
                                        if (isSTimeline) {
                                            const eIdx = subHeaders.findIndex((et: string, j: number) => 
                                                j > shIdx && et.toLowerCase().includes('timeline') && 
                                                (et.toLowerCase().includes('end') || et.toLowerCase().includes('จบ'))
                                            );
                                            if (eIdx !== -1) {
                                                const pTitle = sh.replace(/-\s*start|start|เริ่ม/gi, '').trim() || 'Timeline';
                                                let tCol = dynamicColumns.find(cc => cc.title.toLowerCase() === pTitle.toLowerCase());
                                                if (tCol) {
                                                    tCol.subIndices = [shIdx, eIdx];
                                                } else {
                                                    dynamicColumns.push({ title: pTitle, type: 'timeline', subIndices: [shIdx, eIdx], originalIndices: [-1, -1] });
                                                }
                                                return;
                                            }
                                        }
                                        
                                        // Create NEW column for subitems
                                        let cType = 'text';
                                        if (shLower.includes('status') || shLower.includes('complete')) cType = 'status';
                                        else if (shLower.includes('dropdown')) cType = 'dropdown';
                                        else if (shLower.includes('checkbox')) cType = 'checkbox';
                                        else if (shLower.includes('file')) cType = 'files';
                                        // person/owner/responsible from Monday → text (stores names, not Saturday user IDs)
                                        else if (shLower.includes('cost') || shLower.includes('budget') || shLower.includes('number')) cType = 'number';
                                        else if (shLower === 'date') cType = 'date';
                                        
                                        const newCol: any = { title: sh, type: cType, subIndex: shIdx, originalIndex: -1, options: [] };
                                        dynamicColumns.push(newCol);
                                    }
                                });
                            }
                            return;
                        }

                        // 4. Colored text group detection (Exclude common header words)
                        const commonHeaders = ['name', 'item', 'subitems', 'status', 'champion', 'timeline'];
                        if (coloredGroupRows.has(rIdx) && groupNameCandidate && !commonHeaders.includes(groupNameCandidate.toLowerCase())) {
                            const groupColor = coloredGroupRows.get(rIdx) || '#579bfc';
                            currentGroup = { title: groupNameCandidate, color: groupColor, items: [] };
                            groups.push(currentGroup);
                            currentMainItem = null;
                            isInsideSubitems = false;
                            return;
                        }

                        // 5. Fallback: text-pattern group detection
                        // Allow index 1 if we've determined there's no description
                        const isPotentialGroupRow = hasNoDescription ? rIdx >= 1 : rIdx > 1;
                        const nonEmptyVals = row.filter((v: any) => v !== undefined && v !== '');
                        // Group row: exactly 1 value anywhere, OR col A = numeric ID + col B = name (Monday.com format)
                        const isGroupLikeRow = nonEmptyVals.length === 1 ||
                            (nonEmptyVals.length === 2 && isFirstNumericId && !!secondVal);
                        if (groupNameCandidate && !commonHeaders.includes(groupNameCandidate.toLowerCase()) &&
                            (groupNameCandidate.startsWith('Priority') || (isPotentialGroupRow && isGroupLikeRow))) {
                            let groupColor = palette[groupCount % palette.length];

                            const lowVal = groupNameCandidate.toLowerCase();
                            
                            // 🌈 Smart Keyword-to-Color Mapping (Narai Standard)
                            if (lowVal.match(/priority\s*1|urgent|critical|hot|emergency|failed|error|asap|high|risk|issue/)) {
                                groupColor = '#e2445c'; // Red
                            } else if (lowVal.match(/priority\s*2|working|progress|pending|review|medium|warning|draft|dev/)) {
                                groupColor = '#fdab3d'; // Orange
                            } else if (lowVal.match(/priority\s*3|done|complete|success|archive|finance|budget|payment|paid|billing|approved|final|low/)) {
                                groupColor = '#00c875'; // Green
                            } else if (lowVal.match(/mews|pms|sync|system|it|infra|network|db|sql|backlog|idea|plan|strategy|integration|api/)) {
                                groupColor = '#579bfc'; // Blue
                            } else if (lowVal.match(/design|ui|ux|frontend|marketing|brand|content|social|creative|artwork|figma|research/)) {
                                groupColor = '#a25ddc'; // Purple
                            } else if (lowVal.match(/legal|compliance|audit|security|standard|doc|policy|contract|agreement/)) {
                                groupColor = '#ffcb00'; // Yellow
                            } else if (lowVal.match(/hr|people|culture|career|recruit|train|welfare|meeting/)) {
                                groupColor = '#ff642c'; // Pink/Light Red
                            } else if (lowVal.match(/vendor|outsource|hardware|maintenance|external|legacy/)) {
                                groupColor = '#333333'; // Black
                            }
                            
                            currentGroup = { title: groupNameCandidate, color: groupColor, items: [] };
                            groups.push(currentGroup);
                            groupCount++;
                            currentMainItem = null;
                            isInsideSubitems = false;
                            return;
                        }

                        if (!firstVal && !secondVal) return;

                        if (!currentGroup) {
                            currentGroup = { title: sheetName, color: palette[groupCount % palette.length], items: [] };
                            groups.push(currentGroup);
                            groupCount++;
                        }

                        const itemValues: Record<string, any> = {};
                        dynamicColumns.forEach((c: any) => {
                            const dataIdx = isInsideSubitems ? (c.subIndex !== undefined ? c.subIndex : -1) : c.originalIndex;
                            
                            if (c.type === 'timeline') {
                                let sIdx = -1;
                                let eIdx = -1;
                                
                                if (isInsideSubitems) {
                                    if (c.subIndices) {
                                        [sIdx, eIdx] = c.subIndices;
                                        // 🧠 Greedy Timeline Shift (+1): Handle case where data is shifted relative to header
                                        if (!row[sIdx] && !row[eIdx] && (row[sIdx + 1] || row[eIdx + 1])) {
                                            sIdx++; eIdx++;
                                        }
                                    } else if (c.subIndex !== undefined) {
                                        sIdx = c.subIndex; eIdx = c.subIndex;
                                        if (!row[sIdx] && row[sIdx + 1]) sIdx++; eIdx++;
                                    }
                                } else {
                                    if (c.originalIndices) {
                                        [sIdx, eIdx] = c.originalIndices;
                                    } else if (c.originalIndex !== undefined) {
                                        sIdx = c.originalIndex; eIdx = c.originalIndex;
                                    }
                                }
                                
                                if (sIdx !== -1) {
                                    const sd = parseDate(row[sIdx]);
                                    const ed = parseDate(row[eIdx !== -1 ? eIdx : sIdx]);
                                    if (sd || ed) itemValues[c.title] = { from: sd, to: ed || sd };
                                }
                            } else if (dataIdx !== -1) {
                                let rawVal = row[dataIdx];
                                
                                // 🧠 Greedy Fallback: If empty, check neighbors (+/- 1), alternate indices, or ALL columns for status
                                if (!rawVal || rawVal.toString().trim() === '') {
                                    if (c.type === 'status') {
                                        // 🕵️‍♂️ Try alternate index first (e.g. use subIndex for main item if originalIndex is empty)
                                        const altIdx = isInsideSubitems ? c.originalIndex : c.subIndex;
                                        if (altIdx !== -1 && row[altIdx] && row[altIdx].toString().trim() !== '') {
                                            rawVal = row[altIdx];
                                        } else {
                                            // 🕵️‍♂️ Greedy Status Recovery: Search the whole row for known status labels
                                            const knownLabels = Object.keys(standardStatusColorMap);
                                            for (let i = 0; i < row.length; i++) {
                                                const cellVal = String(row[i] || '').trim().toLowerCase();
                                                if (cellVal && knownLabels.includes(cellVal)) {
                                                    console.log(`[Import] Greedy Recovery: Row ${rIdx} Status was empty, found "${row[i]}" at Col ${i}`);
                                                    rawVal = row[i];
                                                    break;
                                                }
                                            }
                                        }
                                    } else if (isInsideSubitems) {
                                        // Standard neighbor check for other types in sub-items
                                        const neighbors = [dataIdx + 1, dataIdx - 1];
                                        for (const nIdx of neighbors) {
                                            if (nIdx >= 0 && row[nIdx]) {
                                                const nVal = row[nIdx];
                                                if (c.type === 'date' && parseDate(nVal)) {
                                                    rawVal = nVal; break;
                                                }
                                            }
                                        }
                                    }
                                }

                                if (c.type === 'files') {
                                    itemValues[c.title] = parseFiles(rawVal);
                                } else if (c.type === 'date') {
                                    itemValues[c.title] = parseDate(rawVal) || '';
                                } else if (isInsideSubitems && c.type === 'status') {
                                    // Hybrid mapping trick
                                    const possibleDate = parseDate(rawVal);
                                    itemValues[c.title] = possibleDate || rawVal || '';
                                } else if (c.type === 'dropdown') {
                                    // Multi-select: split comma-separated labels into an array
                                    itemValues[c.title] = String(rawVal || '')
                                        .split(',').map(v => v.trim()).filter(Boolean);
                                } else if (c.type === 'checkbox') {
                                    const v = String(rawVal || '').trim().toLowerCase();
                                    itemValues[c.title] = ['v', 'x', 'yes', 'true', '1', 'checked', '✓', '✔'].includes(v);
                                } else {
                                    itemValues[c.title] = rawVal?.toString() || '';
                                }
                            }
                        });
                        
                        const normalizeId = (id: any): string => {
                            let s = String(id || '').trim();
                            if (s.endsWith('.0')) s = s.substring(0, s.length - 2);
                            return s;
                        };
                        const actualItemId = itemIdIdx !== -1 ? normalizeId(row[itemIdIdx]) : normalizeId(row[24]);

                        // 🧠 Sub-item Association Logic
                        // A row is sub-item if we've seen a 'Subitems' header AND the first column is empty
                        const isSubRow = isInsideSubitems && (!firstVal || firstVal === '');
                        
                        // 🔄 CRITICAL FIX: Reset sub-item flag if we encounter a MAIN item row (non-empty first column)
                        if (firstVal && isInsideSubitems) {
                            console.log(`[Import] Row ${rIdx}: Non-empty first column "${firstVal}". Resetting isInsideSubitems to false.`);
                            isInsideSubitems = false;
                        }

                        const itemData = {
                            title: (isSubRow && secondVal) ? secondVal : (firstVal || secondVal || 'Missing Title'),
                            values: itemValues,
                            updates: updatesMap[actualItemId] || [],
                            subitems: []
                        };

                        if (isSubRow && currentMainItem) {
                            console.log(`[Import] Row ${rIdx}: Adding as sub-item to "${currentMainItem.title}"`);
                            currentMainItem.subitems.push(itemData);
                        } else {
                            // If firstVal exists, it's a MAIN item (Hotel/Project)
                            console.log(`[Import] Row ${rIdx}: Adding as main item "${itemData.title}"`);
                            currentMainItem = itemData;
                            currentGroup.items.push(currentMainItem);
                        }
                    });


                    dynamicColumns.forEach(c => {
                        if (c.type === 'status') {
                            const optionsMap: Record<string, string> = {};
                            
                            // Initialize with default Grey
                            optionsMap['Default'] = '#c4c4c4';
                            
                            rows.forEach((row, rIdx) => {
                                const dIdx = c.originalIndex !== -1 ? c.originalIndex : c.subIndex;
                                if (dIdx === -1 || dIdx === undefined) return;
                                
                                const val = String(row[dIdx] || '').trim();
                                if (!val || val.toLowerCase() === 'subitems' || val.toLowerCase() === 'name' || val.toLowerCase() === 'item') return;
                                
                                if (!optionsMap[val]) {
                                    // 1. Check Standard Map first
                                    const standardColor = standardStatusColorMap[val.toLowerCase()];
                                    if (standardColor) {
                                        optionsMap[val] = standardColor;
                                    } else {
                                        // 2. Try to extract color from Excel
                                        const ref = XLSX.utils.encode_cell({ r: rIdx, c: dIdx });
                                        const excelColor = getCellBgColor(worksheet, ref);
                                        // 3. Fallback to Black (#333333) as requested
                                        optionsMap[val] = excelColor || '#333333';
                                    }
                                }
                            });
                            
                            c.options = Object.entries(optionsMap).map(([label, color]) => ({
                                id: label === 'Default' ? 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4' : Math.random().toString(36).substring(7),
                                label,
                                color
                            }));
                        } else if (c.type === 'dropdown') {
                            // Dropdown cells can hold multiple comma-separated labels (Monday multi-select export)
                            const dropdownPalette = ['#579bfc', '#a25ddc', '#00c875', '#fdab3d', '#e2445c', '#66ccff', '#9d50dd', '#037f4c'];
                            const labels = new Set<string>();

                            rows.forEach(row => {
                                const dIdx = c.originalIndex !== -1 ? c.originalIndex : c.subIndex;
                                if (dIdx === -1 || dIdx === undefined) return;

                                const val = String(row[dIdx] || '').trim();
                                if (!val || val.toLowerCase() === 'subitems' || val.toLowerCase() === 'name' || val.toLowerCase() === 'item') return;

                                val.split(',').map(v => v.trim()).filter(Boolean).forEach(v => labels.add(v));
                            });

                            c.options = Array.from(labels).map((label, idx) => ({
                                id: Math.random().toString(36).substring(7),
                                label,
                                color: dropdownPalette[idx % dropdownPalette.length]
                            }));
                        }
                    });

                    const totalItems = groups.reduce((acc: number, g: any) => acc + (g.items?.length || 0), 0);
                    if (totalItems === 0) {
                        setParseWarnings((prev: string[]) => [...prev, `"${sheetName}" in ${file.name}: 0 items detected — check if header row contains 'Status' or 'Champion'`]);
                    }

                    filePreviews.push({
                        id: `${file.name}-${sheetName}`,
                        fileName: file.name,
                        title: sheetName,
                        description: boardDescription,
                        groups,
                        columns,
                        updatesMap
                    });
                });

                setPreviews((prev: any[]) => [...prev, ...filePreviews]);
                setSelectedSheetIds((prev: string[]) => [...prev, ...filePreviews.map((p: any) => p.id)]);
                setIsParsing(false);
            };
            reader.readAsArrayBuffer(file);
        } catch (err: any) {
            console.error(err);
            setImportError(`Failed to parse "${file.name}": ${err.message || 'Unknown error'}`);
            setIsParsing(false);
        }
    };

    const handleImport = async () => {
        if (previews.length === 0) return;
        setIsImporting(true);
        let totalItems = 0;
        let totalUpdates = 0;
        let boardCount = 0;

        try {
            const selectedPreviews = previews.filter(p => selectedSheetIds.includes(p.id));

            // Each selected sheet creates its own new board
            for (const preview of selectedPreviews) {
                await importExcelBoard({
                    title: preview.title,
                    description: preview.description,
                    groups: preview.groups,
                    columns: preview.columns
                });
                boardCount++;
                preview.groups.forEach((g: any) => {
                    totalItems += g.items.length;
                    g.items.forEach((item: any) => { totalUpdates += (item.updates?.length || 0); });
                });
            }

            setImportResults({ boards: boardCount, items: totalItems, updates: totalUpdates });
            setIsSuccess(true);
            showToast('Import completed successfully', 'success');
        } catch (err: any) {
            console.error(err);
            setImportError(`Import failed: ${err.message || 'Unknown error. Please check the file format and try again.'}`);
            showToast(err.message || 'Import failed.', 'error');
        } finally {
            setIsImporting(false);
        }
    };

    const SuccessPopup = () => isSuccess ? (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 2000,
            backdropFilter: 'blur(4px)', animation: 'fadeIn 0.3s ease'
        }}>
            <div style={{
                backgroundColor: 'white', width: '480px', maxWidth: '90vw',
                borderRadius: '0px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                overflow: 'hidden', animation: 'fadeIn 0.4s ease'
            }}>
                <div style={{
                    padding: '32px 24px', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', textAlign: 'center', gap: '20px'
                }}>
                    <div style={{
                        width: '72px', height: '72px', borderRadius: '50%',
                        backgroundColor: '#ecfdf5', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 0 8px rgba(16, 185, 129, 0.1)'
                    }}>
                        <CheckCircle2 size={40} color="#10b981" />
                    </div>
                    <div>
                        <h3 style={{ 
                            margin: '0 0 8px 0', fontSize: '22px', fontWeight: 800, 
                            color: '#111827', fontFamily: "'Nib Pro', 'Georgia', serif",
                            letterSpacing: '-0.01em'
                        }}>
                            Import Successful!
                        </h3>
                        <p style={{ color: '#6b7280', fontSize: '15px', margin: 0, lineHeight: '1.5' }}>
                            Successfully imported <strong style={{ color: '#111827' }}>{importResults?.boards} board{(importResults?.boards || 0) > 1 ? 's' : ''}</strong> with <strong style={{ color: '#111827' }}>{importResults?.items} item{(importResults?.items || 0) > 1 ? 's' : ''}</strong> and <strong style={{ color: '#111827' }}>{importResults?.updates} update{(importResults?.updates || 0) !== 1 ? 's' : ''}</strong>.
                        </p>
                    </div>
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px',
                        width: '100%', padding: '16px', backgroundColor: '#f0fdf4',
                        border: '1px solid #bbf7d0', borderRadius: '0px'
                    }}>
                        <div>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: '#065f46' }}>{importResults?.boards}</div>
                            <div style={{ fontSize: '11px', color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Boards</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: '#065f46' }}>{importResults?.items}</div>
                            <div style={{ fontSize: '11px', color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Items</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: '#065f46' }}>{importResults?.updates}</div>
                            <div style={{ fontSize: '11px', color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Updates</div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            width: '100%', padding: '14px', backgroundColor: '#065f46', color: 'white',
                            border: 'none', borderRadius: '0px', fontWeight: 700, fontSize: '15px',
                            cursor: 'pointer', letterSpacing: '0.02em',
                            transition: 'background-color 0.2s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#047857')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#065f46')}
                    >
                        Done — Close
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    const ErrorPopup = () => importError ? (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 2000,
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                backgroundColor: 'white', width: '480px', maxWidth: '90vw',
                borderRadius: '0px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                overflow: 'hidden'
            }}>
                <div style={{ padding: '24px 24px 0 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <AlertCircle size={24} color="#dc2626" />
                    </div>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#111827', fontFamily: 'serif' }}>Import Error</h3>
                </div>
                <div style={{ padding: '16px 24px 24px 24px' }}>
                    <p style={{ color: '#4b5563', fontSize: '14px', lineHeight: '1.6', margin: '0 0 20px 0', wordBreak: 'break-word' }}>{importError}</p>
                    <button
                        onClick={() => setImportError(null)}
                        style={{
                            width: '100%', padding: '12px', backgroundColor: '#1a1728', color: 'white',
                            border: 'none', borderRadius: '0px', fontWeight: 600, fontSize: '14px',
                            cursor: 'pointer'
                        }}
                    >
                        Understood
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    const WarningBanner = () => parseWarnings.length > 0 ? (
        <div style={{
            margin: '0 0 12px 0', padding: '12px 16px', backgroundColor: '#fffbeb',
            border: '1px solid #fbbf24', borderRadius: '0px', fontSize: '13px', color: '#92400e'
        }}>
            <div style={{ fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={14} /> Parse Warnings
            </div>
            {parseWarnings.map((w, i) => <div key={i} style={{ marginTop: '4px' }}>• {w}</div>)}
        </div>
    ) : null;

    return (
        <>
        <SuccessPopup />
        <ErrorPopup />
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(26, 23, 40, 0.8)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                backgroundColor: 'white', width: '900px', maxWidth: '95vw',
                maxHeight: '90vh', display: 'flex', flexDirection: 'column',
                borderRadius: '0px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                border: '1px solid #eee', overflow: 'hidden', position: 'relative'
            }}>
                    <>
                        <div style={{
                            padding: '24px', borderBottom: '1px solid #f1f5f9',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ 
                                    width: '44px', height: '44px', borderRadius: '0px', 
                                    backgroundColor: 'hsl(var(--color-brand-primary) / 0.08)', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                    color: 'hsl(var(--color-brand-primary))',
                                    border: '1px solid hsl(var(--color-brand-primary) / 0.15)'
                                }}>
                                    <Layers size={22} />
                                </div>
                                <div>
                                    <h2 style={{ 
                                        margin: 0, fontSize: '18px', fontWeight: 600, 
                                        color: '#1e293b'
                                    }}>Multi-File Project Import</h2>
                                    <p style={{ 
                                        margin: 0, fontSize: '13px', color: '#64748b'
                                    }}>Import multiple files and sheets as concurrent boards</p>
                                </div>
                            </div>
                            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                        </div>

                        <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                            {files.length === 0 ? (
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        height: '280px', border: '2px dashed #e2e8f0', borderRadius: '0px',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', transition: 'all 0.2s ease', backgroundColor: '#f8fafc'
                                    }}
                                >
                                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx" multiple style={{ display: 'none' }} />
                                    <div style={{ width: '56px', height: '56px', borderRadius: '0px', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', marginBottom: '16px' }}>
                                        <Upload size={28} color="#2563eb" />
                                    </div>
                                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>Select Excel files to import</span>
                                    <span style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>You can select multiple files at once</span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Selected Files & Previews</h3>
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <Plus size={14} /> Add More Files
                                        </button>
                                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx" multiple style={{ display: 'none' }} />
                                    </div>

                                    {isParsing && previews.length === 0 ? (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '12px' }}>
                                            <Loader2 className="animate-spin" size={24} color="#2563eb" />
                                            <span style={{ fontSize: '15px', color: '#64748b' }}>Parsing Excel workbooks...</span>
                                        </div>
                                    ) : (
                                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                                            <WarningBanner />
                                            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                                                Detected <strong>{previews.length}</strong> possible boards across <strong>{files.length}</strong> files.
                                            </p>
                                            
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '12px', maxHeight: '300px', overflowY: 'auto', padding: '4px' }}>
                                                {previews.map((sheet) => (
                                                    <div 
                                                        key={sheet.id}
                                                        onClick={() => {
                                                            setSelectedSheetIds(prev => 
                                                                prev.includes(sheet.id) 
                                                                    ? prev.filter(id => id !== sheet.id)
                                                                    : [...prev, sheet.id]
                                                            )
                                                        }}
                                                        style={{
                                                            padding: '16px', border: '2px solid', 
                                                            borderColor: selectedSheetIds.includes(sheet.id) ? '#2563eb' : '#f1f5f9',
                                                            backgroundColor: selectedSheetIds.includes(sheet.id) ? '#f0f9ff' : 'white',
                                                            borderRadius: '0px', cursor: 'pointer', transition: 'all 0.2s',
                                                            display: 'flex', alignItems: 'center', gap: '12px'
                                                        }}
                                                    >
                                                        <input type="checkbox" checked={selectedSheetIds.includes(sheet.id)} readOnly style={{ accentColor: '#2563eb', width: '18px', height: '18px' }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '2px' }}>{sheet.title}</div>
                                                            <div style={{ fontSize: '11px', color: '#64748b' }}>File: {sheet.fileName}</div>
                                                            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{sheet.groups.reduce((acc: number, g: any) => acc + g.items.length, 0)} Items found</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {selectedSheetIds.length > 0 && (
                                                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '0px', backgroundColor: 'white' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#666', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px' }}>Import Statistics</div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                                                        <div>
                                                            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1728' }}>{selectedSheetIds.length}</div>
                                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>BOARDS</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1728' }}>
                                                                {previews.filter(p => selectedSheetIds.includes(p.id)).reduce((acc, p) => acc + p.groups.length, 0)}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>GROUPS</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1728' }}>
                                                                {previews.filter(p => selectedSheetIds.includes(p.id)).reduce((acc, p) => acc + p.groups.reduce((gAcc: number, g: any) => gAcc + g.items.length, 0), 0)}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>ITEMS</div>
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1728' }}>
                                                                {previews.filter(p => selectedSheetIds.includes(p.id)).reduce((acc, p) => {
                                                                    let count = 0;
                                                                    p.groups.forEach((g: any) => g.items.forEach((i: any) => count += (i.updates?.length || 0)));
                                                                    return acc + count;
                                                                }, 0)}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>UPDATES</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '20px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '12px', backgroundColor: '#f8fafc' }}>
                            <button 
                                onClick={onClose}
                                disabled={isImporting}
                                style={{ padding: '10px 20px', borderRadius: '0px', border: '1px solid #e2e8f0', background: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer', color: '#64748b' }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleImport}
                                disabled={selectedSheetIds.length === 0 || isImporting}
                                style={{ 
                                    padding: '10px 28px', borderRadius: '0px', border: 'none', 
                                    background: selectedSheetIds.length > 0 ? '#1a1728' : '#94a3b8', 
                                    color: 'white', fontSize: '14px', fontWeight: 700, 
                                    cursor: selectedSheetIds.length > 0 ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', gap: '10px'
                                }}
                            >
                                {isImporting ? <Loader2 className="animate-spin" size={18} /> : <Layers size={18} />}
                                {isImporting ? `Importing ${selectedSheetIds.length} Boards...` : `Import ${selectedSheetIds.length} Boards`}
                            </button>
                        </div>
                    </>
            </div>
        </div>
        </>
    );
};
