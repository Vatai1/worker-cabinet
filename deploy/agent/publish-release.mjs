import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { validateRelease } from '../../backend/src/deployment/validation.js'

const [version, commit, frontend, backend, destination] = process.argv.slice(2)
if (!destination) throw new Error('Укажите версию, коммит, репозитории фронтенда и бэкенда, путь к манифесту')
const digest = image => {
  const manifest = JSON.parse(execFileSync('docker', ['buildx', 'imagetools', 'inspect', '--format', '{{json .Manifest}}', `${image}:${version}`], { encoding: 'utf8', timeout: 120000 }))
  const value = manifest.digest
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error('Не удалось получить digest опубликованного образа')
  return `${image}@${value}`
}
const release = validateRelease({ version, commit, frontend: digest(frontend), backend: digest(backend) }, { frontend, backend })
await mkdir(path.dirname(destination), { recursive: true })
await writeFile(destination, `${JSON.stringify(release, null, 2)}\n`, { flag: 'wx' })
console.log(`Манифест релиза сохранён: ${destination}`)
