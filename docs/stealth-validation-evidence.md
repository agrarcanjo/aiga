# Evidencia Operacional - Stealth Validation

## Objetivo

Registrar evidencia manual e comparavel da validacao do modo stealth em plataformas de reuniao e modos de compartilhamento.

## Plataformas alvo

- Zoom
- Google Meet
- Microsoft Teams

## Modos de compartilhamento

- Janela
- Tela inteira
- Monitor secundario

## Campos de evidencia por execucao

1. Data/hora do teste.
2. Plataforma testada.
3. Modo de compartilhamento.
4. Sistema operacional.
5. Nivel de stealth usado (`off`, `safe`, `strict`).
6. Resultado (`pass`, `risk`, `fail`).
7. Comportamento observado.
8. Fallback aplicado.
9. Evidencia complementar (print, video curto, observacao do operador).

## Checklist minimo por cenario

1. Validar toggle `Ctrl+B` para entrada e saida.
2. Confirmar ausencia de previews sensiveis no renderer.
3. Confirmar ausencia de timeline detalhada e logs visiveis.
4. Confirmar recuperacao segura da janela no Windows.
5. Registrar se houve exposicao parcial em tela inteira.

## Criterio de aceite operacional

Um cenario so pode ser considerado aceito quando:

1. O resultado estiver como `pass` ou `risk` com fallback documentado.
2. O operador registrar observacao objetiva.
3. O comportamento estiver alinhado com a politica de limitacoes por plataforma.
