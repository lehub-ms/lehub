import { describe, expect, it } from 'vitest'
import { sniffImage } from '../src/lib/imageSniff'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
])
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0])

function svg(inner: string): Uint8Array {
  return new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`)
}

describe('formats acceptés', () => {
  it('reconnaît PNG, JPEG et WebP à leurs octets', () => {
    expect(sniffImage(PNG)?.kind).toBe('png')
    expect(sniffImage(JPEG)?.kind).toBe('jpeg')
    expect(sniffImage(WEBP)?.kind).toBe('webp')
  })

  it('n’accepte pas un RIFF qui n’est pas du WebP', () => {
    // « RIFF » seul est aussi le début d'un WAV : les quatre octets de type à l'offset 8 sont
    // ce qui distingue les deux.
    const wav = new Uint8Array(WEBP)
    wav.set([0x57, 0x41, 0x56, 0x45], 8)
    expect(sniffImage(wav)).toBeNull()
  })

  it('refuse le GIF, délibérément hors de la liste', () => {
    // Rien dans un référentiel ni dans une bannière n'en a besoin, et chaque format accepté est
    // un décodeur exposé.
    expect(sniffImage(GIF)).toBeNull()
  })

  it('refuse un fichier vide et un fichier texte', () => {
    expect(sniffImage(new Uint8Array(0))).toBeNull()
    expect(sniffImage(new TextEncoder().encode('bonjour'))).toBeNull()
  })

  it('dérive l’extension du contenu, jamais du nom annoncé', () => {
    // L'edge case de #154 : « c'est le contenu qui décide ». Le JPEG ci-dessous s'appellerait
    // « logo.png » que cela ne changerait rien — le nom n'arrive même pas jusqu'ici.
    expect(sniffImage(JPEG)?.extension).toBe('.jpg')
    expect(sniffImage(PNG)?.extension).toBe('.png')
  })
})

describe('SVG', () => {
  it('accepte une icône propre', () => {
    const clean = sniffImage(svg('<path d="M0 0h24v24H0z" fill="#005FB8"/>'))
    expect(clean?.kind).toBe('svg')
    expect(clean?.contentType).toBe('image/svg+xml')
  })

  it('accepte une référence interne et une image en ligne', () => {
    expect(sniffImage(svg('<use href="#icon"/>'))?.kind).toBe('svg')
    expect(sniffImage(svg('<image href="data:image/png;base64,AAA"/>'))?.kind).toBe('svg')
  })

  it('tolère un prologue XML et des commentaires avant la racine', () => {
    const withProlog = new TextEncoder().encode(
      '<?xml version="1.0"?>\n<!-- généré -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    )
    expect(sniffImage(withProlog)?.kind).toBe('svg')
  })

  for (const [label, inner] of [
    ['un script', '<script>alert(1)</script>'],
    ['un gestionnaire d’évènement', '<path onload="alert(1)"/>'],
    ['un foreignObject', '<foreignObject><body/></foreignObject>'],
    ['une URL javascript:', '<a href="javascript:alert(1)">x</a>'],
    ['une référence externe', '<image href="https://ailleurs.example/x.png"/>'],
    ['un @import dans une feuille de style', '<style>@import url(x.css)</style>'],
  ] as const) {
    it(`refuse un SVG portant ${label}`, () => {
      expect(sniffImage(svg(inner))).toBeNull()
    })
  }

  it('refuse un DOCTYPE, donc l’expansion d’entités', () => {
    const xxe = new TextEncoder().encode(
      '<!DOCTYPE svg [<!ENTITY a "aaa">]><svg xmlns="http://www.w3.org/2000/svg"/>',
    )
    expect(sniffImage(xxe)).toBeNull()
  })

  it('refuse un script encodé en entités numériques', () => {
    // Le contournement évident : &#x3c;script. Les entités sont réduites avant l'analyse.
    const encoded = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg">&#x3c;script&#x3e;alert(1)&#x3c;/script&#x3e;</svg>',
    )
    expect(sniffImage(encoded)).toBeNull()
  })

  it('refuse une référence externe même sans guillemets', () => {
    // `href=https://…` est du balisage qu'un navigateur analyse très bien. Un motif qui exigeait
    // les guillemets laissait passer exactement cela en prétendant l'interdire.
    expect(sniffImage(svg('<image href=https://ailleurs.example/x.png />'))).toBeNull()
    expect(sniffImage(svg('<image xlink:href=http://ailleurs.example/x />'))).toBeNull()
  })

  it('laisse passer les deux références légitimes, quelle que soit la citation', () => {
    // La contrepartie du test ci-dessus : en resserrant, on a d'abord refusé « #icon », ce que le
    // commentaire du code promettait d'accepter.
    expect(sniffImage(svg('<use href=\'#icon\'/>'))?.kind).toBe('svg')
    expect(sniffImage(svg('<image href=\'data:image/png;base64,AAA\'/>'))?.kind).toBe('svg')
    expect(sniffImage(svg('<a href="">x</a>'))?.kind).toBe('svg')
  })

  it('ne casse pas sur une entité numérique hors de l’espace Unicode', () => {
    // `String.fromCodePoint` lève au-dessus de U+10FFFF, et les chiffres viennent d'un fichier
    // téléversé : non gardé, `&#999999999;` faisait tomber la route en 500 au lieu du 415 dû.
    expect(() => sniffImage(new TextEncoder().encode('<svg>&#999999999;</svg>'))).not.toThrow()
    expect(() => sniffImage(new TextEncoder().encode('<svg>&#x110000;</svg>'))).not.toThrow()
  })

  it('reste linéaire sur un fichier fait d’ouvertures de commentaire', () => {
    // Le repérage de la racine dépouillait les commentaires avec un quantificateur paresseux,
    // qui repart de zéro à chaque « <!-- » : 1,15 s pour 160 kio, des minutes pour les 2 Mio que
    // la route accepte, et l'instance à genoux. Le seuil est large — on mesure un ordre de
    // grandeur, pas une horloge — mais il tombait dans le mur avant.
    const bytes = new TextEncoder().encode('<!--'.repeat((512 * 1024) / 4))

    const started = Date.now()
    expect(sniffImage(bytes)).toBeNull()
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('franchit un prologue et des commentaires avant la racine, et s’arrête sur un commentaire non fermé', () => {
    expect(sniffImage(new TextEncoder().encode('<?xml version="1.0"?>\n<!-- c --> <svg/>'))?.kind).toBe(
      'svg',
    )
    expect(sniffImage(new TextEncoder().encode('<!-- c --><html/>'))).toBeNull()
    expect(sniffImage(new TextEncoder().encode('<!-- jamais fermé <svg/>'))).toBeNull()
  })

  it('refuse du binaire qui commence par des caractères imprimables', () => {
    const binary = new Uint8Array([...new TextEncoder().encode('<svg '), 0x00, 0xff])
    expect(sniffImage(binary)).toBeNull()
  })

  it('refuse un document XML qui n’est pas un SVG', () => {
    expect(sniffImage(new TextEncoder().encode('<html><body/></html>'))).toBeNull()
  })
})
