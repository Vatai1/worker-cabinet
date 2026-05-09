import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { AddSkillModal } from '@/modules/skills/components/modals/AddSkillModal'
import { API_BASE_URL } from '@/shared/lib/api'
import { Wrench, Loader2, Plus, Trash } from 'lucide-react'

const SKILL_COLORS = [
  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
]

interface Props {
  skills: string[]
  userId: string
  isOwnProfile: boolean
  onSkillsChange: (skills: string[]) => void
}

export function SkillsCard({ skills, userId, isOwnProfile, onSkillsChange }: Props) {
  const [isAddSkillModalOpen, setIsAddSkillModalOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; skill: string } | null>(null)
  const [addingSkill, setAddingSkill] = useState(false)
  const [removingSkill, setRemovingSkill] = useState<string | null>(null)

  const handleAddSkill = async (skill: string) => {
    setAddingSkill(true)
    const newSkills = [...(skills || []), skill]
    onSkillsChange(newSkills)

    try {
      await fetch(`${API_BASE_URL}/users/${userId}/skills`, {
        method: 'POST',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ skill }),
      })
    } catch (err) {
      console.error('Failed to add skill:', err)
      onSkillsChange(skills)
    } finally {
      setAddingSkill(false)
    }
  }

  const handleRemoveSkill = async (skill: string) => {
    setRemovingSkill(skill)
    setContextMenu(null)
    const newSkills = skills?.filter(s => s !== skill) || []
    onSkillsChange(newSkills)

    try {
      await fetch(`${API_BASE_URL}/users/${userId}/skills`, {
        method: 'DELETE',
        headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ skill }),
      })
    } catch (err) {
      console.error('Failed to remove skill:', err)
      onSkillsChange(skills)
    } finally {
      setRemovingSkill(null)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, skill: string) => {
    e.preventDefault()
    if (!isOwnProfile) return

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      skill,
    })
  }

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu])

  return (
    <>
      <Card className="md:col-span-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              Навыки и компетенции
            </CardTitle>
            {isOwnProfile && (
              <Button size="sm" onClick={() => setIsAddSkillModalOpen(true)} disabled={addingSkill}>
                {addingSkill ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Добавить
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {skills && skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {skills.map((skill, i) => (
                <span
                  key={skill}
                  onContextMenu={(e) => handleContextMenu(e, skill)}
                  className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-transform hover:scale-105 cursor-pointer ${removingSkill === skill ? 'opacity-50' : ''} ${SKILL_COLORS[i % SKILL_COLORS.length]}`}
                >
                  {removingSkill === skill && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <EmptySection
              icon={<Wrench className="h-8 w-8 text-muted-foreground/40" />}
              text="Навыки не указаны"
            />
          )}
        </CardContent>
      </Card>

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            style={{ background: 'transparent' }}
          />
          <div
            className="fixed z-50 min-w-[200px] rounded-lg border bg-popover shadow-md animate-in fade-in zoom-in-95"
            style={{
              left: `${Math.min(contextMenu.x, window.innerWidth - 220)}px`,
              top: `${Math.min(contextMenu.y, window.innerHeight - 100)}px`,
            }}
          >
            <div className="p-1">
              <button
                onClick={() => handleRemoveSkill(contextMenu.skill)}
                disabled={removingSkill !== null}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md disabled:opacity-50"
              >
                {removingSkill ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
                Удалить навык
              </button>
            </div>
          </div>
        </>
      )}

      <AddSkillModal
        open={isAddSkillModalOpen}
        onClose={() => setIsAddSkillModalOpen(false)}
        onAdd={handleAddSkill}
        userId={userId}
      />
    </>
  )
}

function EmptySection({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-3">
        {icon}
      </div>
      <p className="text-muted-foreground text-sm">{text}</p>
    </div>
  )
}
