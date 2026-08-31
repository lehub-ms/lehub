import { type SessionPermissions } from './permissionsRepo'
import { type UploadDestination } from './uploadSchemas'

/**
 * The write matrix of LeHub, as pure predicates.
 *
 * Reading is not here, and that is the first rule: events, communities and technologies are
 * readable by anyone, anonymous visitors included. Only writes are arbitrated.
 *
 * One nuance the backoffice added (#151): the *administration view* of a referential is
 * arbitrated, and it is `canWriteReferenceData` that arbitrates it. It shows what the public
 * contract deliberately withholds — archived entries, how many events hold an entry, how many
 * organisers a community has — so it is not the reference data, it is the view of it, and the
 * people entitled to see it are exactly the people entitled to write it. One expression, not two
 * names for it.
 *
 * Every function takes the permissions resolved for the request (#108) and returns a
 * boolean. Nothing here touches the database, the request or the token — which is what lets
 * every cell of the matrix be exercised, in both directions, without a server.
 *
 * These predicates decide; the interface only displays. The backoffice hides what it knows
 * is not allowed, but the server refuses identically whether a button was hidden or not.
 */

/**
 * A GUID is not a string, and comparing two of them as strings is a bug waiting for its
 * first caller.
 *
 * Today both sides happen to agree: SQL Server hands uppercase to the driver, whether the id
 * comes from a UNIQUEIDENTIFIER column (permissionsRepo) or through FOR JSON PATH
 * (eventsRepo). Nothing keeps them agreeing. The community ids these predicates are asked
 * about will soon arrive from a request body — a submitted form (#143), a curl, the MCP
 * server (#135) — and no client is under any obligation to echo back the casing it was
 * given. A case-sensitive miss here fails closed: a legitimate organiser gets a 403 on their
 * own community, and it reads as a permissions bug rather than a casing one.
 *
 * Exported since #147: the route that replaces an event's communities has to work out which ones
 * were *removed*, by comparing the stored set against the submitted one — the same comparison,
 * with the same trap. A second spelling of it over there is precisely what this comment warns
 * against.
 */
export function sameId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** Whether the caller has been designated an organiser of that exact community. */
export function organizes(permissions: SessionPermissions, communityId: string): boolean {
  return permissions.organizedCommunityIds.some((id) => sameId(id, communityId))
}

/**
 * Technologies and communities are shared reference data: a correction made by one
 * community's organiser would land on every other community's events. Administrators only.
 */
export function canWriteReferenceData(permissions: SessionPermissions): boolean {
  return permissions.isGlobalAdmin
}

/**
 * Reading the administration view of one community's events (#144).
 *
 * The second arbitrated *read* in this API, and it is arbitrated for the same reason as the
 * first: it is not the event catalogue, which is public and stays public, it is the view an
 * organiser works in. It carries what the public contract withholds — events already past, the
 * banner's stored path, every attachment of every event — and it is scoped to a community
 * rather than to the world. See the header above, and `canWriteReferenceData`'s note.
 *
 * Deliberately *not* `canWriteEvent` composed over the listing: the question here is asked
 * before any event is read, about a community rather than about a row. An organiser sees their
 * communities' events, an administrator sees any community's — and the events themselves each
 * answer their own write question afterwards.
 */
export function canManageCommunityEvents(
  permissions: SessionPermissions,
  communityId: string,
): boolean {
  return permissions.isGlobalAdmin || organizes(permissions, communityId)
}

/**
 * Modifying or deleting an existing event.
 *
 * Attaching a community to an event is what shares its management, so being an organiser of
 * *any* of the communities it carries is enough. An event carried by two communities belongs
 * to neither in particular.
 *
 * An event with no community at all is administrators-only, which falls out of this without
 * a special case: an empty list satisfies nobody.
 */
export function canWriteEvent(permissions: SessionPermissions, eventCommunityIds: readonly string[]): boolean {
  return permissions.isGlobalAdmin || eventCommunityIds.some((id) => organizes(permissions, id))
}

/**
 * Creating an event carrying those communities.
 *
 * At least one of them has to be organised by the caller. The rule is not about restricting
 * co-organisation — an organiser may attach any community, and that is deliberately not
 * guarded anywhere — it is about signature: creating an event carrying only communities one
 * has nothing to do with would be publishing in their name.
 */
export function canCreateEvent(permissions: SessionPermissions, communityIds: readonly string[]): boolean {
  return permissions.isGlobalAdmin || communityIds.some((id) => organizes(permissions, id))
}

/**
 * Removing one community from an event.
 *
 * This is the one asymmetry of co-organisation: attaching is open, detaching is not. An
 * organiser may only detach a community they organise themselves — detaching someone else's
 * is evicting a co-organiser from an event they manage, and stays with the administrators.
 * That is what the criterion "removing a community cannot serve to take control" means in
 * practice.
 *
 * They may not leave the event with no community either, which would put it out of reach of
 * every organiser at once. Detaching their own last one *is* allowed as long as another
 * community remains: that is handing the event over, and the interface warns that access is
 * lost with it.
 */
