import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, Loader2, CheckCircle2, Layers, Plus, AlertCircle } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { showToast } from '../../utils/toast';

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
    if (hex.toLowerCase() === '000000') return null; 
    return `#${hex}`;
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
    const [importResults, setImportResults] = useState<{ boards: number; items: number } | null>(null);
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
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellStyles: true });
                
                // --- 1. Parse Updates Map ---
                const updatesMap: Record<string, any[]> = {};
                const updatesSheet = workbook.SheetNames.find(n => {
                    const low = n.toLowerCase();
                    return low.includes('update') || low.includes('อัพเดท') || low.includes('อัปเดต') || low.includes('record');
                });
                if (updatesSheet) {
                    const uRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[updatesSheet], { header: 1 });
                    
                    // 🔍 Robust Header Detection for Updates Sheet
                    let uHeaderRowIdx = uRows.findIndex(r => Array.isArray(r) && r.some(c => {
                        const s = String(c || '').toLowerCase();
                        return s.includes('user') || s.includes('created at') || s.includes('update content');
                    }));
                    if (uHeaderRowIdx === -1) uHeaderRowIdx = 0; // Fallback to first row

                    const uHeader = (uRows[uHeaderRowIdx] || []).map((h: any) => String(h || '').toLowerCase().trim());
                    
                    const colIdx = {
                        itemId: uHeader.findIndex((h: string) => h === 'item id' || h === 'id' || h.includes('id')) !== -1 
                            ? uHeader.findIndex((h: string) => h === 'item id' || h === 'id' || h.includes('id')) 
                            : 0,
                        user: uHeader.indexOf('user') !== -1 ? uHeader.indexOf('user') : 4,
                        createdAt: uHeader.indexOf('created at') !== -1 ? uHeader.indexOf('created at') : 5,
                        content: uHeader.findIndex((h: string) => h.includes('update content') || h === 'content') !== -1 
                            ? uHeader.findIndex((h: string) => h.includes('update content') || h === 'content') 
                            : 6,
                        contentType: uHeader.indexOf('content type') !== -1 ? uHeader.indexOf('content type') : 3,
                        postId: uHeader.indexOf('post id') !== -1 ? uHeader.indexOf('post id') : 7,
                        parentId: uHeader.indexOf('parent post id') !== -1 ? uHeader.indexOf('parent post id') : 8
                    };

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
                        const dateVal = parseDate(createdAtRaw, true);
                        const dateObj = new Date(dateVal && !isNaN(new Date(dateVal).getTime()) ? dateVal : new Date());

                        let content = String(uRow[colIdx.content] || '').trim();
                        
                        
                        const imgRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/gi;
                        content = content.replace(imgRegex, (url) => `<img src="${url}" style="max-width: 100%; border-radius: 0px; margin-top: 10px; border: 1px solid #eee;" />`);

                        updatesMap[itemId].push({
                            id: Math.random().toString(36).substring(7),
                            author: String(uRow[colIdx.user] || 'System'),
                            createdAt: dateObj.toISOString(),
                            content: content,
                            contentType: String(uRow[colIdx.contentType] || 'Update'),
                            postId: String(uRow[colIdx.postId] || ''),
                            parentId: String(uRow[colIdx.parentId] || '')
                        });
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

                    const row1Values = rows[1]?.filter((v: any) => v !== undefined && v !== '');
                    const hasNoDescription = coloredGroupRows.has(1) || 
                                           (row1Values?.length === 1 && headerRowIdx === 2 && String(row1Values[0]).length < 40);

                    const defaultStatusOptions = [
                        { id: 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', label: 'Default', color: '#c4c4c4' },
                        { id: '00c87500-c875-c875-c875-00c87500c875', label: 'Done', color: '#00c875' },
                        { id: '00c87501-c875-c875-c875-00c87500c876', label: 'Completed', color: '#00c875' },
                        { id: 'fdab3d00-ab3d-ab3d-ab3d-fdab3d00fdab', label: 'Working on it', color: '#fdab3d' },
                        { id: 'fdab3d01-ab3d-ab3d-ab3d-fdab3d00fdac', label: 'In Progress', color: '#fdab3d' },
                        { id: 'stuck-red-id', label: 'Stuck', color: '#e2445c' },
                        { id: 'e2445c00-445c-445c-445c-e2445c00e244', label: 'Not Start', color: '#333333' },
                        { id: 'na-black-id', label: 'N/A', color: '#333333' },
                        { id: 'ffd53300-d533-d533-d533-ffd53300ffd5', label: 'Waiting', color: '#c4c4c4' },
                        { id: 'rfp-pink-id', label: 'RFP', color: '#ff158a' },
                        { id: 'onhold-gray-id', label: 'On Hold', color: '#a1a1a1' }
                    ];

                    let dynamicColumns: any[] = [];
                    let itemIdIdx = -1;
                    
                    if (headerRowIdx !== -1) {
                        const h = rows[headerRowIdx].map((c: any) => String(c || '').trim());
                        const hLower = h.map((s: string) => s.toLowerCase());
                        const handledIndices = new Set<number>();

                        // 1. Find System column: Item ID
                        itemIdIdx = hLower.findIndex((c: string) => c.includes('item id') || c === 'id' || c.startsWith('item id') || c.endsWith('id'));
                        if (itemIdIdx !== -1) handledIndices.add(itemIdIdx);

                        // 2. Identify Timeline Pairs (Robustly handle prefixes like "2022")
                        hLower.forEach((text: string, i: number) => {
                            if (handledIndices.has(i)) return;
                            
                            const isStart = text.includes('timeline') && (text.includes('start') || text.includes('เริ่ม'));
                            if (isStart) {
                                const clean = (s: string) => s.replace(/timeline|start|begin|end|finish|เริ่ม|จบ|date|[^a-z0-9]/g, '').trim();
                                const prefix = clean(text);
                                
                                const endIdx = hLower.findIndex((endText: string, j: number) => 
                                    j > i && 
                                    !handledIndices.has(j) &&
                                    endText.includes('timeline') && 
                                    (endText.includes('end') || endText.includes('finish') || endText.includes('จบ')) &&
                                    clean(endText) === prefix
                                );

                                if (endIdx !== -1) {
                                    // Found a pair! Use the prefix + "Timeline" as title or just the part without "Start"
                                    const pairTitle = h[i].replace(/-\s*start|start|เริ่ม/gi, '').trim() || 'Timeline';
                                    dynamicColumns.push({ 
                                        title: pairTitle, 
                                        type: 'timeline', 
                                        originalIndices: [i, endIdx] 
                                    });
                                    handledIndices.add(i);
                                    handledIndices.add(endIdx);
                                }
                            }
                        });

                        // 3. Process all other columns
                        h.forEach((headerText: string, idx: number) => {
                            if (!headerText || handledIndices.has(idx)) return;
                            const lowerText = headerText.toLowerCase();
                            
                            // Skip system internal markers
                            if (lowerText === 'name' || lowerText === 'item' || lowerText === 'subitems') return;

                            // Dynamic Type Inference
                            let colType = 'text';
                            if (lowerText.includes('status') || lowerText.includes('complete') || lowerText.includes('approved') || lowerText.includes('sent')) {
                                colType = 'status';
                            } else if (lowerText.includes('file') || lowerText.includes('quote')) {
                                colType = 'files';
                            } else if (lowerText.includes('cost') || lowerText.includes('budget') || lowerText.includes('number') || lowerText.includes('amount')) {
                                colType = 'number';
                            } else if (lowerText === 'date' || lowerText.includes(' date')) {
                                colType = 'date';
                            } else if (lowerText.includes('timeline')) {
                                colType = 'timeline'; // single column fallback
                            }

                            const colDef: any = { title: headerText, type: colType, originalIndex: idx };
                            if (colType === 'status') colDef.options = [...defaultStatusOptions];
                            
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

                    const palette = ['#579bfc', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#333333'];
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
                        
                        // 3. Skip 'Name' or 'Subitems' headers
                        if (firstVal === 'Name' || firstVal === 'Subitems') {
                            if (firstVal === 'Subitems') isInsideSubitems = true;
                            return;
                        }

                        // 4. Colored text group detection (Exclude common header words)
                        const commonHeaders = ['name', 'item', 'subitems', 'status', 'champion', 'timeline'];
                        if (coloredGroupRows.has(rIdx) && firstVal && !commonHeaders.includes(firstVal.toLowerCase())) {
                            const groupColor = coloredGroupRows.get(rIdx) || '#579bfc';
                            currentGroup = { title: firstVal, color: groupColor, items: [] };
                            groups.push(currentGroup);
                            currentMainItem = null;
                            isInsideSubitems = false;
                            return;
                        }
                        
                        // 5. Fallback: text-pattern group detection
                        // Allow index 1 if we've determined there's no description
                        const isPotentialGroupRow = hasNoDescription ? rIdx >= 1 : rIdx > 1;
                        if (firstVal && (firstVal.startsWith('Priority') || (isPotentialGroupRow && row.filter((v: any) => v !== undefined && v !== '').length === 1))) {
                            let groupColor = palette[groupCount % palette.length];
                            
                            const lowVal = firstVal.toLowerCase();
                            
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
                            
                            currentGroup = { title: firstVal, color: groupColor, items: [] };
                            groups.push(currentGroup);
                            groupCount++;
                            currentMainItem = null;
                            isInsideSubitems = false;
                            return;
                        }

                        if (!firstVal && !secondVal) return;

                        if (!currentGroup) {
                            currentGroup = { title: 'Imported Group', color: '#579bfc', items: [] };
                            groups.push(currentGroup);
                        }

                        const itemValues: Record<string, any> = {};
                        dynamicColumns.forEach((c: any) => {
                            if (c.type === 'timeline' && c.originalIndices) {
                                const sd = parseDate(row[c.originalIndices[0]]);
                                const ed = parseDate(row[c.originalIndices[1]]);
                                if (sd || ed) itemValues[c.title] = { from: sd, to: ed || sd };
                            } else if (c.type === 'timeline' && c.originalIndex !== undefined) {
                                // Single column timeline fallback
                                const sd = parseDate(row[c.originalIndex]);
                                if (sd) itemValues[c.title] = { from: sd, to: sd };
                            } else if (c.type === 'files') {
                                itemValues[c.title] = parseFiles(row[c.originalIndex]);
                            } else if (c.type === 'date') {
                                itemValues[c.title] = parseDate(row[c.originalIndex]) || '';
                            } else if (isInsideSubitems && c.type === 'status') {
                                // Hybrid mapping trick: If it parses as a date in subitems, keep it raw, else string
                                const rawVal = row[c.originalIndex];
                                const possibleDate = parseDate(rawVal);
                                // If it looks like exactly a date format YYYY-MM-DD or similar and is inside a hybrid field (like Budget Approved etc)
                                itemValues[c.title] = possibleDate || rawVal || '';
                            } else {
                                itemValues[c.title] = row[c.originalIndex] || '';
                            }
                        });
                        
                        const normalizeId = (id: any): string => {
                            let s = String(id || '').trim();
                            if (s.endsWith('.0')) s = s.substring(0, s.length - 2);
                            return s;
                        };
                        const actualItemId = itemIdIdx !== -1 ? normalizeId(row[itemIdIdx]) : normalizeId(row[24]);

                        const itemData = {
                            title: firstVal || secondVal || 'Missing Title',
                            values: itemValues,
                            updates: updatesMap[actualItemId] || [],
                            subitems: []
                        };

                        if (isInsideSubitems && currentMainItem && (!firstVal || firstVal === '')) {
                            currentMainItem.subitems.push(itemData);
                        } else {
                            currentMainItem = itemData;
                            currentGroup.items.push(currentMainItem);
                        }
                    });

                    const totalItems = groups.reduce((acc: number, g: any) => acc + g.items.length, 0);
                    if (totalItems === 0) {
                        setParseWarnings((prev: string[]) => [...prev, `"${sheetName}" in ${file.name}: 0 items detected — check if header row contains 'Status' or 'Champion'`]);
                    }

                    filePreviews.push({ 
                        id: `${file.name}-${sheetName}`,
                        fileName: file.name,
                        title: sheetName, 
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
        let boardCount = 0;

        try {
            for (const preview of previews) {
                if (!selectedSheetIds.includes(preview.id)) continue;
                
                await importExcelBoard(preview.title, { 
                    description: `Imported from ${preview.fileName}`,
                    groups: preview.groups, 
                    columns: preview.columns,
                    updatesMap: preview.updatesMap
                });

                boardCount++;
                preview.groups.forEach((g: any) => totalItems += g.items.length);
            }

            setImportResults({ boards: boardCount, items: totalItems });
            setIsSuccess(true);
            showToast('Multi-file import completed', 'success');
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
                            Successfully imported <strong style={{ color: '#111827' }}>{importResults?.boards} board{(importResults?.boards || 0) > 1 ? 's' : ''}</strong> with <strong style={{ color: '#111827' }}>{importResults?.items} item{(importResults?.items || 0) > 1 ? 's' : ''}</strong> across all files.
                        </p>
                    </div>
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
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
