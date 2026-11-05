# NITESH SCHOOL MANAGEMENT SYSTEM
## Production Deployment & Multi-Tenant SaaS Hosting Guide

**Global App Name**: NITESH SCHOOL MANAGEMENT SYSTEM  
**Official Support Contacts**:
- **Phone / WhatsApp**: +91 8603219331
- **Email**: NITESHRAVI8603@GMAIL.COM

---

## 1. Quick Overview

NITESH SCHOOL MANAGEMENT SYSTEM is a complete multi-tenant School ERP SaaS platform. Each educational institution operates inside an isolated cloud workspace (`/schools/{schoolId}`) with:
- **Tenant-isolated Firestore & Firebase Auth**: Role-Based Access Control (Main Admin, Accountant, Teacher, Director).
- **In-App Digital Signature & School Stamp Verification**: Dynamic watermarks and authorized signatory overlays on Student ID Cards, Staff ID Cards, Examination Admit Cards, and Marksheets.
- **Bulk Data Migration**: In-browser Excel (.xlsx) & CSV parser for bulk importing Students, Staff, and Legacy Opening Fee Dues.
- **Dynamic User-Owned Cloud Binding**: Main Admins can link their own self-hosted Supabase or Firebase project, or use the managed Google Cloud instance.

---

## 2. Environment Variables (.env)

Create a `.env` file in the root directory (based on `.env.example`):

```bash
# Node Environment & Server Port
PORT=3000
NODE_ENV=production

# Application URL (Public URL where your app is hosted)
APP_URL=https://your-school-domain.com

# Optional Server-Side Gemini API Key (For 'Ask AI / Change Us' layout modifier)
GEMINI_API_KEY=your_gemini_api_key_here
```

### Client-Side Firebase Configuration (Pre-configured via `firebase-applet-config.json`):
The application automatically reads its Firebase database configuration from `firebase-applet-config.json`. When deploying to your own custom domain or external cloud, you can also optionally provide:

```bash
VITE_FIREBASE_API_KEY=your_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_DATABASE_ID=your_database_id
```

---

## 3. Deployment Option A: Google Cloud Run (Recommended for Full-Stack)

Google Cloud Run provides scale-to-zero serverless hosting with native support for Express + Vite.

### Build & Deploy Commands:

```bash
# 1. Install production dependencies
npm install

# 2. Build the optimized Vite frontend bundle
npm run build

# 3. Test dev server locally
npm run dev

# 4. Deploy directly to Cloud Run using Google Cloud SDK
gcloud run deploy nitesh-school-erp \
  --source . \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 3000 \
  --set-env-vars NODE_ENV=production,PORT=3000
```

---

## 4. Deployment Option B: Vercel (Static / SPA Hosting)

For static frontend hosting on Vercel:

1. Push your repository to GitHub or GitLab.
2. Import the project into Vercel.
3. Configure the build settings:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. Add SPA URL Rewrite: Create or ensure `vercel.json` exists with:
   ```json
   {
     "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
   }
   ```
5. Deploy. Vercel will provision an instant SSL-secured URL (e.g., `https://nitesh-school-erp.vercel.app`).

---

## 5. Deployment Option C: Netlify

1. Link your repository in Netlify.
2. Build Settings:
   - **Base directory**: (root)
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
3. SPA Redirects: Create `public/_redirects`:
   ```text
   /*    /index.html   200
   ```
4. Deploy site.

---

## 6. Custom Domain & SSL Setup

1. In your DNS provider (Cloudflare, GoDaddy, Namecheap):
   - Add a `CNAME` record pointing `erp.yourschool.edu.in` to your hosting URL (e.g., `cname.vercel-dns.com` or Cloud Run domain mapping).
2. Wait 5–15 minutes for DNS propagation.
3. In Google Firebase Console > **Authentication** > **Settings** > **Authorized Domains**:
   - Add your custom domain (e.g., `erp.yourschool.edu.in`) to the authorized domain list to allow Google Sign-In and Email Link verification.

---

## 7. Post-Deployment Verification Checklist

- [ ] **Global Branding**: Verify top header shows "NITESH SCHOOL MANAGEMENT SYSTEM" with contact bar `Phone: +91 8603219331 | Email: NITESHRAVI8603@GMAIL.COM`.
- [ ] **School Signature & Stamp**: Open School Settings > Signature & Verification. Upload transparent PNG signature and official circular stamp seal. Confirm they appear on ID Cards, Admit Cards, and Marksheets.
- [ ] **Data Migration**: Open Bulk Data Migration tab. Download sample `.xlsx` or `.csv`, test parsing, and verify batch import into the live database.
- [ ] **RBAC & Invites**: Invite an Accountant (max 2 limit) and Teacher to verify cloud permission boundaries.
- [ ] **Backups**: Download a full JSON and multi-sheet Excel (.xlsx) backup to verify data portability.
