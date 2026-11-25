import { readFile, writeFile, rename } from 'node:fs/promises'
import { validateRelease } from '../../backend/src/deployment/validation.js'

const [manifestFile, catalogFile, frontend, backend] = process.argv.slice(2)
if (!backend) throw new Error('Укажите манифест, каталог, разрешённые репозитории фронтенда и бэкенда')
const release = validateRelease(JSON.parse(await readFile(manifestFile, 'utf8')), { frontend, backend })
const catalog = await readFile(catalogFile, 'utf8').then(JSON.parse, error => { if (error.code === 'ENOENT') return []; throw error })
if (!Array.isArray(catalog)) throw new Error('Каталог должен содержать массив релизов')
const existing = catalog.find(item => item.version === release.version)
if (existing && ['commit', 'frontend', 'backend'].some(key => existing[key] !== release[key])) throw new Error('Нельзя заменить опубликованную версию другим образом')
if (!existing) catalog.unshift(release)
await writeFile(`${catalogFile}.tmp`, `${JSON.stringify(catalog, null, 2)}\n`)
await rename(`${catalogFile}.tmp`, catalogFile)
console.log(`Релиз ${release.version} доступен для обновления`)
