# User Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate unique gender-matched Notionists avatars for every user via DiceBear (fully offline), with optional personal photo upload stored in MinIO.

**Architecture:** DiceBear runs entirely in the browser as an npm package — no network calls. Generated SVG is deterministic from `userId` seed. If the user uploads a photo, it's stored in MinIO and the URL is saved in `users.avatar`; the photo takes priority over the generated avatar.

**Tech Stack:** `@dicebear/core`, `@dicebear/collection`, existing MinIO/S3 config (`backend/src/config/s3.js`), multer (already installed), PostgreSQL (`users.avatar`, `users.gender` columns already exist).

---

## File Map

**Create:**
- `lib/avatar.ts` — `generateAvatarUrl(userId, gender)` utility

**Modify:**
- `package.json` (root) — add DiceBear dependencies
- `types/index.ts` — add `gender`, `avatar` to `User`
- `types/project.ts` — add `gender`, `avatar` to `ProjectMember`
- `store/authStore.ts` — map `gender` and `avatar` in `checkAuth` and `login`
- `backend/src/routes/auth.js` — include `gender`, `avatar` in `/login` and `/me` responses
- `backend/src/routes/users.js` — include `gender`, `avatar` in `GET /users` and `GET /users/:id`; add `POST /users/me/avatar`
- `backend/src/routes/projects.js` — include `gender`, `avatar` in `getProjectWithMembers` and list query
- `backend/src/middleware/upload.js` — add `uploadAvatar` multer instance
- `components/layout/Header.tsx` — use `AvatarImage` with generated/uploaded avatar
- `pages/Profile.tsx` — use `AvatarImage`, add upload UI
- `pages/Employees.tsx` — use `AvatarImage` with generated avatar
- `pages/DepartmentDetail.tsx` — use `AvatarImage` with generated avatar
- `pages/EmployeeProfile.tsx` — use `AvatarImage` with generated avatar
- `pages/Projects.tsx` — use `AvatarImage` for project members
- `pages/ProjectDetail.tsx` — use `AvatarImage` for project members

---

## Task 1: Install DiceBear packages

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Install packages**

```bash
cd /c/code/worker-cabinet
npm install @dicebear/core @dicebear/collection
```

Expected: packages added to `node_modules`, `package.json` updated with two `@dicebear/*` entries.

- [ ] **Step 2: Verify install**

```bash
node -e "const { createAvatar } = require('@dicebear/core'); console.log('ok')"
```

Expected: prints `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @dicebear/core and @dicebear/collection"
```

---

## Task 2: Update TypeScript types

**Files:**
- Modify: `types/index.ts`
- Modify: `types/project.ts`

- [ ] **Step 1: Add `gender` and `avatar` to `User` interface in `types/index.ts`**

Find the `User` interface (currently ends with `responsibilityArea?: string`). Add two fields:

```ts
export interface User {
  // ... existing fields ...
  responsibilityArea?: string
  gender?: 'male' | 'female' | 'other'
  avatar?: string
}
```

`avatar` is already in the interface — only add `gender` if missing.

- [ ] **Step 2: Add `gender` and `avatar` to `ProjectMember` in `types/project.ts`**

```ts
export interface ProjectMember {
  id: string
  first_name: string
  last_name: string
  position: string
  department_name?: string
  role: ProjectMemberRole
  joined_at?: string
  description?: string
  gender?: 'male' | 'female' | 'other'
  avatar?: string
}
```

- [ ] **Step 3: Commit**

```bash
git add types/index.ts types/project.ts
git commit -m "feat: add gender and avatar fields to User and ProjectMember types"
```

---

## Task 3: Backend — expose `gender` and `avatar` in auth responses

**Files:**
- Modify: `backend/src/routes/auth.js`

The file has three places that return user objects: `/register` response, `/login` response, and `/me` response.

- [ ] **Step 1: Add `gender` and `avatar` to `/login` SQL query**

Find the login query (around line 71):
```js
`SELECT u.*, d.name as department_name, d.manager_id as department_manager_id
 FROM users u
 LEFT JOIN departments d ON u.department_id = d.id
 WHERE u.email = $1`
```
`u.*` already selects all columns, so `gender` and `avatar` are included. No SQL change needed.

Add `avatar` and `gender` to the response object (around line 109-128):
```js
res.json({
  token,
  user: {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    middleName: user.middle_name,
    position: user.position,
    department: user.department_name,
    departmentId: user.department_id,
    phone: user.phone,
    birthDate: user.birth_date,
    hireDate: user.hire_date,
    status: user.status,
    role: user.role,
    managerId: user.manager_id,
    subordinates,
    gender: user.gender,
    avatar: user.avatar,
  },
})
```

