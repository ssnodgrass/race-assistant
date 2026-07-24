import { InputHTMLAttributes, useEffect, useRef, useState } from 'react';

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'inputMode' | 'min' | 'onChange' | 'step' | 'type' | 'value'
>;

interface NonNegativeNumberInputProps extends NativeInputProps {
  value: number | string;
  onValueChange: (value: string) => void;
  decimal?: boolean;
}

export function isNonNegativeNumberDraft(value: string, decimal = false): boolean {
  return decimal ? /^\d*(?:\.\d*)?$/.test(value) : /^\d*$/.test(value);
}

export function NonNegativeNumberInput({
  value,
  onValueChange,
  decimal = false,
  onBlur,
  onFocus,
  ...props
}: NonNegativeNumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  return (
    <input
      {...props}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      pattern={decimal ? '[0-9]*[.]?[0-9]*' : '[0-9]*'}
      value={draft}
      onFocus={event => {
        focused.current = true;
        if (draft === '0') event.currentTarget.select();
        onFocus?.(event);
      }}
      onChange={event => {
        const next = event.target.value;
        if (!isNonNegativeNumberDraft(next, decimal)) return;
        setDraft(next);
        onValueChange(next);
      }}
      onBlur={event => {
        focused.current = false;
        setDraft(draft === '' ? String(value) : draft);
        onBlur?.(event);
      }}
    />
  );
}
