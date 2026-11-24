const raw = import.meta.glob('./svg/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const ICON_NAMES = [
  'read',
  'download',
  'cloud-off',
  'refresh',
  'retry',
  'search',
  'close',
  'filter-all',
  'filter-saved',
  'library',
  'settings',
  'back',
  'toc',
  'typography',
  'font-smaller',
  'font-larger',
  'line-height',
  'theme-light',
  'theme-sepia',
  'theme-dark',
  'trash',
  'trash-all',
  'progress-clear',
  'export',
  'import',
  'confirm',
  'update',
  'donate',
  'copy',
  'send',
  'request',
  'sliders',
  'saved',
] as const

export type IconName = (typeof ICON_NAMES)[number]

export function Icon(p: { name: IconName; class?: string }) {
  return (
    <span
      class={`inline-flex size-6 shrink-0 [&>svg]:size-full ${p.class ?? ''}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: raw[`./svg/${p.name}.svg`] }}
    />
  )
}

type Variant = 'plain' | 'primary' | 'danger'

const VARIANT: Record<Variant, string> = {
  // No text colour here: the icon inherits from its container (body is text-ink; the reader sets its own).
  plain: 'hover:bg-surface-2',
  primary: 'bg-accent text-on-accent shadow-sm hover:brightness-110',
  danger: 'text-danger hover:bg-danger-soft',
}

const BASE =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 transition duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100'
const ICON_BTN = 'min-w-11 rounded-full'
const TEXT_BTN = 'px-4 rounded-full'

interface ButtonProps {
  icon: IconName
  label: string
  onClick?: (e: MouseEvent) => void
  disabled?: boolean
  variant?: Variant
  pressed?: boolean
  class?: string
  type?: 'button' | 'submit'
}

export function IconButton(p: ButtonProps) {
  return (
    <button
      type={p.type ?? 'button'}
      aria-label={p.label}
      title={p.label}
      aria-pressed={p.pressed}
      disabled={p.disabled}
      onClick={p.onClick}
      class={`${BASE} ${ICON_BTN} ${VARIANT[p.variant ?? 'plain']} ${p.class ?? ''}`}
    >
      <Icon name={p.icon} />
    </button>
  )
}

export interface IconTextButtonProps extends ButtonProps {
  /** 'radio' makes the button a radio (aria-checked); otherwise it is a toggle (aria-pressed). */
  role?: 'radio'
  checked?: boolean
}

export function IconTextButton(p: IconTextButtonProps) {
  const radio = p.role === 'radio'
  return (
    <button
      type={p.type ?? 'button'}
      role={p.role}
      aria-checked={radio ? !!p.checked : undefined}
      aria-pressed={radio ? undefined : p.pressed}
      disabled={p.disabled}
      onClick={p.onClick}
      class={`${BASE} ${TEXT_BTN} ${VARIANT[p.variant ?? 'plain']} ${p.class ?? ''}`}
    >
      <Icon name={p.icon} />
      <span class="text-fluid-sm font-medium">{p.label}</span>
    </button>
  )
}