- [ ] **Step 2: Add `gender` and `avatar` to `/me` response**

Find the `/me` handler (around line 159-174). Add to the `res.json({...})` call:
```js
res.json({
  id: user.id,
  email: user.email,
  firstName: user.first_name,
  lastName: user.last_name,
  middleName: user.middle_name,
  position: user.position,
  department: user.department_name,
  departmentId: user.department_id,
  phone: user.phone,
  birthDate: user.birth_date,
  hireDate: user.hire_date,
  status: user.status,
  role: user.role,
  managerId: user.manager_id,
  gender: user.gender,
  avatar: user.avatar,
})
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/auth.js
git commit -m "feat: include gender and avatar in auth API responses"
```

---

## Task 4: Backend — expose `gender` and `avatar` in users responses

**Files:**
- Modify: `backend/src/routes/users.js`

- [ ] **Step 1: Add `u.gender`, `u.avatar` to `GET /users` SQL (around line 75)**

Find the SELECT in `GET /` (list all users). Add two fields:
```sql
SELECT
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.middle_name,
  u.position,
  u.department_id,
  d.name as department_name,
  u.phone,
  u.hire_date,
  u.status,
  u.role,
  u.manager_id,
  u.gender,
  u.avatar,
  m.first_name || ' ' || m.last_name as manager_name
FROM users u
```

- [ ] **Step 2: Add `u.gender`, `u.avatar` to `GET /users/:id` SQL (around line 124)**

Find the SELECT in `GET /:id`. Add two fields to the SELECT list:
```sql
SELECT
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.middle_name,
  u.position,
  u.department_id,
  d.name as department_name,
  u.phone,
  u.birth_date,
  u.hire_date,
  u.status,
  u.role,
  u.manager_id,
  u.responsibility_area,
  u.gender,
  u.avatar,
  ...
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/users.js
git commit -m "feat: include gender and avatar in users API responses"
```

---

## Task 5: Backend — expose `gender` and `avatar` in project members responses

**Files:**
- Modify: `backend/src/routes/projects.js`

- [ ] **Step 1: Add `u.gender`, `u.avatar` to `getProjectWithMembers` helper (around line 28)**

Find the `membersResult` query. Add two fields to the SELECT:
```sql
SELECT
  m.role,
  m.joined_at,
  m.description,
  u.id,
  u.first_name,
  u.last_name,
  u.position,
  u.gender,
  u.avatar,
  d.name AS department_name
FROM company_project_members m
JOIN users u ON m.user_id = u.id
LEFT JOIN departments d ON u.department_id = d.id
WHERE m.project_id = $1
ORDER BY
  CASE m.role WHEN 'lead' THEN 0 ELSE 1 END,
  u.last_name
```

- [ ] **Step 2: Add `gender` and `avatar` to projects list `json_build_object` (around line 60-85)**

Find the `GET /` route that uses `json_agg(json_build_object(...))`. Add `gender` and `avatar` to the object:
```sql
json_build_object(
  'id', u.id,
  'first_name', u.first_name,
  'last_name', u.last_name,
  'position', u.position,
  'role', m.role,
  'gender', u.gender,
  'avatar', u.avatar
)
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/projects.js
git commit -m "feat: include gender and avatar in project members responses"
```

---

## Task 6: Backend — expose `gender` and `avatar` in departments response

**Files:**
- Modify: `backend/src/routes/departments.js` (if it returns employees with a SELECT)

- [ ] **Step 1: Find the departments employee query**

