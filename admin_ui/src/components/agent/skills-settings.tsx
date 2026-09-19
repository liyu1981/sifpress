import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { type AgentSkill, listSkills, newSkillId, saveSkills } from '@/lib/agent/skills';

interface SkillDraft {
  id: string | null;
  name: string;
  description: string;
  content: string;
}

export function SkillsSettingsCard() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<AgentSkill[]>(() => listSkills());
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AgentSkill | null>(null);

  const persist = (next: AgentSkill[]) => {
    setSkills(next);
    saveSkills(next);
  };

  const openNew = () => setDraft({ id: null, name: '', description: '', content: '' });

  const openEdit = (skill: AgentSkill) =>
    setDraft({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      content: skill.content,
    });

  const handleSaveDraft = () => {
    if (draft === null) {
      return;
    }
    const name = draft.name.trim();
    if (name === '') {
      toast.error(t('agent.skillNameRequired'));
      return;
    }
    if (draft.id === null) {
      persist([
        ...skills,
        {
          id: newSkillId(),
          name,
          description: draft.description.trim(),
          content: draft.content,
          enabled: true,
        },
      ]);
    } else {
      persist(
        skills.map(skill =>
          skill.id === draft.id
            ? { ...skill, name, description: draft.description.trim(), content: draft.content }
            : skill,
        ),
      );
    }
    setDraft(null);
    toast.success(t('agent.skillsSaved'));
  };

  const handleDelete = () => {
    if (pendingDelete === null) {
      return;
    }
    persist(skills.filter(skill => skill.id !== pendingDelete.id));
    setPendingDelete(null);
    toast.success(t('agent.skillsSaved'));
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardAction>
          <Button size="sm" variant="outline" onClick={openNew}>
            <Plus />
            {t('agent.skillsAdd')}
          </Button>
        </CardAction>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="size-5 text-muted-foreground" />
          {t('agent.skillsTitle')}
        </CardTitle>
        <CardDescription>{t('agent.skillsDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {skills.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('agent.skillsEmpty')}</p>
        )}

        {skills.map(skill => (
          <div
            key={skill.id}
            className="flex items-start gap-3 rounded-xl border border-border/50 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{skill.name}</p>
              {skill.description !== '' && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {skill.description}
                </p>
              )}
            </div>
            <Switch
              checked={skill.enabled}
              onCheckedChange={enabled =>
                persist(
                  skills.map(candidate =>
                    candidate.id === skill.id ? { ...candidate, enabled } : candidate,
                  ),
                )
              }
              aria-label={skill.name}
            />
            <Button size="icon-sm" variant="ghost" onClick={() => openEdit(skill)}>
              <Pencil />
              <span className="sr-only">{t('agent.skillEditTitle')}</span>
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setPendingDelete(skill)}>
              <Trash2 />
              <span className="sr-only">{t('agent.skillDelete')}</span>
            </Button>
          </div>
        ))}
      </CardContent>

      <Dialog open={draft !== null} onOpenChange={open => !open && setDraft(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {draft?.id === null ? t('agent.skillNewTitle') : t('agent.skillEditTitle')}
            </DialogTitle>
          </DialogHeader>
          {draft !== null && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="skill-name">{t('agent.skillName')}</Label>
                <Input
                  id="skill-name"
                  value={draft.name}
                  onChange={event => setDraft({ ...draft, name: event.target.value })}
                  placeholder={t('agent.skillNamePlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-description">{t('agent.skillDescription')}</Label>
                <Input
                  id="skill-description"
                  value={draft.description}
                  onChange={event => setDraft({ ...draft, description: event.target.value })}
                  placeholder={t('agent.skillDescriptionPlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-content">{t('agent.skillContent')}</Label>
                <textarea
                  id="skill-content"
                  value={draft.content}
                  onChange={event => setDraft({ ...draft, content: event.target.value })}
                  placeholder={t('agent.skillContentPlaceholder')}
                  rows={10}
                  spellCheck={false}
                  className="min-h-40 w-full resize-y rounded-xl border border-input bg-background p-3 font-mono text-xs leading-5 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveDraft}>{t('agent.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={open => !open && setPendingDelete(null)}
        title={t('agent.skillDeleteTitle')}
        description={t('agent.skillDeleteDescription', { name: pendingDelete?.name ?? '' })}
        confirmLabel={t('agent.skillDelete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={handleDelete}
      />
    </Card>
  );
}
