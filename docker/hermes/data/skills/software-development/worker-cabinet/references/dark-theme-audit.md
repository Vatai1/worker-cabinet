# Dark Theme Audit Reference

## Architecture

The project uses a CSS-variable-based theming system:

- **Tailwind**: `darkMode: 'class'` in `tailwind.config.js` — toggles `.dark` class on `<html>`
- **CSS variables**: `index.css` defines `:root` (light) and `.dark` (dark) HSL variables: `--background`, `--foreground`, `--card`, `--primary`, `--border`, etc.
- **Theme toggle**: `shared/components/ThemeProvider.tsx` reads `darkMode` from `shared/store/uiStore.ts` (Zustand)
- **Persistence**: `darkMode` cookie (set by `shared/lib/cookies.ts`), auto-detects system preference via `prefers-color-scheme`
- **Settings UI**: `core/settings/pages/Settings.tsx` has a "Темная тема" toggle with Sun/Moon icons

## Common Problems

### 1. `bg-white` (26 files, ~120 occurrences)

The #1 dark theme bug. `bg-white` ignores CSS variables and stays white in dark mode.

**Fix**: Replace `bg-white` with `bg-card` (uses `--card` variable) or `bg-background` (uses `--background`).

**Affected files** (as of 2026-06-02):
- core/auth/pages/Login.tsx, core/employees/pages/Employees.tsx, EmployeeProfile.tsx
- core/admin/pages/AdminPanel.tsx, HRDictionaries.tsx, SettingFormElements.tsx
- modules/vacation/pages/Vacation.tsx, modules/projects/pages/Projects.tsx
- modules/documents/pages/Documents.tsx, modules/requests/pages/Requests.tsx
- modules/requests/pages/ManagerDashboard.tsx, LeaderDashboard.tsx
- modules/surveys/pages/Surveys.tsx, SurveyPage.tsx, SurveyBuilderModal.tsx
- modules/calendar/pages/CalendarPage.tsx, modules/departments/pages/Departments.tsx, DepartmentDetail.tsx
- modules/notifications/pages/Notifications.tsx, modules/onboarding/pages/Onboarding.tsx, HROnboarding.tsx
- modules/timesheet/pages/ManagerTimesheet.tsx
- shared/pages/Dashboard.tsx, HRPanel.tsx, shared/components/ui/Switch.tsx

### 2. Hardcoded hex colors in className (~50 occurrences)

Found in AdminPanel, ModuleSettingsModal, AuthSettings, HRHierarchy, SettingFormElements, CalendarSettings, VacationSettings, NotificationsSettings, ProjectRoadmap.

**Fix**: Replace with Tailwind semantic classes (`bg-primary`, `text-muted-foreground`, `border-border`) or add `dark:` variants.

### 3. Inline style colors (~55 occurrences)

Found in CalendarPage.tsx, ProjectRoadmap.tsx, ProjectDetail.tsx, SkillsCard.tsx.

**Fix**: Replace `style={{ color: '#...' }}` with CSS variable usage (`style={{ color: 'hsl(var(--primary))' }}`) or Tailwind classes.

### 4. Almost no `dark:` variants

Only `shared/pages/Dashboard.tsx` and `modules/skills/components/SkillsCard.tsx` use `dark:` prefix. Most components rely entirely on CSS variables, which is the right approach — just need to ensure no hardcoded colors bypass them.

## Affected Component Modals

Dark theme fixes also applied to vacation modals:
- **CreateVacationFormModal.tsx**: Alert/status boxes (enough-days, insufficient-days, restriction warnings) — `bg-emerald-50`/`bg-red-50`/`bg-amber-50` → `bg-[hsl(var(--success|destructive|warning)/0.1)]`
- **VacationDetailModal.tsx**: Intersection warnings (`bg-amber-50 border-amber-200`) and document reference box (`bg-blue-50 text-blue-900`) → CSS variable equivalents

## Browser Form Controls (index.css global fix)

Even when individual inputs have `bg-background text-foreground` classes, browser-native form controls often ignore them:

- **`<select>` dropdown** renders `<option>` items with OS-level styling that ignores Tailwind classes
- **`<input type="date">` / `<input type="time">`** calendar/clock icons stay light in dark mode
- **`<input>` / `<textarea>` placeholder** color may not follow theme

**Fix** — add to `index.css` `@layer base` block:

```css
input, textarea, select {
  @apply bg-background text-foreground;
}
input::placeholder, textarea::placeholder {
  @apply text-muted-foreground;
}
select option {
  @apply bg-card text-foreground;
}
input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(0);
}
.dark input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(1);
}
.dark input[type="time"]::-webkit-calendar-picker-indicator {
  filter: invert(1);
}
```

This was added in the 2026-06-02 dark theme fix session.

## Alert/Status Boxes

Avoid Tailwind's color-50 variants (`bg-emerald-50`, `bg-red-50`, `bg-amber-50`) with `dark:` overrides — the dark variants use low opacity and still appear washed out.

