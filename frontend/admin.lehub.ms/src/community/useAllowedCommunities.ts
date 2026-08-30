import { useContext } from 'react'
import { CommunitiesContext } from './CommunitiesContext'
import type { CommunitiesState } from '@/hooks/useCommunities'

/** Lève hors du fournisseur : une liste vide par défaut masquerait le vrai défaut. */
export function useAllowedCommunities(): CommunitiesState {
  const state = useContext(CommunitiesContext)
  if (!state) throw new Error('useAllowedCommunities doit être utilisé dans un <CommunitiesProvider>')
  return state
}
