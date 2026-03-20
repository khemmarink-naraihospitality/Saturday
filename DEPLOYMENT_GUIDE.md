# Saturday.com - Deployment & Sharing Guide

## 📦 Option 1: Share via GitHub (Recommended)

Your project is already on GitHub! Simply share the repository URL with your team:

```
https://github.com/Jirawat209/Workera
```

### Team Setup Steps:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Jirawat209/Workera.git
   cd Saturday-com
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   - Copy `.env.example` to `.env`
   - Add Supabase credentials (URL and anon key)

4. **Run development server:**
   ```bash
   npm run dev
   ```

5. **Set up Supabase database:**
   - Run all SQL scripts in `/brain/` folder in Supabase SQL Editor
   - Scripts to run in order:
     - `activity_logs_schema.sql`
     - `delete_user_function.sql`
     - `trigger_user_signup_log.sql`
     - `trigger_workspace_board_logs.sql`
     - Other policy files as needed

---

## 📂 Option 2: Create a Complete Package (ZIP)

If you want to share as a downloadable package:

### What to Include:

```bash
# Create a clean package (excludes node_modules, .git, etc.)
cd /Users/jirawat/.gemini/antigravity/scratch
zip -r Saturday-com-Package.zip Saturday-com \
  -x "Saturday-com/node_modules/*" \
  -x "Saturday-com/.git/*" \
  -x "Saturday-com/dist/*" \
  -x "Saturday-com/.env"
```

### Package Contents:
- ✅ Source code (`/src`)
- ✅ Configuration files (`package.json`, `tsconfig.json`, `vite.config.ts`)
- ✅ SQL scripts (in `/brain/` folder)
- ✅ README and documentation
- ❌ `node_modules` (too large, team will run `npm install`)
- ❌ `.git` (optional, depends on your needs)
- ❌ `.env` (contains secrets, each team member creates their own)

---

## 🚀 Option 3: Deploy to Production

Deploy the app so your team can access it online:

### Recommended Platforms:

#### **Vercel (Easiest for React/Vite)**

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Deploy:**
   ```bash
   cd /Users/jirawat/.gemini/antigravity/scratch/Saturday-com
   vercel
   ```

3. **Add environment variables in Vercel dashboard:**
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

#### **Netlify**

1. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

2. **Build and deploy:**
   ```bash
   npm run build
   netlify deploy --prod
   ```

#### **GitHub Pages**

1. **Add to `vite.config.ts`:**
   ```typescript
   export default defineConfig({
     base: '/Saturday-com/',
     // ... rest of config
   })
   ```

2. **Build and deploy:**
   ```bash
   npm run build
   # Use gh-pages package or manual upload to gh-pages branch
   ```

---

## 📋 What Your Team Needs

### Required Information:

1. **Supabase Project Details:**
   - Project URL
   - Anon/Public Key
   - Service Role Key (for admins only)

2. **Database Setup:**
   - All SQL scripts from `/brain/` folder
   - Instructions on which order to run them

3. **Initial Admin Account:**
   - How to create first super_admin user
   - Login credentials

### Create a `.env.example` file:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Optional: For development
VITE_APP_NAME=Saturday.com
VITE_APP_VERSION=1.0.0
```

---

## 📝 Documentation to Include

Create these files for your team:

### 1. **README.md** (Main documentation)
- Project overview
- Features list
- Setup instructions
- Tech stack

### 2. **SETUP.md** (Detailed setup guide)
- Prerequisites (Node.js version, etc.)
- Step-by-step installation
- Database setup
- Common issues and solutions

### 3. **DATABASE.md** (Database documentation)
- Schema overview
- Tables and relationships
- RLS policies
- SQL scripts execution order

### 4. **API.md** (If applicable)
- Supabase functions
- Database triggers
- RPC functions

---

## 🔒 Security Checklist

Before sharing:

- [ ] Remove all `.env` files
- [ ] Remove sensitive data from code
- [ ] Update `.gitignore` to exclude secrets
- [ ] Don't commit Supabase service role keys
- [ ] Create separate Supabase project for production
- [ ] Document security best practices

---

## 🎯 Recommended Approach

**For your team, I recommend:**

1. ✅ **Share via GitHub** (already done)
2. ✅ **Create comprehensive README.md**
3. ✅ **Document all SQL scripts with execution order**
4. ✅ **Create `.env.example` template**
5. ✅ **Deploy to Vercel/Netlify for demo**
6. ✅ **Share Supabase project access** (or create separate projects)

This way, your team can:
- Clone and run locally for development
- Access live demo online
- Understand the setup process
- Contribute via Git

---

## 📞 Support

If team members have issues:
1. Check they ran `npm install`
2. Verify `.env` file is configured correctly
3. Ensure all SQL scripts were executed in Supabase
4. Check Node.js version compatibility (v18+ recommended)
