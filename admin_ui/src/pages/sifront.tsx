import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { usePageTitle } from '@/hooks/use-page-title';
import { useAuth } from 'ui-sdk';
import { sifrontsApi, type SifrontListItem } from 'ui-sdk';

function formatDate(value: string, language: string): string {
  const date = new Date(value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function SifrontsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.permissions?.includes('settings.manage') ?? false;

  usePageTitle(t('sifront.title'));

  const list = useQuery({
    queryKey: ['sifronts'],
    queryFn: sifrontsApi.list,
  });

  const activate = useMutation({
    mutationFn: (id: number) => sifrontsApi.activate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sifronts'] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => sifrontsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sifronts'] }),
  });

  const sifronts = list.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('sifront.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('sifront.description')}</p>
        </div>
        {canManage && (
          <Button size="sm">
            <Plus className="mr-1 size-4" />
            {t('sifront.new')}
          </Button>
        )}
      </div>

      {list.isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!list.isLoading && sifronts.length === 0 && (
        <Card size="sm">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t('sifront.empty')}
          </CardContent>
        </Card>
      )}

      {sifronts.map((sf: SifrontListItem) => (
        <Card key={sf.id} size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {sf.name}
              {sf.is_active && <Badge variant="default">{t('sifront.active')}</Badge>}
            </CardTitle>
            <CardDescription>
              {t('sifront.version')} {sf.version} · {formatDate(sf.updated_at, i18n.language)}
            </CardDescription>
            {canManage && (
              <CardAction className="flex items-center gap-2">
                {!sf.is_active && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => activate.mutate(sf.id)}
                    disabled={activate.isPending}
                  >
                    {activate.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      t('sifront.activate')
                    )}
                  </Button>
                )}
                {!sf.is_active && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(t('sifront.deleteConfirm', { name: sf.name }))) {
                        remove.mutate(sf.id);
                      }
                    }}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </CardAction>
            )}
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
