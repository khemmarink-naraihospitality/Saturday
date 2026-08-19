import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
// xlsx is loaded lazily on-demand inside exportBoardData() to avoid bundling it at startup

export const backupService = {
    /**
     * Export a single board to JSON
     */
    exportBoard: async (boardId: string) => {
        try {
            // 1. Fetch Board Data
            const { data: board, error: boardError } = await supabase
                .from('boards')
                .select('*')
                .eq('id', boardId)
                .single();
            if (boardError) throw boardError;

            // 2. Fetch Groups, Columns, Items
            const { data: groups } = await supabase.from('groups').select('*').eq('board_id', boardId).order('position');
            const { data: columns } = await supabase.from('columns').select('*').eq('board_id', boardId).order('order');
            const { data: items } = await supabase.from('items').select('*').eq('board_id', boardId);

            // 3. Construct Backup Object
            const backupData = {
                version: '1.0',
                type: 'board_backup',
                timestamp: new Date().toISOString(),
                board,
                groups: groups || [],
                columns: columns || [],
                items: items || []
            };

            // 4. Download File
            const fileName = `board_${board.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.json`;
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Export Board Failed:', error);
            alert('Failed to export board');
        }
    },

    /**
     * Import a board from JSON
     */
    importBoard: async (file: File, targetWorkspaceId: string, currentUser: any) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const json = JSON.parse(e.target?.result as string);

                    if (json.type !== 'board_backup' || !json.board) {
                        throw new Error('Invalid backup file format');
                    }

                    // 1. Create New Board (ID Regeneration)
                    const newBoardId = uuidv4();
                    const newBoard = {
                        ...json.board,
                        id: newBoardId,
                        workspace_id: targetWorkspaceId,
                        owner_id: currentUser.id, // Current user becomes owner
                        title: `${json.board.title} (Imported)`,
                        created_at: new Date().toISOString()
                    };

                    // 2. Map Old IDs to New IDs
                    const groupIdMap = new Map<string, string>();
                    const columnIdMap = new Map<string, string>();

                    // 3. Prepare Batch Data
                    const groupsToInsert = json.groups.map((g: any) => {
                        const newId = uuidv4();
                        groupIdMap.set(g.id, newId);
                        return { ...g, id: newId, board_id: newBoardId };
                    });

                    const columnsToInsert = json.columns.map((c: any) => {
                        const newId = uuidv4();
                        columnIdMap.set(c.id, newId);
                        return { ...c, id: newId, board_id: newBoardId };
                    });

                    const itemsToInsert = json.items.map((i: any) => {
                        // Remap values keys if they use column IDs
                        const newValues: any = {};
                        Object.keys(i.values || {}).forEach(key => {
                            if (columnIdMap.has(key)) {
                                newValues[columnIdMap.get(key)!] = i.values[key];
                            } else {
                                newValues[key] = i.values[key]; // Keep original if not a column ID (legacy?)
                            }
                        });


                        return {
                            ...i,
                            id: uuidv4(),
                            board_id: newBoardId,
                            group_id: groupIdMap.get(i.group_id) || i.group_id, // Fallback if no match (shouldn't happen)
                            values: newValues,
                            created_at: new Date().toISOString()
                        };
                    });

                    // 4. Execute Inserts (Sequential for safety)
                    const { error: bError } = await supabase.from('boards').insert(newBoard);
                    if (bError) throw bError;

                    if (groupsToInsert.length) await supabase.from('groups').insert(groupsToInsert);
                    if (columnsToInsert.length) await supabase.from('columns').insert(columnsToInsert);
                    if (itemsToInsert.length) await supabase.from('items').insert(itemsToInsert);

                    // Add current user as member
                    await supabase.from('board_members').insert({
                        board_id: newBoardId,
                        user_id: currentUser.id,
                        role: 'owner'
                    });

                    resolve(newBoardId);

                } catch (error) {
                    console.error('Import Failed:', error);
                    reject(error);
                }
            };
            reader.readAsText(file);
        });
    },

    /**
     * Admin: Export Entire System
     */
    exportSystem: async () => {
        try {
            // Fetch everything (simplified for prototype)
            // Real system would need pagination or streaming for massive data
            const { data: workspaces } = await supabase.from('workspaces').select('*');
            const { data: boards } = await supabase.from('boards').select('*');
            const { data: groups } = await supabase.from('groups').select('*');
            const { data: columns } = await supabase.from('columns').select('*');
            const { data: items } = await supabase.from('items').select('*');

            const backupData = {
                version: '1.0',
                type: 'system_backup',
                timestamp: new Date().toISOString(),
                workspaces: workspaces || [],
                boards: boards || [],
                groups: groups || [],
                columns: columns || [],
                items: items || []
            };

            const fileName = `system_backup_${new Date().toISOString().split('T')[0]}.json`;
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('System Export Failed:', error);
            alert('Failed to export system data');
        }
    },

    // ------------------------------------------------------------------
    // 3. Export Board to CSV / EXCEL
    // ------------------------------------------------------------------
    exportBoardData: async (boardId: string, customFilename?: string, format: 'csv' | 'xlsx' = 'csv') => {
        try {
            console.log(`Starting ${format.toUpperCase()} Export...`);

            // 1. Fetch Data
            const { data: board, error: boardError } = await supabase.from('boards').select('title, description').eq('id', boardId).single();
            if (boardError) throw new Error('Failed to fetch board: ' + boardError.message);

            const { data: columns, error: colsError } = await supabase.from('columns').select('*').eq('board_id', boardId).order('order');
            if (colsError) throw new Error('Failed to fetch columns: ' + colsError.message);

            // Fetch items ordered by their position so groups/sub-items stay in board order
            const { data: items, error: itemsError } = await supabase.from('items').select('*').eq('board_id', boardId).order('order', { ascending: true }).order('created_at', { ascending: true });
            if (itemsError) throw new Error('Failed to fetch items: ' + itemsError.message);

            const { data: groups, error: groupsError } = await supabase.from('groups').select('id, title, order').eq('board_id', boardId).order('order');
            if (groupsError) throw new Error('Failed to fetch groups: ' + groupsError.message);

            // Fetch profiles for name mapping
            const { data: profiles } = await supabase.from('profiles').select('id, full_name, email');
            // 2. Map Helpers
            const groupMap = new Map(groups.map(g => [g.id, g.title]));
            const userMap = new Map(profiles?.map(p => [p.id, p.full_name || p.email]) || []);

            // Helper: Get Label for Status/Dropdown
            const getOptionLabel = (col: any, val: any) => {
                if (!val) return '';
                // Handle standard object value { id: '...' } or raw string '...'
                const rawId = (typeof val === 'object' && val !== null) ? val.id : val;
                if (!rawId) return '';
                const valId = String(rawId); // Force string for comparison

                let options = col.options;
                if (typeof options === 'string') {
                    try { options = JSON.parse(options); } catch (e) { options = []; }
                }
                if (!Array.isArray(options)) options = [];

                const option = options.find((o: any) => String(o.id) === valId);
                if (option) return option.label;
                // The "no status set" sentinel option used by the importer/UI
                if (valId === 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4') return '';
                return valId;
            };

            // Helper: Get People Names
            const getPeopleNames = (val: any) => {
                if (!val) return '';
                let ids: string[] = [];

                if (Array.isArray(val)) {
                    ids = val;
                } else if (typeof val === 'string') {
                    try { ids = JSON.parse(val); } catch (e) { ids = [val]; }
                } else if (typeof val === 'object') {
                    // Sometimes saved as { personsAndTeams: [...] } or similar?
                    // Assuming array for standard case
                    return JSON.stringify(val);
                }

                if (Array.isArray(ids)) {
                    return ids.map(id => userMap.get(id) || id).join(', ');
                }
                return String(val);
            };

            // Helper: Get space-separated file URLs (matches the Import parser's expected format)
            const getFileUrls = (val: any): string => {
                if (!val) return '';
                let arr = val;
                if (typeof val === 'string') {
                    try { arr = JSON.parse(val); } catch (e) { return val; }
                }
                if (!Array.isArray(arr)) return '';
                return arr.map((f: any) => (typeof f === 'string' ? f : f?.url)).filter(Boolean).join(' ');
            };

            // Filename sanitization
            let safeTitle = '';
            if (customFilename && customFilename.trim()) {
                safeTitle = customFilename.replace(/[\/\\:*?"<>|]/g, '_');
            } else {
                safeTitle = (board?.title || 'Untitled_Board').replace(/[\/\\:*?"<>|]/g, '_');
            }
            if (!safeTitle || safeTitle.trim() === '') safeTitle = 'Board_Export';

            // ------------------------------------------------------------
            // XLSX: Build a sheet using the same layout the Import feature
            // expects (Title row, Description row, Header row, Group rows,
            // Item rows, "Subitems" sub-tables, plus an "Updates" sheet)
            // ------------------------------------------------------------
            if (format === 'xlsx') {
                console.log('Generating Excel file via SheetJS (Import-compatible layout)...');
                const filename = safeTitle.toLowerCase().endsWith('.xlsx') ? safeTitle : `${safeTitle}.xlsx`;

                interface ColMeta {
                    column: any | null;
                    isTimeline: boolean;
                    header?: string;
                    headerStart?: string;
                    headerEnd?: string;
                }

                let usedStatus = false;
                let usedPeople = false;
                let usedFiles = false;
                let usedTimeline = false;

                const colMetas: ColMeta[] = columns.map((col: any): ColMeta => {
                    switch (col.type) {
                        case 'status':
                        case 'dropdown':
                        case 'priority':
                            if (!usedStatus) { usedStatus = true; return { column: col, isTimeline: false, header: 'Status' }; }
                            return { column: col, isTimeline: false, header: col.title };
                        case 'people':
                            if (!usedPeople) { usedPeople = true; return { column: col, isTimeline: false, header: 'Responsible' }; }
                            return { column: col, isTimeline: false, header: col.title };
                        case 'files':
                            if (!usedFiles) { usedFiles = true; return { column: col, isTimeline: false, header: 'Files' }; }
                            return { column: col, isTimeline: false, header: `${col.title} Files` };
                        case 'timeline':
                            if (!usedTimeline) {
                                usedTimeline = true;
                                return { column: col, isTimeline: true, headerStart: 'Timeline Start', headerEnd: 'Timeline End' };
                            }
                            return { column: col, isTimeline: true, headerStart: `${col.title} Timeline Start`, headerEnd: `${col.title} Timeline End` };
                        case 'date': {
                            const t = String(col.title || '').toLowerCase();
                            return { column: col, isTimeline: false, header: t.includes('date') ? col.title : `${col.title} Date` };
                        }
                        default:
                            return { column: col, isTimeline: false, header: col.title };
                    }
                });

                // The Import parser locates the header row by looking for a literal
                // "Status"/"Champion"/"Owner"/"Person"/"Subitems" cell. Guarantee one
                // exists even if the board has no status/dropdown column.
                if (!usedStatus) {
                    colMetas.push({ column: null, isTimeline: false, header: 'Status' });
                }

                const buildColumnHeaders = (): any[] => {
                    const out: any[] = [];
                    colMetas.forEach(m => {
                        if (m.isTimeline) out.push(m.headerStart, m.headerEnd);
                        else out.push(m.header);
                    });
                    return out;
                };

                const buildColumnValues = (item: any): any[] => {
                    const out: any[] = [];
                    const values = item.values || {};
                    colMetas.forEach(m => {
                        if (!m.column) { out.push(''); return; }
                        const val = values[m.column.id];

                        if (m.isTimeline) {
                            const tv = (val && typeof val === 'object') ? val : {};
                            out.push(tv.from || '', tv.to || '');
                            return;
                        }

                        if (val === null || val === undefined || val === '') { out.push(''); return; }

                        switch (m.column.type) {
                            case 'status':
                            case 'dropdown':
                            case 'priority':
                                out.push(getOptionLabel(m.column, val));
                                break;
                            case 'people':
                                out.push(getPeopleNames(val));
                                break;
                            case 'files':
                                out.push(getFileUrls(val));
                                break;
                            default:
                                out.push(typeof val === 'object' ? JSON.stringify(val) : String(val));
                        }
                    });
                    return out;
                };

                // Board sheet
                const aoa: any[][] = [];
                aoa.push([board?.title || 'Untitled Board']);
                // The Import parser misreads a short single-cell description row as a
                // bogus group ("hasNoDescription" heuristic). A trailing zero-width
                // space keeps the row at 2 cells so it's correctly skipped as the
                // description row instead.
                aoa.push([board?.description || '', board?.description ? '​' : '']);
                aoa.push(['Name', 'Item ID', ...buildColumnHeaders()]);

                const subItemsByParent = new Map<string, any[]>();
                items.forEach((i: any) => {
                    if (i.parent_id) {
                        if (!subItemsByParent.has(i.parent_id)) subItemsByParent.set(i.parent_id, []);
                        subItemsByParent.get(i.parent_id)!.push(i);
                    }
                });
                const topLevelItems = items.filter((i: any) => !i.parent_id);

                groups.forEach(group => {
                    aoa.push([group.title]);

                    topLevelItems.filter((i: any) => i.group_id === group.id).forEach((item: any) => {
                        aoa.push([item.title || '', item.id, ...buildColumnValues(item)]);

                        const subs = subItemsByParent.get(item.id) || [];
                        if (subs.length > 0) {
                            aoa.push(['Subitems', 'Name', ...buildColumnHeaders()]);
                            subs.forEach(sub => {
                                aoa.push(['', sub.title || '', ...buildColumnValues(sub)]);
                            });
                        }
                    });
                });

                // Updates sheet (column positions match what the Import parser expects)
                const updatesAoa: any[][] = [
                    ['Item ID', '', '', 'Content Type', 'User', 'Created At', 'Update Content', 'Post ID', 'Parent Post ID']
                ];
                items.forEach((item: any) => {
                    (item.updates || []).forEach((u: any) => {
                        updatesAoa.push([
                            item.id, '', '',
                            u.contentType || 'Update',
                            u.author || '',
                            u.createdAt || '',
                            u.content || '',
                            u.postId || '',
                            u.parentId || ''
                        ]);
                    });
                });

                const sanitizeSheetName = (name: string): string => {
                    let s = (name || 'Board').replace(/[\\/?*[\]:]/g, '_').trim();
                    if (!s) s = 'Board';
                    return s.length > 31 ? s.slice(0, 31) : s;
                };

                const XLSX = await import('xlsx');
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(aoa);
                XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(board?.title || 'Board'));

                if (updatesAoa.length > 1) {
                    const wsUpdates = XLSX.utils.aoa_to_sheet(updatesAoa);
                    XLSX.utils.book_append_sheet(wb, wsUpdates, 'Updates');
                }

                XLSX.writeFile(wb, filename);
                console.log('Excel Export Complete.');
                return;
            }

            // ------------------------------------------------------------
            // CSV: Flat one-row-per-item table
            // ------------------------------------------------------------
            console.log('Building content array...');
            const headers = ['Task Name', 'Group', ...columns.map(c => c.title), 'Created At'];
            const aoa: any[][] = [headers];

            items.forEach((item: any) => {
                const groupName = groupMap.get(item.group_id) || 'Unknown Group';

                // Map dynamic column values
                const colValues = columns.map(col => {
                    const val = (item.values || item.column_values || {})[col.id];

                    if (val === null || val === undefined) return '';

                    try {
                        if (col.type === 'status' || col.type === 'priority' || col.type === 'dropdown') {
                            return getOptionLabel(col, val);
                        }
                        if (col.type === 'people') {
                            return getPeopleNames(val);
                        }
                        if (col.type === 'date' || col.type === 'due_date' || col.type === 'timeline') {
                            // Assuming val is string or { from, to }
                            if (typeof val === 'object' && val !== null) {
                                if (val.from && val.to) return `${val.from} - ${val.to}`;
                                if (val.date) return val.date;
                                return JSON.stringify(val);
                            }
                            return String(val);
                        }
                    } catch (e) {
                        console.error('Error formatting value', e);
                        return String(val);
                    }

                    if (typeof val === 'object') return JSON.stringify(val);
                    return String(val);
                });

                aoa.push([
                    item.title || '',
                    groupName || '',
                    ...colValues,
                    new Date(item.created_at).toLocaleString()
                ]);
            });

            console.log('Generating CSV file string...');
            const filename = safeTitle.toLowerCase().endsWith('.csv') ? safeTitle : `${safeTitle}.csv`;
            const BOM = '\uFEFF';

            // Re-escape arrays for CSV syntax
            const csvRows = aoa.map(row =>
                row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
            );
            const csvContent = csvRows.join('\n');
            const csvData = BOM + csvContent;

            let url = '';
            // Threshold for Data URI (approx 1.5MB)
            const isDataUri = csvData.length < 1500000;

            if (isDataUri) {
                // Strategy A: Data URI (octet-stream to bypass IDM CSV sniffing)
                url = 'data:application/octet-stream;charset=utf-8,' + encodeURIComponent(csvData);
                console.log('Using Data URI strategy');
            } else {
                // Strategy B: Blob URL (Fallback)
                console.log('Using Blob URL strategy');
                const blob = new Blob([csvData], { type: 'application/octet-stream;charset=utf-8;' });
                url = URL.createObjectURL(blob);
            }

            const a = document.createElement('a');
            a.href = url;
            a.setAttribute('download', filename);
            a.download = filename;

            document.body.appendChild(a);
            a.click();

            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
                if (!isDataUri) URL.revokeObjectURL(url);
                console.log('CSV Export Complete.');
            }, 100);

        } catch (error: any) {
            console.error('Export Failed:', error);
            alert(`Failed to export ${format.toUpperCase()}: ` + (error.message || 'Unknown error'));
        }
    }
};