**Use project CSS variables instead** (auto-adapts to both themes):

```tsx
// ✅ Correct — uses CSS variables
<div className="bg-[hsl(var(--success)/0.1)] border border-[hsl(var(--success)/0.25)]">
  <span className="text-[hsl(var(--success))]">✅ Достаточно дней</span>
</div>

// ❌ Wrong — bg-emerald-50 stays white-ish in dark mode
<div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30">
```

Available semantic variables: `--success`, `--destructive`, `--warning`.

Pattern: `bg-[hsl(var(--variable)/0.1)]` for background, `border-[hsl(var(--variable)/0.25)]` for border, `text-[hsl(var(--variable))]` for text.

## Audit Technique

When asked to check dark theme:

1. Search for hardcoded colors: `bg-white`, `bg-gray-*`, `text-gray-*`, `border-gray-*`, hex in className, `rgba?(` in className, inline `style=` with color props
2. Take Playwright screenshots in dark mode:
   ```python
   import asyncio
   from playwright.async_api import async_playwright
   async with async_playwright() as p:
       browser = await p.chromium.launch(headless=True)
       page = await browser.new_page(viewport={"width": 1280, "height": 800})
       await page.goto("http://localhost:3000/login", wait_until="networkidle")
       await page.evaluate("document.documentElement.classList.add('dark')")
       await page.screenshot(path="/tmp/dark-page.png")
       await browser.close()
   ```
3. Login first, then navigate to each major page for screenshots
4. For vision analysis of screenshots, `vision_analyze` requires a model with vision support — may not be available on all providers

## Replacement Mapping (hex/rgba → CSS variable classes)

For admin modules and components with hardcoded dark-theme-only colors:

| Hardcoded | Tailwind class |
|-----------|---------------|
| `bg-[#0B0E14]` / `bg-[#11131A]` / `bg-[#161822]` | `bg-card` |
| `bg-[#11131A]/50` | `bg-secondary/50` |
| `border-[#252A3D]` / `border-[#1E2130]` | `border-border` |
| `text-[#E8E8ED]` / `text-[#FFFFFF]` | `text-foreground` |
| `text-[#6B7280]` | `text-muted-foreground` |
| `text-[#8B5CF6]` / `text-[#3B82F6]` | `text-primary` |
| `hover:bg-[#252A3D]` | `hover:bg-secondary` |
| `hover:text-[#EF4444]` | `hover:text-destructive` |
| `focus:border-[#8B5CF6]` | `focus:border-primary` |
| `focus:shadow-[...rgba(139,92,246,0.15)]` | `focus:ring-2 focus:ring-primary/20` |
| `hover:border-[#3B82F6]` | `hover:border-primary` |
| `hover:bg-[rgba(59,130,246,0.1)]` | `hover:bg-primary/10` |
| `hover:bg-[#8B5CF6]/10` | `hover:bg-primary/10` |
| `hover:bg-[#7C3AED]` | `hover:bg-primary/80` |
| `active:bg-[#6D28D9]` | `active:bg-primary` |
| `placeholder:text-[#6B7280]` | `placeholder:text-muted-foreground` |
| `style={{ backgroundColor: '#11131A' }}` | remove style, add `bg-secondary` |
| `style={{ backgroundColor: '#161822' }}` | remove style, add `bg-card` |

## Semantic vs Theme Colors (do NOT replace)

Some hardcoded colors represent categorical data and must stay the same in both themes:
- Department colors in hierarchy tree (`HRHierarchy.tsx`)
- Role indicator colors in admin panel (`AdminPanel.tsx`)
- Status colors for tasks/projects (green, amber, red in `ProjectDetail.tsx`, `ProjectRoadmap.tsx`)
- Priority color classes that already have `dark:` variants (e.g., `dark:bg-green-900/30 dark:text-green-300`)

## Quick Fix Script (bg-white → bg-card)

```bash
# Preview changes
grep -rn 'bg-white' --include='*.tsx' modules/ core/ shared/ | head -50

# Bulk replace (review each file after!)
find . -name '*.tsx' -not -path '*/node_modules/*' -exec sed -i '' 's/bg-white\\b/bg-card/g' {} +
npm run lint && npm run typecheck
```

CAUTION: Some `bg-white` usages may need `bg-background` instead of `bg-card` (e.g., the page wrapper). Review context.

## Playwright Screenshot Approach

When vision analysis API is unavailable on the current model, use Playwright headless to capture dark theme screenshots:

```python
import asyncio
from playwright.async_api import async_playwright
async with async_playwright() as p:
    browser = await p.chromium.launch(headless=True)
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    await page.goto("http://localhost:3000/login", wait_until="networkidle")
    await page.evaluate("document.documentElement.classList.add('dark')")
    await page.screenshot(path="/tmp/dark-page.png")
    await browser.close()
```

Install: `pip3 install playwright && python3 -m playwright install chromium`

Note: Hermes `execute_code` sandbox uses its own Python — packages installed system-wide via `pip3` won't be available in the sandbox.
