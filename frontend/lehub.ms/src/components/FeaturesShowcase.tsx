import { useState, type ReactNode } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import { MediaPlaceholder } from './MediaPlaceholder'
import { DisclosureChevron } from './DisclosureChevron'

interface Feature {
  id: string
  title: string
  mediaCaption: string
  body: ReactNode
}

const FEATURES: [Feature, Feature, Feature] = [
  {
    id: 'evenements',
    title: 'Découvrez les évènements',
    mediaCaption: "capture d'écran — page Évènements, filtres actifs",
    body: (
      <>
        <p>
          La page <strong>Évènements</strong> rassemble, en un seul endroit, les rencontres,
          meetups et conférences publiés par toutes les communautés tech référencées sur LeHub —
          classés par ordre chronologique.
        </p>
        <p>
          Affinez la liste avec les filtres <strong>Communauté</strong> et{' '}
          <strong>Technologie</strong> : cochez une ou plusieurs communautés, une ou plusieurs
          technologies, et ne gardez que les évènements qui vous intéressent vraiment.
        </p>
      </>
    ),
  },
  {
    id: 'agenda',
    title: 'Créez votre agenda',
    mediaCaption: 'capture d’écran — connexion et filtres enregistrés sur le profil',
    body: (
      <>
        <p>
          Connectez-vous avec votre compte <strong>Microsoft</strong> ou{' '}
          <strong>LinkedIn</strong> — aucune création de mot de passe, aucune donnée superflue
          demandée.
        </p>
        <p>
          Une fois connecté, vos filtres de communautés et de technologies favorites sont
          sauvegardés sur votre profil. À chaque visite, vous retrouvez directement les
          évènements qui vous concernent.
        </p>
      </>
    ),
  },
  {
    id: 'calendrier',
    title: "Intégrez à votre application d'agenda",
    mediaCaption: "capture d'écran — ajout de l'URL iCal dans Outlook",
    body: (
      <>
        <p>
          Depuis votre profil, récupérez votre <strong>URL iCal</strong> personnelle : elle
          reflète en permanence les évènements correspondant à vos filtres enregistrés.
        </p>
        <p>
          Ajoutez-la comme <strong>« nouveau calendrier depuis Internet »</strong> dans Outlook
          (ou tout autre client compatible iCal) : les nouveaux évènements apparaissent
          automatiquement dans votre agenda, sans rien faire de plus.
        </p>
      </>
    ),
  },
]

/**
 * Story #16. Controlled accordion: the desktop sticky media pane reads the same
 * `openFeature` state as the trigger list, so its caption always matches whichever item —
 * if any — is currently open.
 */
export function FeaturesShowcase() {
  const [openFeature, setOpenFeature] = useState<string>(FEATURES[0].id)
  const current = FEATURES.find((feature) => feature.id === openFeature)

  return (
    <section aria-label="Fonctionnalités de LeHub" className="mt-10 min-[900px]:flex min-[900px]:gap-14">
      <Accordion.Root
        type="single"
        collapsible
        value={openFeature}
        onValueChange={setOpenFeature}
        className="min-[900px]:w-[23.75rem] min-[900px]:shrink-0"
      >
        {FEATURES.map((feature) => (
          <Accordion.Item
            key={feature.id}
            value={feature.id}
            className="border-b border-primary/10 first:border-t"
          >
            <Accordion.Header asChild>
              <h2 className="m-0">
                <Accordion.Trigger className="group flex min-h-11 w-full items-center justify-between gap-3 py-4 text-left font-heading text-lg font-bold text-ink">
                  {feature.title}
                  <DisclosureChevron className="size-5" />
                </Accordion.Trigger>
              </h2>
            </Accordion.Header>
            <Accordion.Content className="accordion-panel">
              <div className="space-y-3 pb-6 text-[0.9375rem] leading-relaxed text-ink-muted text-pretty [&_strong]:text-ink">
                {feature.body}
              </div>
              <div className="mb-6 min-[900px]:hidden">
                <MediaPlaceholder caption={feature.mediaCaption} />
              </div>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>

      <div className="mt-8 hidden min-w-0 flex-1 min-[900px]:sticky min-[900px]:top-28 min-[900px]:mt-0 min-[900px]:block min-[900px]:self-start">
        {/* `collapsible` lets the open item close, so `current` can be undefined — the
            mock-up itself hides the media box in that case rather than freezing on the
            last screenshot, and this mirrors it. */}
        {current && <MediaPlaceholder caption={current.mediaCaption} />}
      </div>
    </section>
  )
}
