import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Tone = 'info' | 'error' | 'success'

const TONES: Record<Tone, string> = {
  info: 'border-cta/20 bg-cta/8 text-[#075985]',
  error: 'border-[#b91c1c]/20 bg-[#b91c1c]/6 text-[#991b1b]',
  success: 'border-[#047857]/20 bg-[#047857]/8 text-[#065f46]',
}

const ICONS: Record<Tone, typeof Info> = {
  info: Info,
  error: AlertCircle,
  success: CheckCircle2,
}

/**
 * Le message de niveau formulaire — ce que le tenant a refusé, ou ce qu'il a confirmé.
 *
 * `role="alert"` sur les tons qui portent un refus : ils apparaissent en réponse à une
 * soumission et doivent être annoncés. Le ton informatif, lui, est présent au chargement et
 * n'a rien à interrompre.
 */
export function Alert({ tone, children }: { tone: Tone; children: ReactNode }): ReactNode {
  const Icon = ICONS[tone]
  return (
    <div
      role={tone === 'info' ? undefined : 'alert'}
      className={cn(
        'mb-5 flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-[0.8125rem] leading-normal',
        TONES[tone],
      )}
    >
      <Icon aria-hidden="true" className="mt-px size-[18px] shrink-0" />
      <span>{children}</span>
    </div>
  )
}
