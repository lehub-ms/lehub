import { useContext } from 'react'
import { CommunitiesContext, type CommunitiesValue } from './CommunitiesContext'
import type { CommunitiesState } from '@/hooks/useCommunities'

/** Lève hors du fournisseur : une liste vide par défaut masquerait le vrai défaut. */
export function useCommunitiesValue(): CommunitiesValue {
  const value = useContext(CommunitiesContext)
  if (!value) throw new Error('Le contexte des communautés exige un <CommunitiesProvider>')
  return value
}

/** La liste seule, pour qui n'a que faire de la communauté retenue. */
export function useAllowedCommunities(): CommunitiesState {
  return useCommunitiesValue().state
}
