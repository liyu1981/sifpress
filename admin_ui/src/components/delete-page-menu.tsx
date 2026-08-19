import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ApiError } from 'ui-sdk';
import { pagesApi } from 'ui-sdk';

/**
 * Delete-page flow with an inline dropdown confirm: the trigger renders
 * `children`; clicking it opens a small menu with the confirmation and a
 * Delete button. On confirm the page is deleted and a toast reports the
 * result; the menu stays open (with a spinner) until the request settles,
 * then `onDeleted` runs so the caller can navigate or refresh.
 */
export function DeletePageMenu({
  pageId,
  title,
  onDeleted,
  children,
}: {
  pageId: number;
  title: string;
  onDeleted?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const remove = useMutation({
    mutationFn: () => pagesApi.remove(pageId),
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      queryClient.invalidateQueries({ queryKey: ['page', title] });
      toast.success(t('editor.deleteSuccess'));
      onDeleted?.();
    },
    onError: error => {
      setOpen(false);
      toast.error(
        error instanceof ApiError && error.data.error ? error.data.error : t('editor.deleteFailed'),
      );
    },
  });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2">
        <p className="px-1 text-sm font-medium">{t('editor.deleteDialogTitle')}</p>
        <p className="mt-1 px-1 text-xs text-muted-foreground">
          {t('editor.deleteDialogMessage', { title })}
        </p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={remove.isPending}
          >
            {t('editor.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {t('editor.deleteConfirm')}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
