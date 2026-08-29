import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OtpInput } from '../src/components/form/OtpInput'

describe('la saisie du code à usage unique', () => {
  it('étale un collage sur les cases suivantes et remet la valeur fraîche', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<OtpInput length={4} label="Code" onComplete={onComplete} />)

    await user.click(screen.getByLabelText('Caractère 1 sur 4'))
    await user.paste('1234')

    expect(onComplete).toHaveBeenCalledExactlyOnceWith('1234')
  })

  /**
   * Le piège que le composant documente : corriger un caractère d'un code refusé ne doit pas
   * re-soumettre le code entier à chaque frappe, ce qui brûlerait une tentative de plus vers
   * le verrouillage du compte.
   */
  it('ne re-soumet pas à chaque frappe après une correction', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<OtpInput length={4} label="Code" onComplete={onComplete} />)

    await user.click(screen.getByLabelText('Caractère 1 sur 4'))
    await user.paste('1234')
    expect(onComplete).toHaveBeenCalledTimes(1)

    const last = screen.getByLabelText('Caractère 4 sur 4')
    await user.clear(last)
    await user.type(last, '9')

    // Un seul appel de plus : celui du passage d'incomplet à complet, pas un par frappe.
    expect(onComplete).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenLastCalledWith('1239')
  })
})
