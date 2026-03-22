# User Avatars — Design Spec

**Date:** 2026-03-22
**Status:** Approved

## Overview

Generate unique, corporate-style illustrated avatars for every user using DiceBear Notionists (local npm package, no internet required). Users can optionally upload their own photo, which overrides the generated avatar.

## Requirements

1. Corporate style with illustrated characters (Notionists / Notionists Neutral)
2. Everything works fully offline — no external API calls
3. Each user gets a unique avatar deterministically generated from their `id`
4. Avatars match user gender
5. Users can upload a personal photo that replaces the generated avatar

## Tech Stack

- `@dicebear/core` + `@dicebear/collection` — installed as frontend npm dependencies
- MinIO — existing S3-compatible storage for uploaded photos
- PostgreSQL `users.avatar` — existing `VARCHAR(500)` column stores MinIO URL when a photo is uploaded
- PostgreSQL `users.gender` — existing column (`male` | `female` | `other`)

## Architecture

### Frontend

#### `lib/avatar.ts`

Single utility module. Exports one function:

```ts
generateAvatarUrl(userId: string, gender: 'male' | 'female' | 'other'): string
```

- Uses `@dicebear/core` `createAvatar()` with seed = `userId`
- `male` → style `notionists`, restricted to masculine hair options
- `female` → style `notionists`, restricted to feminine hair options
- `other` → style `notionistsNeutral`
- Returns `data:image/svg+xml;base64,...` URL — no network call, deterministic

#### Updated `Avatar` component usage

All places that render avatars follow this priority:
1. If `user.avatar` is set (MinIO URL) → render with `<AvatarImage src={user.avatar} />`
2. Otherwise → render with `<AvatarImage src={generateAvatarUrl(user.id, user.gender)} />`
3. `<AvatarFallback>` with initials remains as error fallback

Affected locations:
- `components/layout/Header.tsx` — current user avatar
- `pages/Profile.tsx` — profile page
- `pages/EmployeeProfile.tsx` — employee detail page
- `pages/Employees.tsx` — employee list
- `pages/Departments.tsx` / `pages/DepartmentDetail.tsx` — member lists
- HR panel pages (if they render user avatars)

#### Photo upload UI (`pages/Profile.tsx`)

- Avatar has a hover overlay with a camera icon ("Изменить фото")
- Click triggers a hidden `<input type="file" accept="image/*">`
- File size validated client-side: max 5 MB
- On select → `POST /api/users/me/avatar` (multipart/form-data)
- On success → update `authStore` user with the new `avatar` URL
- Loading spinner shown on avatar during upload

### Backend

#### `POST /api/users/me/avatar`

- Middleware: `authenticateToken`, `upload.single('avatar')` (multer, memory storage)
- Accepts: `image/jpeg`, `image/png`, `image/webp` — max 5 MB
- Uploads file to MinIO bucket using existing `uploadToS3(file, key)` from `backend/src/config/s3.js`
- Key format: `avatars/{userId}/{timestamp}.{ext}`
- URL stored in DB: constructed via `getS3FileUrl(key)` — direct public URL (`${S3_ENDPOINT}/${S3_BUCKET}/${key}`)
- Updates `users.avatar = <public MinIO URL>` for `req.user.id`
- Returns `{ avatar: '<url>' }`

No separate "delete avatar" endpoint in this iteration — resetting to generated avatar can be added later.

### TypeScript Types

Add `gender` to the `User` interface in `types/index.ts`:

```ts
gender?: 'male' | 'female' | 'other'
```

### Backend API responses

Ensure `gender` is included in all `/api/users/*` responses that return user objects (profile, employees list, employee detail).

## Data Flow

```
User loads page
  → user.avatar set?
    YES → <AvatarImage src={minioUrl} />
    NO  → generateAvatarUrl(id, gender) → SVG data URL → <AvatarImage src={dataUrl} />

User clicks "Изменить фото"
  → file picker → validate (type, size)
  → POST /api/users/me/avatar
  → MinIO upload → DB update
  → authStore.user.avatar = new URL
  → AvatarImage re-renders with photo
```

## Error Handling

- File too large / wrong type → client-side error message, no request sent
- Upload fails → toast error ("Не удалось загрузить фото"), avatar unchanged
- MinIO unavailable → 500 from backend, handled by frontend error state
- DiceBear generation never fails (deterministic, no I/O) → no error handling needed

## Out of Scope

- Avatar cropping / editing tool
- Deleting uploaded photo (reset to generated)
- Admin uploading avatars for other users
- Storing generated SVGs in MinIO
