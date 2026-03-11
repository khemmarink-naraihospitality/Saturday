# Changelog

All notable changes to this project will be documented in this file.

## [v1.2.0-beta] - 2026-03-11

### 🚀 New Features & Enhancements
-   **Granular Board Sharing**: You can now explicitly share specific boards with users without sharing the entire workspace. Shared users will only see the workspace context and the explicit boards they have access to.
-   **Security/Backend**: Refactored PostgreSQL RLS policies to safely resolve nested workspace-to-board access permissions and removed redundant legacy migration scripts.
-   **UI & Routing Fixes**: 
    - Fixed Deep Link routing occasionally resolving to identically named boards (e.g. "Starting Board") across different workspaces.
    - Re-aligned the "Search" button icon and text in the Board Header.
    - Improved `WorkspaceList` frontend store logic to correctly fetch and filter isolated shared boards.

## [v1.1.1-beta] - 2026-02-17

### 🌓 Dark Mode Fixes
-   **Homepage**:
    -   Fixed invisible text colors (Text is now theme-aware).
    -   Fixed card backgrounds (Cards are now theme-aware).
-   **Notification Center**:
    -   Fixed white backgrounds on notification cards.
    -   Fixed text readability and status badge transparency.

## [v1.1-beta] - 2026-02-12

### 🚀 New Features
-   **Recently Visited Boards**:
    -   Real-time tracking of visited boards.
    -   Smart sorting (Newest first).
    -   Enhanced Card UI with Owner and Workspace details.
-   **Notification System**:
    -   Improved "Invite" flow (Requires Acceptance).
    -   Fixed sync issues between read status and DB.
    -   Real-time updates for new notifications.

## [v1.0-beta] - 2026-02-10

### 🚀 Released
-   **Full Work Management System**: Complete board, group, and item management.
-   **Views**: Main Table, Kanban, Calendar, Dashboard, and Gantt charts.
-   **Column Types**: Status, Priority, Date, Timeline, People, Numbers, Checkbox, Link, Dropdown.
-   **Admin Console**: User management, Workspace management, and System stats.
-   **Export System**:
    -   Board Export to CSV (Full data fidelity).
    -   System-wide JSON Backup & Restore (Admin only).
-   **Activity Logs**: Detailed tracking of item updates, creation, and deletion.

### 🐛 Fixed
-   **CSV Export**: Resolved issues with empty cells and missing labels for Status/Dropdown columns.
-   **Excel Export**: Reverted to CSV for better compatibility and performance.
-   **File Downloads**: Implemented IDM-compatible download handling.