Check `backend/src/routes/departments.js` — find the query that returns employee rows. Add `u.gender` and `u.avatar` to the SELECT if they're not already there.

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/departments.js
git commit -m "feat: include gender and avatar in departments API response"
```

---

## Task 7: Update `authStore` to map `gender` and `avatar`

**Files:**
- Modify: `store/authStore.ts`

- [ ] **Step 1: Add `gender` and `avatar` to `checkAuth` mapping (around line 41-57)**

```ts
set({
  user: {
    id: data.id.toString(),
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    middleName: data.middleName,
    position: data.position,
    department: data.department,
    departmentId: data.departmentId?.toString(),
    phone: data.phone,
    birthDate: data.birthDate,
    hireDate: data.hireDate,
    status: data.status,
    role: data.role,
    managerId: data.managerId?.toString(),
    subordinates: data.subordinates?.map((id: number) => id.toString()),
    gender: data.gender,
    avatar: data.avatar,
  },
  isAuthenticated: true,
  token,
  loading: false,
})
```

- [ ] **Step 2: Add `gender` and `avatar` to `login` mapping (around line 91-107)**

Same addition in the `login` handler's `set({user: {...}})` call.

- [ ] **Step 3: Commit**

```bash
git add store/authStore.ts
git commit -m "feat: map gender and avatar fields in authStore"
```

---

## Task 8: Create `lib/avatar.ts` utility

**Files:**
- Create: `lib/avatar.ts`

- [ ] **Step 1: Create the file**

```ts
import { createAvatar } from '@dicebear/core'
import { notionists, notionistsNeutral } from '@dicebear/collection'

const MALE_HAIR = ['short01', 'short02', 'short03', 'short04', 'fonze', 'full', 'mohawk', 'mrT']
const FEMALE_HAIR = ['long01', 'long02', 'long03', 'long04', 'long05', 'bangs01', 'bangs02', 'buns', 'wavy', 'curly']

export function generateAvatarUrl(userId: string, gender?: 'male' | 'female' | 'other'): string {
  if (!gender || gender === 'other') {
    const svg = createAvatar(notionistsNeutral, { seed: userId }).toString()
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
  }

  const hair = gender === 'male' ? MALE_HAIR : FEMALE_HAIR
  const svg = createAvatar(notionists, { seed: userId, hair }).toString()
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}
```

- [ ] **Step 2: Run typecheck to verify**

```bash
cd /c/code/worker-cabinet
npm run typecheck
```

Expected: no errors in `lib/avatar.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/avatar.ts
git commit -m "feat: add generateAvatarUrl utility using DiceBear Notionists"
```

---

## Task 9: Update `Header.tsx` and `Profile.tsx` Avatar rendering

**Files:**
- Modify: `components/layout/Header.tsx`
- Modify: `pages/Profile.tsx`

### Header.tsx

- [ ] **Step 1: Update imports**

Add `AvatarImage` to imports and import `generateAvatarUrl`:
```ts
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/Avatar'
import { generateAvatarUrl } from '@/lib/avatar'
```

- [ ] **Step 2: Replace the Avatar block**

Find:
```tsx
<Avatar className="h-10 w-10 ring-2 ring-primary/20 hover:ring-primary/40 transition-all cursor-pointer">
  <AvatarFallback className="gradient-primary text-white text-sm font-semibold">
    {getUserInitials()}
  </AvatarFallback>
</Avatar>
```

Replace with:
```tsx
<Avatar className="h-10 w-10 ring-2 ring-primary/20 hover:ring-primary/40 transition-all cursor-pointer">
  <AvatarImage
    src={user.avatar || generateAvatarUrl(user.id, user.gender)}
    alt={`${user.firstName} ${user.lastName}`}
  />
  <AvatarFallback className="gradient-primary text-white text-sm font-semibold">
    {getUserInitials()}
  </AvatarFallback>
</Avatar>
```

### Profile.tsx

> Note: Profile.tsx Avatar will be fully implemented in Task 13 (with upload UI). Skip the Avatar block here for Profile.tsx — proceed directly to Task 13 for Profile changes.

- [ ] **Step 5: Run lint and typecheck**

```bash
cd /c/code/worker-cabinet && npm run lint && npm run typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add components/layout/Header.tsx pages/Profile.tsx
git commit -m "feat: show DiceBear avatar in Header and Profile"
```

---

## Task 10: Update `Employees.tsx` and `DepartmentDetail.tsx`

**Files:**
- Modify: `pages/Employees.tsx`
- Modify: `pages/DepartmentDetail.tsx`

Both pages use local `Employee` interfaces that need `gender` and `avatar` added.

### Employees.tsx

- [ ] **Step 1: Add `gender` and `avatar` to the `Employee` interface**

```ts
interface Employee {
  id: string
  first_name: string
  last_name: string
  middle_name?: string
  position: string
  department_name?: string
  phone?: string
  email: string
  status: 'active' | 'inactive' | 'on_leave'
  role: string
  gender?: 'male' | 'female' | 'other'
  avatar?: string
}
```

- [ ] **Step 2: Update imports**

```ts
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/Avatar'
import { generateAvatarUrl } from '@/lib/avatar'
```

- [ ] **Step 3: Find where AvatarFallback is rendered for each employee and replace**

Find the employee card Avatar block (search for `AvatarFallback` in the JSX). Replace with:
```tsx
<Avatar className="h-10 w-10">
  <AvatarImage
    src={employee.avatar || generateAvatarUrl(employee.id, employee.gender)}
    alt={`${employee.first_name} ${employee.last_name}`}
  />
  <AvatarFallback className={`bg-gradient-to-br ${getAvatarGradient(employee.id)} text-white text-sm font-semibold`}>
    {employee.first_name[0]}{employee.last_name[0]}
  </AvatarFallback>
