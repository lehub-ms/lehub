import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { Button } from '@lehub/shared/components/Button'
import { SearchField } from '@/components/data/SearchField'
import { PersonAvatar } from '@/components/people/PersonAvatar'
import { SidePanel } from '@/components/overlays/SidePanel'
import {
  ApiError,
  MAX_SEARCH_RESULTS,
  MIN_SEARCH_LENGTH,
  searchAccounts,
  type Account,
} from '@/lib/api'
import { fold } from '@/lib/referenceFilters'

interface AccountPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** « Sélectionnez un compte LeHub existant » — le prérequis, dit dès l'en-tête. */
  subtitle: string
  /** Les adresses déjà habilitées dans le périmètre courant, pour ne pas les proposer deux fois. */
  designatedEmails: readonly string[]
  /** Désigne le compte. Rendre une erreur la laisse s'afficher dans la ligne concernée. */
  onDesignate: (account: Account) => Promise<void>
  restoreFocusTo?: RefObject<HTMLElement | null>
}

type Search =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'success'; accounts: Account[]; truncated: boolean; query: string }

/** Le temps qu'on laisse à une frappe avant d'interroger le serveur. */
const DEBOUNCE_MS = 250

/**
 * Le tiroir qui cherche un compte LeHub et le désigne.
 *
 * **Il ne montre rien tant qu'on n'a rien tapé**, et c'est la règle de la Feature plutôt qu'une
 * économie de requête : le backoffice ne donne pas accès à l'annuaire des inscrits. La longueur
 * minimale est annoncée dans le panneau avant d'être refusée par le serveur — l'un et l'autre
 * lisent `MIN_SEARCH_LENGTH`, donc ils ne peuvent pas diverger.
 *
 * Le piège à focus, la fermeture par Échap et par le fond viennent de `SidePanel`, donc de
 * Radix : les réécrire ici serait prendre le risque d'en oublier un, et celui qu'on oublie ne se
 * voit pas à l'œil.
 *
 * Les comptes déjà habilités sont **marqués, pas cachés** : quelqu'un qui cherche une personne
 * déjà désignée doit apprendre qu'elle l'est, et non conclure que son compte n'existe pas. Le
 * recoupement se fait ici, sur la liste que l'écran tient déjà, plutôt qu'en disant au serveur
 * quel périmètre on regarde.
 */
