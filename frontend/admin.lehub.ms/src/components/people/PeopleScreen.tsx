import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Plus, SearchX, Users } from 'lucide-react'
import { useAuth } from '@lehub/shared/auth/useAuth'
import { Button } from '@lehub/shared/components/Button'
import { EmptyState } from '@lehub/shared/components/EmptyState'
import { ErrorState } from '@lehub/shared/components/ErrorState'
import { DataTable, type Column } from '@/components/data/DataTable'
import { ResultCount } from '@/components/data/ResultCount'
import { SearchField } from '@/components/data/SearchField'
import { AccountPicker } from '@/components/people/AccountPicker'
import { PersonAvatar } from '@/components/people/PersonAvatar'
import { RemoveAction, type RemovalCopy } from '@/components/people/RemoveAction'
import type { ReferenceListState } from '@/hooks/useReferenceList'
import type { Account } from '@/lib/api'
import { fold, nextSort, searchEntries, sortEntries, type SortState } from '@/lib/referenceFilters'
import type { Word } from '@/lib/words'

type ColumnKey = 'name' | 'email'

interface PeopleScreenProps {
  /** « Organisateurs », « Administrateurs ». */
  title: string
  /** La puce de la communauté sur laquelle on travaille, quand l'écran en porte une. */
  titleSuffix?: ReactNode
  intro: string
  state: ReferenceListState<Account> & { refetch: () => void }
  /** « organisateur » / « organisateurs ». */
  noun: Word
  /** L'intitulé du bouton d'ajout — « Ajouter un organisateur ». */
  addLabel: string
  /** Le sous-titre du tiroir. */
  pickerSubtitle: string
  removalCopy: RemovalCopy
  emptyDescription: string
  errorTitle: string
  onDesignate: (email: string) => Promise<void>
  onRemove: (email: string) => Promise<void>
}

/**
 * L'écran que les organisateurs d'une communauté et les administrateurs globaux partagent.
 *
 * Écrit à côté de `ReferenceScreen` plutôt qu'au-dessus, et ce n'est pas de la duplication
 * évitable : celui-là exige `isArchived`, une portée de préférence de repli et un couple
 * d'adjectifs genrés, trois choses qui n'ont pas de sens ici. Une personne n'est ni active ni
 * archivée — elle est désignée ou elle ne l'est pas. Les primitives, elles, sont les mêmes :
 * `DataTable`, `SearchField`, `ResultCount`, `SidePanel`, `ConfirmDialog`.
 *
 * **Le tri et la recherche sont côté client**, sur la liste entière : une équipe d'organisation
 * compte quelques personnes, et un aller-retour par frappe serait plus lent qu'utile. C'est la
 * recherche de *comptes* du tiroir qui est serveur, parce qu'elle porte sur l'annuaire des
 * inscrits et non sur cette poignée d'entrées.
 *
 * Après chaque écriture, la liste est **relue** plutôt que rapiécée en mémoire : deux
 * désignations concurrentes rendraient la copie locale fausse, et le serveur fait foi.
 *
 * Aucune condition d'habilitation ici, et c'est délibéré : les deux écrans qui l'utilisent sont
 * montés sous une garde de route — `RequireGlobalAdmin` pour les administrateurs,
 * `CommunityScope` pour les organisateurs, qui ne laisse passer qu'une communauté que la session
 * peut piloter. Un `canWrite` serait vrai à chaque fois, donc une branche morte qui donnerait
 * l'illusion d'une protection. La vraie est côté serveur, et elle refuse à l'identique qu'un
 * bouton ait été masqué ou non.
 */
