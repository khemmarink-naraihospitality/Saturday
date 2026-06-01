# Saturday.com — Project Context

## Product Name
**Saturday.com** — A project management and task tracking platform designed for **Narai Hospitality Group (NHG)**.

> **IMPORTANT:** The application is called "Saturday.com". The folder name "Workera" is only the local workspace folder name and does NOT represent the product name.

## Core Identity
- **Brand:** NHG Saturday.com
- **Organization:** Narai Hospitality Group
- **Domain:** https://saturday.naraihospitalitygroup.com
- **Powered by:** Jirawat.K

## Tech Stack
| Layer           | Technology                    |
|-----------------|-------------------------------|
| Frontend        | React + TypeScript + Vite     |
| State           | Zustand (boardSlice.ts)       |
| Database        | Supabase (PostgreSQL + RLS)   |
| Auth            | Supabase Auth (Google OAuth, Email) |
| Hosting         | Vercel (auto-deploy from `main` branch) |
| Backend (NHGOne)| Railway (Python FastAPI)      |
| Styling         | Vanilla CSS (Narai Design System) |

## Design System — Narai Hospitality Group
- **Aesthetic:** Quiet confidence, editorial, premium
- **Corners:** Sharp architectural (0px border-radius)  
- **Primary Color:** Galangal / Narai Green (#2d5016)
- **Typography:** Nib Pro (display), tracked-caps (subheaders)
- **Tone:** Minimal, confident, clean

## Key Features
- **Board Management:** Create, edit, archive, reorder boards
- **Workspaces:** Business Tech, Finance, Operations, Marketing, Chinatown x Tech
- **Views:** Main Table, Timeline, Kanban, Calendar
- **User Roles:** Super Admin, Admin, User, Viewer
- **Import Board:** Import boards from Excel (.xlsx) files — Saturday-style template (columns A-Q)
- **Activity Log:** Tracks user actions (create, update, delete, import)
- **NHGOne Integration:** Auto-sync reservations, members, payments from MEWS PMS

## Supabase Projects
| Name              | Project ID              | Region           |
|-------------------|-------------------------|------------------|
| NHG Saturday.com  | susgfswicrxdxaioegps    | ap-south-1       |
| NHGOne            | zstkslczesscigdacubm    | ap-southeast-1   |

## Key Users
- **Khemmarin Khuntong (UI)** — Super Admin (khemmarin.k@naraihospitality.com)
- User ID: `0bd65220-4756-4e2b-8f02-7cc360d072b2`

## GitHub Repository
- **Repo:** khemmarink-naraihospitality/Saturday
- **Branch:** main (auto-deploy to Vercel)

## Excel Import Rules & Column Mapping (A-Q)
The Board Import feature follows strict parsing rules to maintain data integrity and NHG branding:

### 1. File Structure Parsing
- **Row 1:** Board Title (Column A).
- **Row 2:** Board Description (Column A).
- **Subitems Marker:** A row with "Subitems" in Column A triggers sub-item mode.
- **Group Detection:** Rows starting with "Priority" or solo-text rows are converted to Group headers.

### 2. Logic & Behavior
- **Overwrite Mechanism:** If a board with the same title exists in the workspace, it is **deleted and replaced** automatically.
- **Subitem Logic:** When in sub-item mode, rows with an **EMPTY Column A** are nested under the last non-empty row (Main Item).
- **Timeline Merging:** Columns **E (Start)** and **F (End)** are merged into a single system `timeline` object `{from, to}`. Supports `DD-MM-YY` and Excel serial dates.
- **Feedback:** A success screen with a 2-second delay is shown upon completion before closing the modal.

### 3. Column & Type Mapping
| Col | Excel Header       | Saturday.com Column | System Type | Special Handling |
|-----|--------------------|---------------------|-------------|------------------|
| A   | Name               | (Title)             | item        | Empty = Subitem  |
| B   | (Reserved)         | -                   | -           | Skipped in UI    |
| C   | Status             | Status              | status      | Color Mapping    |
| D   | Champion           | Champion            | text        | 12px Font Size   |
| E+F | Timeline S/E       | Timeline            | timeline    | Merged Object    |
| G   | (Reserved)         | -                   | -           | Date (Subitem only) |
| H   | ST Files           | ST Files            | files       | -                |
| I   | SOR Complete       | SOR Complete        | text        | -                |
| J   | Budget             | Numbers             | text        | -                |

### 4. Status Color Standards (NHG Brand)
| Status Label        | Hex Color | Brand Meaning |
|---------------------|-----------|---------------|
| Done / Completed    | `#00c875` | Success Green |
| In Progress         | `#fdab3d` | Working Orange|
| Working on it       | `#fdab3d` | Working Orange|
| Stuck               | `#e2445c` | Critical Red  |
| Waiting             | `#c4c4c4` | Pending Gray  |
| N/A / Not Start     | `#333333` | Neutral Black |
| Default             | `#c4c4c4` | Empty Gray    |

### 5. UI Layout Constraints
- **Header Description:** Truncated after **450px** with ellipsis to protect action buttons (Share/Invite).
- **Champion Column:** Reduced font size (12px) to accommodate long email addresses.
