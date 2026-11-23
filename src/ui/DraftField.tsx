import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createDraft } from './draft';

/**
 * Binds a text field to a stored value. Typing stays local and is saved on blur, when the
 * field unmounts (Escape, closing a sheet, switching tab) and when the app is hidden — the
 * last two never fire blur, which used to lose whatever was typed.
 */
export function useDraft(stored: string, save: (v: string) => unknown) {
  const draft = useRef(createDraft(stored)).current;
  const [, rerender] = useState(0);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(() => {
    const v = draft.take();
    if (v !== undefined) void saveRef.current(v);
  }, [draft]);

  useEffect(() => {
    if (draft.sync(stored)) rerender((n) => n + 1);
  }, [draft, stored]);

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  return {
    value: draft.value,
    onChange: (e: { target: { value: string } }) => {
      draft.edit(e.target.value);
      rerender((n) => n + 1);
    },
    onBlur: flush
  };
}

type Own = { stored: string; onSave: (v: string) => unknown };
type InputProps = Own & { multiline?: false } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'onBlur'>;
type AreaProps = Own & { multiline: true } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'onChange' | 'onBlur'>;

export function DraftField(props: InputProps | AreaProps) {
  const { stored, onSave, multiline, ...rest } = props;
  const bind = useDraft(stored, onSave);
  return multiline ? (
    <textarea {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} {...bind} />
  ) : (
    <input {...(rest as InputHTMLAttributes<HTMLInputElement>)} {...bind} />
  );
}