</Avatar>
```

### DepartmentDetail.tsx

- [ ] **Step 4: Add `gender` and `avatar` to `Employee` interface**

```ts
interface Employee {
  id: number
  first_name: string
  last_name: string
  middle_name?: string
  position: string
  email: string
  phone?: string
  status: string
  role: string
  gender?: 'male' | 'female' | 'other'
  avatar?: string
}
```

- [ ] **Step 5: Update imports and Avatar rendering** (same pattern as Employees.tsx above)

- [ ] **Step 6: Run lint and typecheck**

```bash
cd /c/code/worker-cabinet && npm run lint && npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add pages/Employees.tsx pages/DepartmentDetail.tsx
git commit -m "feat: show DiceBear avatars in Employees and DepartmentDetail"
```

---

## Task 11: Update `EmployeeProfile.tsx`, `Projects.tsx`, `ProjectDetail.tsx`

**Files:**
- Modify: `pages/EmployeeProfile.tsx`
- Modify: `pages/Projects.tsx`
- Modify: `pages/ProjectDetail.tsx`

### EmployeeProfile.tsx

- [ ] **Step 1: Add `gender` and `avatar` to `EmployeeData` interface**

```ts
interface EmployeeData {
  // ... existing fields ...
  gender?: 'male' | 'female' | 'other'
  avatar?: string
}
```

- [ ] **Step 2: Update imports and replace Avatar block** (same pattern — `AvatarImage` with fallback to `generateAvatarUrl(employee.id, employee.gender)`)

### Projects.tsx and ProjectDetail.tsx

- [ ] **Step 3: Update imports in Projects.tsx and ProjectDetail.tsx** to include `AvatarImage` and `generateAvatarUrl`

- [ ] **Step 4: Replace Avatar blocks for project members** in both files

The `ProjectMember` type already has `gender` and `avatar` from Task 2. Use:
```tsx
<Avatar className="h-8 w-8">
  <AvatarImage
    src={member.avatar || generateAvatarUrl(member.id, member.gender)}
    alt={`${member.first_name} ${member.last_name}`}
  />
  <AvatarFallback className={`bg-gradient-to-br ${getAvatarColor(member.id)} text-white text-xs font-semibold`}>
    {member.first_name[0]}{member.last_name[0]}
  </AvatarFallback>
</Avatar>
```

- [ ] **Step 5: Run lint and typecheck**

```bash
cd /c/code/worker-cabinet && npm run lint && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add pages/EmployeeProfile.tsx pages/Projects.tsx pages/ProjectDetail.tsx
git commit -m "feat: show DiceBear avatars in EmployeeProfile, Projects, ProjectDetail"
```

---

## Task 12: Backend — add avatar upload endpoint

**Files:**
- Modify: `backend/src/middleware/upload.js`
- Modify: `backend/src/routes/users.js`
- Modify: `backend/src/server.js` (only if routes need registering — verify first)

### upload.js

- [ ] **Step 1: Add `uploadAvatar` multer instance to `backend/src/middleware/upload.js`**

Append to the file (after the existing `uploadTemplate` export):
```js
export const uploadAvatar = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Допустимы только изображения JPEG, PNG, WEBP'))
    }
  },
})
```

### users.js

- [ ] **Step 2: Add imports to `backend/src/routes/users.js`**

`uploadToS3` and `getS3FileUrl` are confirmed exports in `backend/src/config/s3.js`. At the top of `users.js`, add:
```js
import { uploadAvatar } from '../middleware/upload.js'
import { uploadToS3, getS3FileUrl } from '../config/s3.js'
```

- [ ] **Step 3: Add `POST /me/avatar` route to `backend/src/routes/users.js`**

Add this route before the `GET /:id` route (so `/me/avatar` is not accidentally matched as `/:id`):

```js
router.post('/me/avatar', authenticateToken, uploadAvatar.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' })
    }

    const userId = req.user.id
    const ext = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg')
    const key = `avatars/${userId}/${Date.now()}.${ext}`

    await uploadToS3(req.file, key)
    const avatarUrl = getS3FileUrl(key)

    await query('UPDATE users SET avatar = $1 WHERE id = $2', [avatarUrl, userId])

    res.json({ avatar: avatarUrl })
  } catch (error) {
    console.error('Error uploading avatar:', error)
    res.status(500).json({ error: 'Не удалось загрузить фото' })
  }
})
```

- [ ] **Step 4: Restart backend and test with curl**

```bash
# Start backend in another terminal: cd backend && npm run dev
curl -X POST http://localhost:5000/api/users/me/avatar \
  -H "Authorization: Bearer <token>" \
  -F "avatar=@/path/to/test.jpg"
