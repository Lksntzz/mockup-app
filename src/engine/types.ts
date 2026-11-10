export type Pt = [number, number];

/** Imagem RGBA de 8 bits, alfa não pré-multiplicado, linhas de cima para baixo. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type Blend = 'normal' | 'multiply' | 'color-burn';
export type Accessory = 'wireo' | 'elastico' | 'tassel';
export type Choices = Record<Accessory, string>;

export interface StackLayer {
  id: string;
  /** 'art' = frente (arte da página ímpar); 'back-art' = contra capa (arte da página par, só se houver). */
  role: 'fixed' | 'art' | 'back-art' | 'zoom';
  /** PNG em pack/layers; ausente quando role === 'art'. */
  file?: string;
  /** 0 a 1. */
  opacity: number;
  blend: Blend;
  /** Posição do canto superior esquerdo da camada no mockup. */
  offset: Pt;
  /** A camada só aparece quando todas as escolhas citadas aqui batem. */
  when?: Partial<Choices>;
  /** Mockup de especificação: a camada só entra na variante citada ('vt', 'sem-canguru'); sem variante pedida, fica de fora. */
  variant?: string;
  /** role 'zoom': trecho do que já foi desenhado que vira o círculo. `file` é a máscara (alfa) do círculo, em `offset`. */
  source?: { x: number; y: number; width: number; height: number };
}

export interface ColorOption {
  id: string;
  label: string;
  /** Cor da bolinha na tela, em #rrggbb. */
  swatch: string;
}

/** Espelho de pack/mockup.json (gerado por tools/export_pack.py). */
export interface Pack {
  canvas: { width: number; height: number };
  /** Ordem: superior esquerdo, superior direito, inferior direito, inferior esquerdo. */
  artCorners: [Pt, Pt, Pt, Pt];
  artSize: { width: number; height: number };
  artMask: { file: string; offset: Pt };
  /** Contra capa: onde a arte da página par entra. O recorte usa o canal alfa da camada indicada em `mask`. */
  backArt?: { corners: [Pt, Pt, Pt, Pt]; size: { width: number; height: number }; mask: { file: string; offset: Pt } };
  stack: StackLayer[];
  options: Record<Accessory, ColorOption[]>;
  unavailable: Partial<Choices>[];
  defaults: Choices;
}
