import { useEffect, useRef } from 'react';
import { createJSONEditor, Mode, type Content, type Validator } from 'vanilla-jsoneditor';
import 'vanilla-jsoneditor/themes/jse-theme-dark.css';
import { cn } from '@/lib/utils';

export type JsonEditorMode = Mode;

export function JsonEditor({
  initialValue,
  onChange,
  mode = Mode.text,
  readOnly = false,
  validator,
  className,
  id,
  ariaLabel,
}: {
  initialValue: unknown;
  onChange: (content: Content) => void;
  mode?: JsonEditorMode;
  readOnly?: boolean;
  validator?: Validator;
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReturnType<typeof createJSONEditor> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const validatorRef = useRef(validator);
  validatorRef.current = validator;

  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }

    const editor = createJSONEditor({
      target: containerRef.current,
      props: {
        content: { json: initialValue },
        mode,
        readOnly,
        validator,
        mainMenuBar: true,
        navigationBar: true,
        statusBar: true,
        ariaLabel,
        onChange: (updated: Content) => {
          onChangeRef.current(updated);
        },
      },
    });
    editorRef.current = editor;

    const applyThemeClass = () => {
      const dark = document.documentElement.classList.contains('dark');
      containerRef.current?.classList.toggle('jse-theme-dark', dark);
    };

    applyThemeClass();
    const observer = new MutationObserver(applyThemeClass);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
      void editor.destroy();
      editorRef.current = null;
    };
    // create once; updates flow through updateProps below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (editorRef.current === null) {
      return;
    }
    editorRef.current.updateProps({ mode, readOnly, validator });
  }, [mode, readOnly, validator]);

  return (
    <div
      ref={containerRef}
      id={id}
      className={cn(
        'jse-gray overflow-clip rounded-xl border border-input bg-background',
        className,
      )}
    />
  );
}

export function contentToJson(
  content: Content,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if ('json' in content) {
    return { ok: true, value: content.json };
  }

  const text = content.text.trim();

  if (text === '') {
    return { ok: false, error: 'empty' };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'invalid' };
  }
}
