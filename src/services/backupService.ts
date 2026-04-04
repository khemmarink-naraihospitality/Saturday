import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';

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
            const { data: board, error: boardError } = await supabase.from('boards').select('title').eq('id', boardId).single();
            if (boardError) throw new Error('Failed to fetch board: ' + boardError.message);

            const { data: columns, error: colsError } = await supabase.from('columns').select('*').eq('board_id', boardId).order('order');
            if (colsError) throw new Error('Failed to fetch columns: ' + colsError.message);

            // Fetch items explicitly ordered by creation date to flatten sub-items effectively
            const { data: items, error: itemsError } = await supabase.from('items').select('*').eq('board_id', boardId).order('created_at', { ascending: true });
            if (itemsError) throw new Error('Failed to fetch items: ' + itemsError.message);

            const { data: groups, error: groupsError } = await supabase.from('groups').select('id, title').eq('board_id', boardId);
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
                return option ? option.label : valId;
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

            // 3. Build Array of Arrays (AoA) content
            console.log('Building content array...');
            const headers = ['Task Name', 'Group', ...columns.map(c => c.title), 'Created At'];
            const aoa: any[][] = [headers];

            items.forEach(item => {
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
                        if (col.type === 'date' || col.type === 'timeline') {
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

            // Filename sanitization
            let safeTitle = '';
            if (customFilename && customFilename.trim()) {
                safeTitle = customFilename.replace(/[\/\\:*?"<>|]/g, '_');
            } else {
                safeTitle = (board?.title || 'Untitled_Board').replace(/[\/\\:*?"<>|]/g, '_');
            }
            if (!safeTitle || safeTitle.trim() === '') safeTitle = 'Board_Export';

            // 4. Output Generation and Download Execution
            if (format === 'xlsx') {
                console.log('Generating Excel file via SheetJS...');
                const filename = safeTitle.toLowerCase().endsWith('.xlsx') ? safeTitle : `${safeTitle}.xlsx`;
                
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(aoa);
                XLSX.utils.book_append_sheet(wb, ws, "Board Data");
                
                XLSX.writeFile(wb, filename);
                console.log('Excel Export Complete.');
                return;
            }

            // Fallback: CSV Logic
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
