export type ColumnType = 'text' | 'long_text' | 'status' | 'date' | 'number' | 'dropdown' | 'checkbox' | 'link' | 'people' | 'timeline' | 'files';

export interface ColumnOption {
    id: string;
    label: string;
    color: string;
}

export interface FileLink {
    id: string;
    name: string;
    url: string;
    type: 'google-drive'; // Prepared for future expansion
}

export interface Column {
    id: string;
    title: string;
    type: ColumnType;
    options?: ColumnOption[]; // For Status/Dropdown
    width?: number; // Custom width in px
    order: number;
    aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'none';
}

// ItemValue stores dynamic column data
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ItemValue {
    // Using 'any' here is intentional - column values can be of various types
    // (string, number, boolean, Date, string[], etc.) depending on the column type
    // Strict typing would require complex discriminated unions that don't provide
    // practical benefits given the dynamic nature of user-defined columns
    [columnId: string]: any;
}

export interface Group {
    id: string;
    title: string;
    color: string;
    items: Item[];
    order?: number;
}


export interface Comment {
    id: string;
    content: string;
    createdAt: string;
    author: string;
}

export interface Item {
    id: string;
    title: string;
    // The "Name" or first frozen column is stored in 'title',
    // but the system treats it as a column for rendering in some contexts.
    groupId: string; // Link to Group
    boardId: string; // Link to Board
    values: ItemValue;
    updates?: Comment[]; // For Task Sidebar
    files?: FileLink[]; // For Task Sidebar Files Tab
    isHidden?: boolean;
    order?: number;
    createdAt?: string;
}

export interface SortState {
    columnId: string;
    direction: 'asc' | 'desc';
}

export interface FilterState {
    columnId: string;
    values: string[]; // List of values to include (for status/dropdown/checkbox)
}

export interface Workspace {
    id: string;
    title: string;
    order: number;
    owner_id: string;
    ownerName?: string; // Transient property for UI
}



export interface Board {
    id: string;
    workspaceId?: string; // Link to specific Workspace
    subWorkspaceId?: string; // Optional: Link to a SubWorkspace
    title: string;
    columns: Column[];
    groups: Group[]; // Ordered list of groups
    items: Item[];
    itemColumnTitle?: string; // Customizable title for the first "Item" layout column
    itemColumnWidth?: number; // Custom width for the first column
    groupByColumnId?: string | null; // For dynamic view overrides (optional future)
    collapsedGroups?: string[];

    // View State (Transient or Persistent)
    sort?: SortState | null;
    filters?: FilterState[]; // Support multiple column filters
    lastViewedAt?: string; // Captured from board_members
    is_archived?: boolean;
}

export type NotificationType = 'workspace_invite' | 'board_invite' | 'assignment' | 'mention';
export type NotificationStatus = 'pending' | 'accepted' | 'declined';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface NotificationData {
    // Notification data structure varies by type - using 'any' for flexibility
    workspace_id?: string;
    board_id?: string;
    item_id?: string;
    [key: string]: any;
}

export interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    message: string | null;
    data: NotificationData;
    is_read: boolean;
    status?: NotificationStatus; // Optional, often stored in data
    created_at: string;
    actor_id?: string;
    user_id: string;
    content?: string;
    entity_id?: string;
}