export function canDetachCommunity(
  permissions: SessionPermissions,
  eventCommunityIds: readonly string[],
  communityId: string,
): boolean {
  if (permissions.isGlobalAdmin) return true
  if (!eventCommunityIds.some((id) => sameId(id, communityId))) return false
  if (!organizes(permissions, communityId)) return false
  return eventCommunityIds.some((id) => !sameId(id, communityId))
}

/**
 * Searching the LeHub accounts, in order to designate one of them.
 *
 * Reserved to whoever can grant something, somewhere: an administrator, or an organiser of at
 * least one community. An ordinary account has nothing to do there, and the route is the only
 * thing in this API that reads anyone else's name and address, so the guard is not a formality
 * — an unguarded search *is* the directory the backoffice deliberately does not publish.
 *
 * Coarser than the two predicates below it, and that is the honest shape: the search itself has
 * no perimeter. Who may be designated *where* is decided by the designation, not by the lookup,
 * and pretending otherwise would mean passing a community to a route that does not need one.
 *
 * The condition is `hasBackofficeAccess`'s twin (frontend/shared/src/lib/access.ts). They are
 * written twice on purpose: this one arbitrates, that one only displays.
 */
export function canSearchAccounts(permissions: SessionPermissions): boolean {
  return permissions.isGlobalAdmin || permissions.organizedCommunityIds.length > 0
}

/**
 * Designating or removing an organiser on a community.
 *
 * An organiser may co-opt on the communities they organise, and nowhere else. It is the only
 * permission an organiser can grant: the global administrator marker is not covered here, it
 * is `canWriteReferenceData`'s neighbour below.
 *
 * Refusing this would make the maintainer the bottleneck of every organising team that grows
 * — the very thing Epic #88 exists to remove.
 */
export function canDesignateOrganizer(permissions: SessionPermissions, communityId: string): boolean {
  return permissions.isGlobalAdmin || organizes(permissions, communityId)
}

/**
 * Granting or revoking the global administrator marker. Administrators only, always: nobody
 * awards themselves that quality, and no organiser can hand it out.
 *
 * The other half of that rule — the last administrator cannot be removed — is not a
 * permission and cannot live here: it depends on how many administrators remain, which is a
 * count, not a session. It belongs to the route that removes one (#159).
 */
export function canManageGlobalAdmins(permissions: SessionPermissions): boolean {
  return permissions.isGlobalAdmin
}

/**
 * Uploading an image to a given destination.
 *
 * The destination decides, not the route: a community logo and an event banner travel through
 * the same endpoint and are not the same permission. Writing it as a table rather than as an
 * `if` in the handler is what lets #149 add `event-banner` — answered by `canWriteEvent` over
 * the event's communities — without touching the refusal itself.
 */
export function canUploadTo(
  permissions: SessionPermissions,
  destination: UploadDestination,
): boolean {
  switch (destination) {
    case 'community-logo':
    case 'technology-logo':
      return canWriteReferenceData(permissions)
    // An event banner is not answerable from the destination alone — see the function below.
    // Returning `false` here rather than omitting the case keeps the switch exhaustive, so a
    // future destination still breaks the build instead of falling through to a silent refusal.
    case 'event-banner':
      return false
  }
}

/**
 * Uploading an event banner (#148).
 *
 * The only destination whose permission is not a property of the *destination*: it depends on
 * the event the image is for, so it takes the event's communities and cannot live in the table
 * above. That is why `canUploadTo` answers `false` for it and this exists instead — the shape of
 * the pair is the statement that a banner is arbitrated differently.
 *
 * `null` is the creation case, and it is the interesting one: the form uploads before the event
 * exists, because it previews the real URL. There is nothing to check against, so the question
 * becomes "may this account create events at all" — an administrator, or an organiser of at
 * least one community. An ordinary account is refused, which is what stops the media container
 * from being a free upload endpoint for anyone with a session.
 *
 * What it deliberately does not do is guarantee that the blob ends up on an event the caller may
 * write: they could upload with no `eventId` and then attach the path to an event they do not
 * manage. That attempt fails at the PATCH, where `canWriteEvent` decides — and all they will
 * have achieved is an orphan blob, which `mediaUpload` already accepts and explains.
 */
export function canUploadEventBanner(
  permissions: SessionPermissions,
  eventCommunityIds: readonly string[] | null,
): boolean {
  if (eventCommunityIds) return canWriteEvent(permissions, eventCommunityIds)
  return permissions.isGlobalAdmin || permissions.organizedCommunityIds.length > 0
}