```

Expected: `{"avatar":"http://localhost:9000/worker-cabinet-docs/avatars/1/..."}`

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/upload.js backend/src/routes/users.js
git commit -m "feat: add POST /api/users/me/avatar endpoint for photo upload"
```

---

## Task 13: Add photo upload UI to `Profile.tsx`

**Files:**
- Modify: `pages/Profile.tsx`

- [ ] **Step 1: Add state and handler for file upload**

Add to the top of the `Profile` component:
```ts
import { useRef } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { getAuthHeaders } from '@/lib/authHeaders'
import { API_BASE_URL } from '@/lib/api'
import { getErrorMessage } from '@/lib/utils'
```

Add state variables:
```ts
const [avatarUploading, setAvatarUploading] = useState(false)
const [avatarError, setAvatarError] = useState<string | null>(null)
const fileInputRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 2: Add upload handler**

```ts
const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return

  if (file.size > 5 * 1024 * 1024) {
    setAvatarError('Файл слишком большой (максимум 5 МБ)')
    return
  }

  setAvatarError(null)
  setAvatarUploading(true)
  try {
    const formData = new FormData()
    formData.append('avatar', file)
    const res = await fetch(`${API_BASE_URL}/users/me/avatar`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Ошибка загрузки')
    }
    const data = await res.json()
    updateUser({ avatar: data.avatar })  // updateUser is confirmed in store/authStore.ts
  } catch (err: unknown) {
    setAvatarError(getErrorMessage(err))
  } finally {
    setAvatarUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
}
```

- [ ] **Step 3: Replace Avatar block with interactive upload UI**

Replace the static Avatar block from Task 9 with:
```tsx
<div className="relative mx-auto w-24 h-24">
  <Avatar className="h-24 w-24">
    <AvatarImage
      src={user.avatar || generateAvatarUrl(user.id, user.gender)}
      alt={`${user.firstName} ${user.lastName}`}
    />
    <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
      {getUserInitials()}
    </AvatarFallback>
  </Avatar>
  <button
    type="button"
    onClick={() => fileInputRef.current?.click()}
    disabled={avatarUploading}
    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
    aria-label="Изменить фото"
  >
    {avatarUploading
      ? <Loader2 className="h-6 w-6 text-white animate-spin" />
      : <Camera className="h-6 w-6 text-white" />
    }
  </button>
  <input
    ref={fileInputRef}
    type="file"
    accept="image/jpeg,image/png,image/webp"
    className="hidden"
    onChange={handleAvatarChange}
  />
</div>
{avatarError && (
  <p className="text-xs text-destructive text-center mt-1">{avatarError}</p>
)}
```

- [ ] **Step 4: Run lint and typecheck**

```bash
cd /c/code/worker-cabinet && npm run lint && npm run typecheck
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add pages/Profile.tsx
git commit -m "feat: add avatar photo upload UI to Profile page"
```

---

## Task 14: Final verification

- [ ] **Step 1: Run full lint + typecheck**

```bash
cd /c/code/worker-cabinet && npm run lint && npm run typecheck
```

Expected: 0 errors, 0 warnings

- [ ] **Step 2: Start dev server and verify visually**

```bash
npm run dev
```

Check:
1. Header shows Notionists avatar for logged-in user
2. `/employees` page shows Notionists avatars in the employee list
3. `/employees/:id` page shows Notionists avatar
4. `/departments/:id` shows Notionists avatars for members
5. `/projects/:id` shows Notionists avatars for project members
6. `/profile` — hover over avatar shows camera icon
7. Upload a photo on `/profile` — avatar changes to the uploaded photo

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: avatar integration cleanup"
```
