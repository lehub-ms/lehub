import {
  Building2,
  Calendar,
  Layers,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useAuth } from "@lehub/shared/auth/useAuth";
import { cn } from "@lehub/shared/lib/cn";
import { CommunityPicker } from "./CommunityPicker";
import {
  communityPath,
  isSectionActive,
  PATHS,
  type CommunitySection,
} from "@/lib/navigation";

interface Entry {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

/**
 * Les deux sections de la barre.
 *
 * La première dépend de la communauté choisie, la seconde n'appartient à personne — les
 * référentiels sont partagés, et c'est pourquoi leurs routes ne portent pas de communauté.
 *
 * Le titre « Administration générale » traduit le « Global admin » de la maquette : la
 * Feature #138 tranche que les libellés de l'interface sont en français.
 */
const COMMUNITY_ICONS: Record<CommunitySection, LucideIcon> = {
  evenements: Calendar,
  organisateurs: Users,
};

const COMMUNITY_LABELS: Record<CommunitySection, string> = {
  evenements: "Évènements",
  organisateurs: "Organisateurs",
};

/* La maquette donne la même icône de groupe à « Communauté » et à « Organisateurs », côte à
   côte dans la même barre. Une organisation et les personnes qui l'animent méritent deux
   marques distinctes ; à rendre au projet de design. */
const GLOBAL_ENTRIES: readonly Entry[] = [
  { to: PATHS.communities, label: "Communautés", icon: Building2 },
  { to: PATHS.technologies, label: "Technologies", icon: Layers },
  { to: PATHS.administrators, label: "Administrateurs", icon: UserRound },
];

function NavEntry({
  entry,
  collapsed,
}: {
  entry: Entry;
  collapsed: boolean;
}): ReactNode {
  const { pathname } = useLocation();
  const active = isSectionActive(pathname, entry.to);
  const Icon = entry.icon;

  return (
    <li>
      <Link
        to={entry.to}
        // `aria-current` plutôt qu'une classe seule : le marquage doit exister pour un
        // lecteur d'écran autant que pour l'œil.
        aria-current={active ? "page" : undefined}
        // Réduite, l'entrée n'a plus de libellé visible : le `title` porte l'infobulle et
        // `aria-label` le nom accessible, comme l'exige l'edge case de la story.
        title={collapsed ? entry.label : undefined}
        aria-label={collapsed ? entry.label : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[0.9375rem] font-medium whitespace-nowrap transition-colors",
          collapsed && "justify-center px-0",
          active
            ? "bg-primary-xs font-semibold text-primary"
            : "text-ink-body hover:bg-primary-xs hover:text-primary",
        )}
      >
        <Icon aria-hidden="true" className="size-[18px] shrink-0" />
        {collapsed ? null : <span className="truncate">{entry.label}</span>}
      </Link>
    </li>
  );
}

export function SidebarNav({
  communityId,
  collapsed,
}: {
  /** `null` tant qu'aucune communauté n'est dans l'URL — la section n'est alors pas rendue. */
  communityId: string | null;
  collapsed: boolean;
}): ReactNode {
  const { state } = useAuth();

  /* La composition du menu découle de la réponse d'habilitations, jamais d'un claim du jeton
     ni d'une valeur mise en cache sans rafraîchissement.

     Rien ici n'a besoin de traiter la résolution en cours : `RequireSession` puis
     `RequireAccess` rendent `null` tant que la session et ses habilitations ne sont pas
     connues, donc la coquille entière n'est pas montée. La story demande qu'aucune section
     ne s'affiche par défaut pendant ce temps ; la structure des routes le garantit plus
     fermement qu'une condition ici, et un test le vérifie. */
  const isGlobalAdmin =
    state.status === "authenticated" && state.permissions.isGlobalAdmin;

  const communityEntries: Entry[] =
    communityId === null
      ? []
      : (["evenements", "organisateurs"] as const).map((section) => ({
          to: communityPath(communityId, section),
          label: COMMUNITY_LABELS[section],
          icon: COMMUNITY_ICONS[section],
        }));

  return (
    <nav
      aria-label="Navigation principale"
      className="flex flex-1 flex-col gap-[18px] overflow-x-hidden overflow-y-auto p-3"
    >
      <CommunityPicker collapsed={collapsed} />

      {communityEntries.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {communityEntries.map((entry) => (
            <NavEntry key={entry.to} entry={entry} collapsed={collapsed} />
          ))}
        </ul>
      ) : null}

      {isGlobalAdmin ? (
        <div className="flex flex-col gap-0.5">
          {collapsed ? (
            // Le titre disparaît avec les libellés, mais la section reste un groupe nommé pour
            // les technologies d'assistance.
            <span className="sr-only" id="admin-section-label">
              Administration générale
            </span>
          ) : (
            <h2
              id="admin-section-label"
              className="mb-1.5 px-3 text-[0.6875rem] font-bold tracking-[0.08em] whitespace-nowrap text-ink-muted uppercase"
            >
              Administration générale
            </h2>
          )}
          <ul
            aria-labelledby="admin-section-label"
            className="flex flex-col gap-0.5"
          >
            {GLOBAL_ENTRIES.map((entry) => (
              <NavEntry key={entry.to} entry={entry} collapsed={collapsed} />
            ))}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
