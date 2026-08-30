import * as Dialog from "@radix-ui/react-dialog";
import { Menu } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Outlet,
  ScrollRestoration,
  useLocation,
  useParams,
} from "react-router";
import { CommunitiesProvider } from "@/community/CommunitiesProvider";
import { readSidebarCollapsed, writeSidebarCollapsed } from "@/lib/preferences";
import { Sidebar } from "./Sidebar";
import { SidebarBody } from "./SidebarBody";
import { Wordmark } from "./Wordmark";

/**
 * La coquille du backoffice : une barre latérale persistante et une zone de contenu.
 *
 * Sous le palier `md` la barre cède la place à une barre supérieure, et revient en tiroir superposé.
 * Le tiroir est un `Dialog` Radix — il apporte le piège à focus, la fermeture par le fond et
 * par la touche d'échappement, et le retour du focus au bouton d'ouverture, soit quatre
 * exigences de la story pour une dépendance que le site public utilise déjà.
 */
export function AdminLayout(): ReactNode {
  // Lu au premier rendu plutôt que corrigé par un effet : la barre ne doit pas s'afficher
  // déployée puis se replier sous les yeux de qui l'avait réduite.
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const { communityId = null } = useParams();
  const { pathname } = useLocation();

  // Le tiroir est dérivé de l'écran sur lequel il a été ouvert, plutôt que d'un booléen
  // qu'un effet viendrait remettre à zéro. Toute navigation — un lien, un retour arrière,
  // une redirection — change `pathname` et le referme donc par construction, sans qu'aucun
  // chemin de fermeture puisse être oublié.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const drawerOpen = openedAt === pathname;

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    writeSidebarCollapsed(collapsed);
  }, [collapsed]);

  return (
    <CommunitiesProvider>
      <div className="flex min-h-dvh">
        <Sidebar
          communityId={communityId}
          collapsed={collapsed}
          onToggleCollapse={() => {
            setCollapsed((current) => !current);
          }}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Dialog.Root
            open={drawerOpen}
            onOpenChange={(open) => {
              setOpenedAt(open ? pathname : null);
            }}
          >
            <header className="sticky top-0 z-[150] flex items-center gap-3 border-b border-primary/12 bg-white px-4 py-3 md:hidden">
              <Dialog.Trigger
                aria-label="Ouvrir le menu"
                className="flex size-11 items-center justify-center rounded-[10px] text-ink-body transition-colors hover:bg-primary-xs hover:text-primary"
              >
                <Menu aria-hidden="true" className="size-5" />
              </Dialog.Trigger>
              <Wordmark className="text-base" />
            </header>

            <Dialog.Portal>
              <Dialog.Overlay
                data-testid="sidebar-backdrop"
                className="fixed inset-0 z-[200] bg-slate-900/45"
              />
              <Dialog.Content
                // Radix confine les technologies d'assistance par `aria-hidden` sur le reste
                // plutôt que par `aria-modal` ; la story demande l'annonce modale, donc les deux.
                aria-modal="true"
                aria-describedby={undefined}
                className="fixed top-0 bottom-0 left-0 z-[300] flex w-[260px] flex-col overflow-x-hidden border-r border-primary/12 bg-white shadow-[0_10px_40px_rgb(0_0_0/0.18)]"
              >
                <Dialog.Title className="sr-only">
                  Menu du backoffice
                </Dialog.Title>
                {/* Jamais réduit : le tiroir occupe déjà sa pleine largeur, et l'état du bureau
                  n'a pas à s'y propager. */}
                <SidebarBody communityId={communityId} collapsed={false} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          <main
            id="contenu"
            className="flex-1 px-7 pt-7 pb-14 max-[640px]:px-3.5 max-[640px]:pt-5 max-[640px]:pb-10"
          >
            <Outlet />
          </main>
        </div>

        {/* Aucun script en ligne en mode bibliothèque, donc `script-src 'self'` reste tenable. */}
        <ScrollRestoration />
      </div>
    </CommunitiesProvider>
  );
}
