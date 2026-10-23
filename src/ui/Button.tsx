import type { ButtonHTMLAttributes } from 'react';

type Variant = 'default' | 'primary' | 'danger' | 'link';

const base = 'inline-flex items-center justify-center rounded font-medium leading-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<Variant, string> = {
  default: 'border border-ink-soft bg-sheet px-3.5 py-2.5 text-[0.8125rem] text-ink hover:enabled:bg-[#EEF1EF]',
  primary: 'border border-ink bg-ink px-[18px] py-3 text-[0.9375rem] text-white hover:enabled:bg-ink-hover',
  danger: 'border border-bad bg-sheet px-3.5 py-2.5 text-[0.8125rem] text-bad hover:enabled:bg-bad-tint',
  link: 'px-0 py-1 text-[0.8125rem] text-focus underline underline-offset-2',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** Shared button so every screen gets the same four styles without repeating class strings. */
export function Button({ variant = 'default', className = '', ...props }: Props) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}