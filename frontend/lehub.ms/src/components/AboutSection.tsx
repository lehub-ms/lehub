import type { ReactNode } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import * as Accordion from '@radix-ui/react-accordion'
import { GITHUB_URL, LINKEDIN_URL } from '@/lib/external-links'
import { DisclosureChevron } from './DisclosureChevron'

interface AboutItem {
  id: string
  title: string
  body: ReactNode
}

const INLINE_LINK = 'font-semibold text-primary underline underline-offset-2 hover:decoration-2'

const ABOUT_ITEMS: [AboutItem, AboutItem, AboutItem, AboutItem] = [
  {
    id: 'positionnement',
    title: 'Par la communauté, pour la communauté',
    body: (
      <>
        <p>
          LeHub n'a qu'un seul objectif : rendre service à la communauté. Il n'y a aucune
          ambition commerciale derrière ce projet. LeHub est gratuit et le restera toujours.
        </p>
        <p>
          Les communautés qui publient leurs évènements sur LeHub sont des associations de
          passionnés. Elles n'organisent pas ces évènements à des fins lucratives. Elles ont
          bien sûr des sponsors qui contribuent à leur organisation — nous les en remercions
          infiniment — mais LeHub ne partagera jamais aucune donnée de ses utilisateurs avec
          eux.
        </p>
        <p>Aucun évènement présent sur LeHub n'est organisé par une société à des fins marketing.</p>
      </>
    ),
  },
  {
    id: 'neutralite',
    title: 'Neutralité',
    body: (
      <p>
        LeHub est strictement neutre. Aucune communauté n'est mise en avant par rapport à une
        autre, aucun évènement ne bénéficie d'une visibilité particulière. Les évènements sont
        affichés par ordre chronologique, les communautés par ordre alphabétique ou dans un
        ordre aléatoire. Ni le choix des technologies, ni l'ancienneté d'une communauté, ni
        aucune autre considération n'influence ce classement.
      </p>
    ),
  },
  {
    id: 'cout',
    title: 'Coût',
    body: (
      <p>
        LeHub est entièrement développé par moi, Théophile CHIN-NIN, et hébergé sur mon propre
        tenant Azure, financé sur mes fonds personnels. Il n'y a pas d'équipe, pas
        d'investisseur, pas de modèle économique. C'est un projet de passion, point.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Boîte à idées & contact',
    body: (
      <>
        <p>
          Vous avez une suggestion d'amélioration ou vous rencontrez un problème sur le site ?
          Ouvrez une issue sur{' '}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={INLINE_LINK}>
            GitHub<span className="sr-only"> — nouvel onglet</span>
          </a>
          .
        </p>
        <p>
          Vous représentez une communauté et souhaitez référencer vos évènements sur LeHub ?
          Contactez-moi sur{' '}
          <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" className={INLINE_LINK}>
            LinkedIn<span className="sr-only"> — nouvel onglet</span>
          </a>
          .
        </p>
      </>
    ),
  },
]

/**
 * Story #17. Uncontrolled `Collapsible` (closed by default, never persisted) wrapping an
 * uncontrolled nested `Accordion` — neither needs its state read anywhere else, unlike
 * `FeaturesShowcase`'s controlled accordion.
 */
export function AboutSection() {
  return (
    <section aria-labelledby="about-heading" className="mt-16 border-t border-primary/10 pt-10">
      <Collapsible.Root>
        <h2 id="about-heading" className="m-0 text-2xl font-bold md:text-3xl">
          <Collapsible.Trigger className="group flex min-h-11 items-center gap-4">
            <DisclosureChevron className="size-5" />
            À propos de LeHub
          </Collapsible.Trigger>
        </h2>
        <p className="mt-2 ml-9 max-w-xl text-ink-muted">
          Quelques mots sur ce que LeHub est — et ce qu'il n'est pas.
        </p>

        <Collapsible.Content className="collapsible-panel">
          <Accordion.Root type="single" collapsible defaultValue={ABOUT_ITEMS[0].id} className="mt-6">
            {ABOUT_ITEMS.map((item) => (
              <Accordion.Item key={item.id} value={item.id} className="border-b border-primary/10 first:border-t">
                <Accordion.Header asChild>
                  <h3 className="m-0">
                    <Accordion.Trigger className="group flex min-h-11 w-full items-center justify-between gap-3 py-4 text-left font-heading text-base font-bold text-ink">
                      {item.title}
                      <DisclosureChevron className="size-4" />
                    </Accordion.Trigger>
                  </h3>
                </Accordion.Header>
                <Accordion.Content className="accordion-panel">
                  <div className="space-y-3 pb-6 text-[0.9375rem] leading-relaxed text-ink-muted text-pretty">
                    {item.body}
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </Collapsible.Content>
      </Collapsible.Root>
    </section>
  )
}