export function AccountPicker({
  open,
  onOpenChange,
  title,
  subtitle,
  designatedEmails,
  onDesignate,
  restoreFocusTo,
}: AccountPickerProps): ReactNode {
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<Search>({ status: 'idle' })
  const [pending, setPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ email: string; message: string } | null>(null)

  /* Une session par ouverture : rouvrir le tiroir ne doit pas rendre les résultats de la fois
     précédente, qui portaient sur un périmètre peut-être différent. Ajusté au rendu, le patron
     que React documente pour dériver un état d'une valeur qui change. */
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    setQuery('')
    setSearch({ status: 'idle' })
    setFailure(null)
  }

  const trimmed = query.trim()
  const searchable = trimmed.length >= MIN_SEARCH_LENGTH

  useEffect(() => {
    if (!open || !searchable) return

    let cancelled = false
    const timer = setTimeout(() => {
      setSearch({ status: 'loading' })
      searchAccounts(trimmed)
        .then((result) => {
          if (!cancelled) {
            setSearch({ status: 'success', ...result, query: trimmed })
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) setSearch({ status: 'error', error })
        })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, searchable, trimmed])

  /* Sous la longueur minimale, on revient à l'indice plutôt que de garder à l'écran des
     résultats qui ne correspondent plus à ce qui est écrit. */
  const shown: Search = searchable ? search : { status: 'idle' }

  const designated = new Set(designatedEmails.map((email) => fold(email)))

  async function designate(account: Account): Promise<void> {
    setPending(account.email)
    setFailure(null)
    try {
      await onDesignate(account)
    } catch (cause) {
      setFailure({ email: account.email, message: refusal(cause) })
    } finally {
      setPending(null)
    }
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={subtitle}
      restoreFocusTo={restoreFocusTo}
      footer={
        <>
          <span className="flex-1" />
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            Terminé
          </Button>
        </>
      }
    >
      <SearchField
        label="Rechercher un compte LeHub"
        placeholder="Nom ou e-mail…"
        value={query}
        onChange={setQuery}
      />

      {/* `aria-live` : les résultats arrivent après la frappe, sans changement de focus.
          Personne ne doit avoir à explorer la page pour savoir s'il y en a. */}
      <div aria-live="polite" className="mt-4">
        {shown.status === 'idle' ? (
          <p className="text-[0.9375rem] text-ink-muted">
            Tapez au moins {MIN_SEARCH_LENGTH} caractères pour rechercher un compte LeHub.
          </p>
        ) : null}

        {shown.status === 'loading' ? (
          <p className="text-[0.9375rem] text-ink-muted">Recherche…</p>
        ) : null}

        {shown.status === 'error' ? (
          <p role="alert" className="text-[0.9375rem] text-[#b91c1c]">
            La recherche a échoué. Réessayez dans un instant.
          </p>
        ) : null}

        {shown.status === 'success' ? (
          shown.accounts.length === 0 ? (
            <p className="text-[0.9375rem] text-ink-muted">
              Aucun compte LeHub ne correspond à «&nbsp;{shown.query}&nbsp;».
            </p>
          ) : (
            <>
              {shown.truncated ? (
                // Le dépassement est signalé, jamais tronqué en silence (#157).
                <p className="mb-3 rounded-lg bg-primary-xs px-3 py-2 text-[0.8125rem] text-ink-body">
                  Plus de {MAX_SEARCH_RESULTS} comptes correspondent. Précisez votre recherche.
                </p>
              ) : null}
              <ul className="flex flex-col gap-1">
                {shown.accounts.map((account) => {
                  const already = designated.has(fold(account.email))
                  const name = `${account.givenName} ${account.surname}`

                  return (
                    <li
                      key={account.email}
                      className="flex items-center gap-3 rounded-xl px-2 py-2"
                    >
                      <PersonAvatar person={account} size={34} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold text-ink">{name}</span>
                        <span className="truncate text-[0.8125rem] text-ink-muted">
                          {account.email}
                        </span>
                        {failure?.email === account.email ? (
                          <span role="alert" className="mt-0.5 text-[0.8125rem] text-[#b91c1c]">
                            {failure.message}
                          </span>
                        ) : null}
                      </span>
                      {already ? (
                        <span className="shrink-0 rounded-full bg-primary-xs px-2.5 py-1 text-xs font-semibold text-primary">
                          Déjà désigné
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          disabled={pending !== null}
                          aria-label={`Ajouter ${name}`}
                          onClick={() => {
                            void designate(account)
                          }}
                        >
                          {pending === account.email ? 'Ajout…' : 'Ajouter'}
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )
        ) : null}
      </div>

      {/* Toujours présent, résultats ou non : la question « pourquoi je ne la trouve pas ? » se
          pose avant que la recherche ne rende rien, et sa réponse ne dépend pas du résultat. */}
      <p className="mt-6 border-t border-slate-200 pt-4 text-[0.8125rem] text-ink-muted">
        Vous ne trouvez pas la personne ? Son compte LeHub n’existe pas encore : demandez-lui de
        créer un compte sur <strong className="font-semibold text-ink-body">lehub.ms</strong>,
        puis revenez l’ajouter ici.
      </p>
    </SidePanel>
  )
}

/**
 * Ce qu'on dit d'un refus de désignation.
 *
 * Les deux refus métier de l'API portent chacun leur code parce que l'écran a une phrase
 * différente à composer — c'est ce que dit l'en-tête d'`api/src/lib/designationResponses.ts`,
 * et les replier tous sur « réessayez » rendrait ce contrat inutile.
 *
 * `ALREADY_DESIGNATED` n'est pas théorique : la liste repasse « en cours » le temps d'une
 * relecture, donc les puces « Déjà désigné » s'effacent brièvement et un second clic sur la même
 * personne est possible. « Réessayez » y serait un conseil qui ne peut jamais aboutir.
 */
function refusal(cause: unknown): string {
  if (!(cause instanceof ApiError)) return 'La désignation a échoué. Réessayez dans un instant.'

  switch (cause.code) {
    case 'ALREADY_DESIGNATED':
      return 'Cette personne est déjà désignée sur ce périmètre.'
    case 'ACCOUNT_NOT_FOUND':
      // Le compte a disparu entre la recherche et la désignation. Rare, mais le dire vaut mieux
      // que d'envoyer réessayer sur quelque chose qui n'existe plus.
      return 'Cette personne n’a plus de compte LeHub.'
    default:
      return cause.status === 403
        ? 'Vous n’êtes plus autorisé à désigner sur ce périmètre.'
        : 'La désignation a échoué. Réessayez dans un instant.'
  }
}