export function PeopleScreen({
  title,
  titleSuffix,
  intro,
  state,
  noun,
  addLabel,
  pickerSubtitle,
  removalCopy,
  emptyDescription,
  errorTitle,
  onDesignate,
  onRemove,
}: PeopleScreenProps): ReactNode {
  const { state: auth } = useAuth()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState<ColumnKey>>({
    key: 'name',
    direction: 'ascending',
  })
  const [picking, setPicking] = useState(false)
  /* Ce qui reprend le focus à la fermeture du tiroir. Capté au clic plutôt que par une `ref`
     sur `Button`, qui n'en accepte pas — même patron que `ReferenceScreen`. */
  const addButton = useRef<HTMLElement | null>(null)

  const entries = state.status === 'success' ? state.entries : null

  /* L'adresse de la session, repliée une fois : c'est elle qui décide du discours de la
     confirmation. Comparée sur l'adresse et non sur un identifiant, parce que c'est la seule
     clé d'une personne que ce contrat expose (#157). */
  const self = auth.status === 'authenticated' ? fold(auth.user?.email ?? '') : ''

  const visible = useMemo(() => {
    if (!entries) return []
    return sortEntries(
      searchEntries(entries, query, (person) => [
        `${person.givenName} ${person.surname}`,
        person.email,
      ]),
      sort,
      (person, key) => (key === 'email' ? person.email : `${person.surname} ${person.givenName}`),
    )
  }, [entries, query, sort])

  const designatedEmails = useMemo(() => (entries ?? []).map((person) => person.email), [entries])

  const designate = useCallback(
    async (account: Account) => {
      await onDesignate(account.email)
      state.refetch()
    },
    [onDesignate, state],
  )

  const searching = query.trim().length > 0

  const columns: readonly Column<Account, ColumnKey>[] = [
    {
      key: 'name',
      header: 'Nom',
      sortable: true,
      render: (person) => (
        <div className="flex items-center gap-3">
          <PersonAvatar person={person} size={36} />
          <strong className="font-semibold text-ink">
            {person.givenName} {person.surname}
          </strong>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'E-mail',
      sortable: true,
      render: (person) => <span className="text-ink-muted">{person.email}</span>,
    },
  ]

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold">{title}</h1>
            {titleSuffix}
          </div>
          <p className="mt-2 text-[0.9375rem] text-ink-muted">{intro}</p>
        </div>
        <Button
          onClick={(event) => {
            addButton.current = event.currentTarget
            setPicking(true)
          }}
        >
          <Plus aria-hidden="true" className="size-[18px]" />
          {addLabel}
        </Button>
      </header>

      {state.status === 'loading' ? (
        <p role="status" className="mt-8 text-[0.9375rem] text-ink-muted">
          Chargement…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div className="mt-8">
          <ErrorState title={errorTitle} error={state.error} onRetry={state.refetch} />
        </div>
      ) : null}

      {entries ? (
        entries.length === 0 ? (
          // Aucune désignation : distinct d'une recherche sans résultat, parce que ce n'est pas
          // le même problème et que la sortie n'est pas la même.
          <div className="mt-8">
            <EmptyState
              icon={Users}
              title={`Aucun ${noun.one} pour le moment`}
              description={emptyDescription}
              action={{
                label: addLabel,
                onClick: (event) => {
                  addButton.current = event.currentTarget
                  setPicking(true)
                },
              }}
            />
          </div>
        ) : (
          <section className="glass mt-8 rounded-2xl p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SearchField
                label="Rechercher un nom, un e-mail"
                placeholder="Rechercher un nom, un e-mail…"
                value={query}
                onChange={setQuery}
              />
              <ResultCount activeCount={visible.length} noun={noun} />
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title={`Aucun résultat pour « ${query} »`}
                description="Vérifiez l’orthographe, ou effacez la recherche pour retrouver la liste complète."
                action={{
                  // Pas « Effacer la recherche » : le champ juste au-dessus porte déjà ce nom.
                  label: `Afficher tous les ${noun.many}`,
                  onClick: () => {
                    setQuery('')
                  },
                }}
              />
            ) : (
              <DataTable
                caption={title}
                columns={columns}
                entries={visible}
                getRowId={(person) => person.email}
                sort={sort}
                onSortChange={(key) => {
                  setSort((current) => nextSort(current, key))
                }}
                emptyRow={
                  searching ? 'Aucune entrée ne correspond à cette recherche.' : 'Aucune entrée.'
                }
                rowActions={(person) => (
                  <RemoveAction
                    person={person}
                    isSelf={fold(person.email) === self}
                    copy={removalCopy}
                    onRemove={async () => {
                      await onRemove(person.email)
                      state.refetch()
                    }}
                  />
                )}
              />
            )}
          </section>
        )
      ) : null}

      <AccountPicker
        open={picking}
        onOpenChange={setPicking}
        title={addLabel}
        subtitle={pickerSubtitle}
        designatedEmails={designatedEmails}
        onDesignate={designate}
        restoreFocusTo={addButton}
      />
    </>
  )
}
