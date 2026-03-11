# 🚀 คู่มือการย้าย Workera ไปเครื่องใหม่ (Step-by-Step)

คู่มือนี้จะสอนวิธี "ยกโปรเจค" จากเครื่องเดิม ไปรันในเครื่องใหม่ พร้อมวิธีเปลี่ยน Database (Supabase) Account อย่างละเอียด

---

## 🛠️ ขั้นตอนที่ 1: เตรียม Package (ทำที่เครื่องเดิม)

1. **เปิดโปรเจค** ด้วย Visual Studio Code หรือ Terminal
2. **สร้างไฟล์ Package**: พิมพ์คำสั่งใน Terminal:
   ```bash
   npm run package
   ```
3. **ตรวจสอบไฟล์**: คุณจะได้ไฟล์ชื่อ `workera-package-XXXXXXXX.zip` อยู่ในโฟลเดอร์หลักของโปรเจค
4. **Copy ไฟล์**: นำไฟล์ `.zip` นี้ใส่ Flash Drive หรืออัปโหลดขึ้น Cloud เพื่อย้ายไปยังเครื่องใหม่

---

## 💻 ขั้นตอนที่ 2: ติดตั้งโปรแกรมที่จำเป็น (ทำที่เครื่องใหม่)

ก่อนเริ่ม ต้องมั่นใจว่าเครื่องใหม่มีโปรแกรมเหล่านี้:
1. **Node.js (เวอร์ชัน 18 ขึ้นไป)**: [ดาวน์โหลดที่นี่](https://nodejs.org/) (เลือกเวอร์ชัน LTS)
2. **Visual Studio Code**: [ดาวน์โหลดที่นี่](https://code.visualstudio.com/) (แนะนำให้ใช้)

---

## 📂 ขั้นตอนที่ 3: แตกไฟล์และเริ่มติดตั้ง (ทำที่เครื่องใหม่)

1. **วางไฟล์**: นำไฟล์ `.zip` มาวางในโฟลเดอร์ที่ต้องการ (เช่น Desktop)
2. **แตกไฟล์**: คลิกขวาที่ไฟล์ เลือก **Extract All...** หรือแตกไฟล์ตามปกติ
3. **เปิด VS Code**:
   - เปิดโปรแกรม VS Code
   - ไปที่เมนู `File` -> `Open Folder...`
   - เลือกโฟลเดอร์ที่เพิ่งแตกออกมา
4. **เปิด Terminal ใน VS Code**:
   - ไปที่เมนู `Terminal` -> `New Terminal` (ด้านล่างจะเห็นหน้าจอสีดำ)
5. **ติดตั้ง Library**: พิมพ์คำสั่งนี้แล้วกด Enter:
   ```bash
   npm install
   ```
   *(รอจนเสร็จ ขั้นตอนนี้อาจใช้เวลา 1-2 นาที)*

---

## ☁️ ขั้นตอนที่ 4: ตั้งค่า Database ใหม่ (กรณีเปลี่ยน Account)

หากต้องการเปลี่ยนไปใช้ Supabase Account อื่น ให้ทำตามนี้:

1. **สร้าง Supabase Project**:
   - ไปที่ [supabase.com](https://supabase.com) และ Login
   - คลิกปุ่ม **New Project**
   - ตั้งชื่อโปรเจค (เช่น `Workera-Prod`) และตั้งรหัสผ่าน Database
   - รอจนโปรเจคสร้างเสร็จ (ประมาณ 2 นาที)

2. **เอา API Keys มาใช้**:
   - ใน Supabase Dashboard ไปที่เมนู **Project Settings** (รูปเฟืองด้านล่างซ้าย)
   - เลือกเมนู **API**
   - หาคำว่า `Project URL` -> คลิกปุ่ม **Copy**
   - หาคำว่า `anon public` -> คลิกปุ่ม **Copy**

3. **สร้างไฟล์ .env ในโปรเจค**:
   - ใน VS Code (เครื่องใหม่) มองหาไฟล์ชื่อ `.env.example`
   - คลิกขวาที่ไฟล์ เลือก **Rename** แล้วเปลี่ยนชื่อเป็น `.env` (ลบคำว่า .example ออก)
   - เปิดไฟล์ `.env` และวาง API Keys ที่ copy มา:
     ```env
     VITE_SUPABASE_URL=วาง URL ที่นี่
     VITE_SUPABASE_ANON_KEY=วาง anon key ที่นี่
     ```
   - **เซฟไฟล์ (Ctrl + S)**

---

## 🏗️ ขั้นตอนที่ 5: ติดตั้ง Schema (ตาราง) ใน Database

1. **เปิดไฟล์ SQL**: ใน VS Code ให้เปิดไฟล์ `scripts/setup_fresh_install.sql`
2. **Copy Code**: คลุมดำทั้งหมด (Ctrl + A) และ Copy (Ctrl + C)
3. **ไปที่ Supabase SQL Editor**:
   - ในหน้าเว็บ Supabase เลือกเมนู **SQL Editor** (รูปปุ่ม `>_` ด้านซ้าย)
   - คลิก **+ New query**
   - วาง Code ที่ Copy มาลงไป
   - กดปุ่ม **Run** (ด้านขวาล่าง)
   - *ตรวจสอบว่าสถานะขึ้นว่า Success*

---

## 🔑 ขั้นตอนที่ 6: ตั้งค่า Authentication (สำคัญมาก)

เพื่อให้ระบบสมัครสมาชิกและล็อกอินทำงานได้:
1. ในหน้าเว็บ Supabase เลือกเมนู **Authentication** (รูปคน)
2. ไปที่เมนู **Providers**
3. หาคำว่า **Email** และตรวจสอบว่า:
   - `Enable Email Signup` เป็น **ON**
   - `Confirm Email` เป็น **OFF** (เพื่อความสะดวกในการข้ามการยืนยันอีเมลตอนทดสอบ)
4. กด **Save**

---

## 🚀 ขั้นตอนที่ 7: เริ่มรันโปรแกรม

1. กลับมาที่ Terminal ใน VS Code พิมพ์:
   ```bash
   npm run dev
   ```
2. คุณจะเห็นลิ้งก์ `http://localhost:5173` ให้กด Ctrl แล้วคลิกที่ลิ้งก์นั้น
3. **สมัครสมาชิก (Sign Up)**: ลองสร้าง Account ใหม่เพื่อเข้าใช้งาน

---

## 💡 สรุป Checklist หากเปิดไม่ได้
- [ ] รัน `npm install` หรือยัง?
- [ ] ไฟล์ชื่อ `.env` ถูกต้องไหม? (ต้องไม่มี `.example` ต่อท้าย)
- [ ] ใส่ API Keys ถูกตัวไหม? (URL และ anon)
- [ ] รัน SQL ใน Supabase SQL Editor หรือยัง?
- [ ] ตรวจสอบ Node.js เวอร์ชันด้วยคำสั่ง `node -v` (ต้อง >= 18)

### Step 4: Setup Database Schema

```bash
# ไปที่ Supabase SQL Editor
# Copy และรัน script นี้:
```

เลือกใช้วิธีรันไฟล์:

**ใช้ All-in-One Clean Install Script (แนะนำ)**
```bash
# รัน scripts/setup_fresh_install.sql ใน Supabase SQL Editor
# (ไฟล์นี้จะทำการลบข้อมูลเก่าและสร้างตารางใหม่ทั้งหมด)
```

### Step 5: รัน Development Server

```bash
npm run dev
```

เปิดเบราว์เซอร์ที่ `http://localhost:5173`

---

## 📦 วิธีที่ 2: ใช้ ZIP Package

### Step 1: สร้าง Package

```bash
# รันคำสั่งนี้ในเครื่องเดิม
npm run package
```

หรือสร้างด้วยตนเอง:

```bash
# สร้าง zip ไม่รวม node_modules และ .git
zip -r workera-package.zip . -x "node_modules/*" ".git/*" "dist/*" ".env"
```

### Step 2: ย้ายไปเครื่องใหม่

1. Copy `workera-package.zip` ไปเครื่องใหม่
2. แตก zip:
   ```bash
   unzip workera-package.zip -d Workera
   cd Workera
   ```

### Step 3: ติดตั้งและ Setup

```bash
# ติดตั้ง dependencies
npm install

# Copy .env.example เป็น .env
cp .env.example .env

# แก้ไข .env ให้ตรงกับ Supabase ของคุณ
```

### Step 4: Setup Database และรัน

ทำตาม Step 4-5 ด้านบน

---

## 🔄 เปลี่ยน Database Account

### กรณีที่ 1: ใช้ Supabase Project ใหม่

1. **สร้าง Supabase Project ใหม่**
   - ไปที่ [Supabase Dashboard](https://app.supabase.com)
   - คลิก "New Project"
   - ตั้งชื่อและรอให้สร้างเสร็จ (~2 นาที)

2. **อัพเดท .env**
   ```env
   VITE_SUPABASE_URL=https://new-project.supabase.co
   VITE_SUPABASE_ANON_KEY=new-anon-key-here
   ```

3. **Setup Database Schema**
   - ไปที่ SQL Editor ใน Supabase
   - รัน `scripts/setup_fresh_install.sql`

4. **Restart Development Server**
   ```bash
   # หยุด server (Ctrl+C)
   npm run dev
   ```

### กรณีที่ 2: ใช้ Database เดิมแต่ต้องการ Reset

1. **ลบข้อมูลเก่า (ระวัง!)**
   ```sql
   -- รันใน Supabase SQL Editor
   TRUNCATE TABLE items CASCADE;
   TRUNCATE TABLE columns CASCADE;
   TRUNCATE TABLE groups CASCADE;
   TRUNCATE TABLE boards CASCADE;
   TRUNCATE TABLE workspaces CASCADE;
   TRUNCATE TABLE board_members CASCADE;
   TRUNCATE TABLE workspace_members CASCADE;
   TRUNCATE TABLE notifications CASCADE;
   TRUNCATE TABLE activity_logs CASCADE;
   ```

2. **รัน Schema ใหม่**
   ```bash
   # รัน scripts/setup_fresh_install.sql
   ```

---

## 🏗️ Build สำหรับ Production

### Build Static Files

```bash
# Build โปรเจค
npm run build

# ไฟล์จะอยู่ในโฟลเดอร์ dist/
```

### Deploy ไป Vercel (แนะนำ)

```bash
# ติดตั้ง Vercel CLI
npm install -g vercel

# Deploy
vercel

# ตั้งค่า Environment Variables ใน Vercel Dashboard:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
```

### Deploy ไป Netlify

```bash
# ติดตั้ง Netlify CLI
npm install -g netlify-cli

# Build และ Deploy
npm run build
netlify deploy --prod --dir=dist

# ตั้งค่า Environment Variables ใน Netlify Dashboard
```

---

## 🔧 Troubleshooting

### ปัญหา: "Missing Supabase credentials"

**แก้ไข:**
- ตรวจสอบว่าไฟล์ `.env` มีอยู่
- ตรวจสอบว่า `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` ถูกต้อง
- Restart development server

### ปัญหา: "npm install" ล้มเหลว

**แก้ไข:**
```bash
# ลบ node_modules และ package-lock.json
rm -rf node_modules package-lock.json

# ติดตั้งใหม่
npm install
```

### ปัญหา: Database Schema Error

**แก้ไข:**
- ลองรัน `scripts/setup_fresh_install.sql` ใหม่อีกครั้ง
- ตรวจสอบ Supabase logs ใน Dashboard → Logs

### ปัญหา: Login ไม่ได้

**แก้ไข:**
- ตรวจสอบว่า Supabase Authentication เปิดอยู่
- ไปที่ Supabase Dashboard → Authentication → Providers
- เปิด Email provider

---

## 📝 Checklist การติดตั้ง

- [ ] ติดตั้ง Node.js v18+
- [ ] Clone/แตก ZIP โปรเจค
- [ ] รัน `npm install`
- [ ] สร้างไฟล์ `.env` และใส่ Supabase credentials
- [ ] รัน SQL schema ใน Supabase
- [ ] เปิด Email Authentication ใน Supabase
- [ ] รัน `npm run dev`
- [ ] ทดสอบ login/signup

---

## 🎯 Quick Start (สรุป)

```bash
# 1. Clone
git clone https://github.com/Jirawat209/Workera.git
cd Workera

# 2. Install
npm install

# 3. Setup .env
cp .env.example .env
# แก้ไข .env ให้ตรงกับ Supabase ของคุณ

# 4. Setup Database
# รัน scripts/setup_fresh_install.sql ใน Supabase SQL Editor

# 5. Run
npm run dev
```

---

## 📞 ต้องการความช่วยเหลือ?

- **Documentation:** [README.md](./README.md)
- **Deployment Guide:** [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **GitHub Issues:** [Workera Issues](https://github.com/Jirawat209/Workera/issues)
