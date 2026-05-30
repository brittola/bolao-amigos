# DESIGN

Direção: **Placar retrô / ticker**. Painel LED âmbar sobre preto quente. Numerais
monoespaçados, rótulos em caixa-alta com tracking. Committed color: o âmbar carrega a
identidade; semânticas (verde/vermelho) só para resultado.

## Theme
Dark. Cena: amigos conferindo palpites no celular à noite, durante os jogos. O escuro
força a leitura de "placar aceso".

## Color (OKLCH)
- `--bg`:        oklch(0.17 0.012 70)   /* preto quente */
- `--surface`:   oklch(0.21 0.013 70)   /* painéis */
- `--surface-2`: oklch(0.25 0.014 70)
- `--border`:    oklch(0.32 0.012 70)
- `--text`:      oklch(0.93 0.010 85)   /* off-white quente */
- `--text-dim`:  oklch(0.66 0.014 85)
- `--amber`:     oklch(0.82 0.150 78)   /* acento / LED */
- `--amber-2`:   oklch(0.74 0.170 66)   /* hover/strong */
- `--win`:       oklch(0.80 0.150 150)  /* acerto / vitória */
- `--loss`:      oklch(0.64 0.190 28)   /* erro / derrota */
- Estratégia: Committed. Âmbar em ações primárias, seleção e numerais de placar.

## Typography
- Texto/UI: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Placar/numerais/rótulos: `ui-monospace, "SF Mono", "JetBrains Mono", monospace`,
  `font-variant-numeric: tabular-nums`, caixa-alta + letter-spacing nos rótulos.
- Escala rem fixa, ratio ~1.2. Numerais de placar grandes (até ~2.5rem).

## Layout
- Mobile-first. Top bar fixa com nav (Jogos · Ranking · Admin). Conteúdo em coluna única,
  largura máx ~560px centralizada; ranking pode ir mais largo.
- Jogo = linha de placar (TIME n : n TIME), não card decorativo. Painel com borda completa.

## Motion
- 150–250ms, ease-out. Reveal de pontos com leve pulse do âmbar. Sem bounce.

## Components (estados completos)
- Botão (primário âmbar / ghost), input de placar (stepper numérico), badge de status
  (NS/AO VIVO/ENCERRADO), linha de ranking, empty/loading (skeleton), erro inline.
