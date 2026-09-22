# Análise técnica — otimização por região de captura

## Conclusão

Recortar a imagem **antes** de codificá-la e enviá-la é vantajoso para o AIGA, desde que a região preserve todo o conteúdo necessário. O ganho garantido ocorre em área de pixels, tamanho do PNG, leitura de arquivo, codificação Base64 e upload. A redução de tokens visuais é provável, mas não pode ser expressa por uma porcentagem fixa porque cada provedor/modelo redimensiona e contabiliza imagens de maneira própria.

O benefício de qualidade tende a ser positivo quando o recorte remove barras do Windows/browser, notificações, abas e outros elementos irrelevantes: o modelo recebe menos texto concorrente e tem maior densidade de informação útil. Um recorte agressivo pode causar o efeito oposto se remover título, enunciado, mensagens de erro, cabeçalhos de tabela ou contexto de navegação necessário.

## Fluxo anterior e novo fluxo

Antes:

`monitor inteiro → PNG → Base64 → provider multimodal`

Agora:

`monitor inteiro → recorte NativeImage → PNG menor → Base64 → provider multimodal`

O recorte usa coordenadas normalizadas (`x`, `y`, `width`, `height`, de 0 a 1). Assim, a configuração sobrevive a mudanças de resolução e escala DPI. Ela é aplicada separadamente a cada monitor quando o modo “todas as telas” está ativo.

## Impacto esperado

| Dimensão | Efeito esperado | Observação |
|---|---|---|
| Pixels processados | Redução diretamente proporcional à área mantida | Região 100% × 87% remove 13% dos pixels. |
| Tamanho do PNG | Normalmente reduz | Não é linear: depende da complexidade/cores do conteúdo removido. |
| Base64 e upload | Reduz junto com o PNG | Base64 acrescenta aproximadamente 33% ao binário; arquivo menor continua sendo decisivo. |
| Latência local | Pequena melhora líquida | Há custo mínimo de `NativeImage.crop`, compensado por PNG/Base64 menores. |
| Latência de rede | Melhora provável | Mais perceptível em screenshots grandes, múltiplos monitores ou conexão lenta. |
| Tokens visuais | Redução provável, não garantida linearmente | Providers podem redimensionar, agrupar em tiles ou cobrar por faixas. |
| Qualidade da resposta | Melhora com recorte correto | Diminui distrações e OCR irrelevante. |

## Limitação da medição atual

- O provider Gemini registra no `onUsage` apenas uma estimativa baseada no tamanho do texto (`ask.length / 4`); a imagem não entra nessa estimativa.
- OpenAI e Anthropic só registram uso quando seus eventos de streaming devolvem os campos correspondentes; isso não cria uma comparação visual controlada por região.
- Portanto, o contador de tokens existente não comprova, sozinho, economia de tokens de imagem.

Para possibilitar medição objetiva, cada captura agora registra:

- resolução original e recortada;
- bytes do PNG final;
- porcentagem de redução de pixels;
- região normalizada aplicada.

## Estratégia de validação recomendada

Usar um conjunto fixo de 20–30 telas representativas e comparar captura inteira contra região útil:

1. manter prompt, provider e modelo idênticos;
2. medir pixels, bytes, tempo até primeiro token e tempo total;
3. quando o provider retornar uso real, registrar tokens de entrada;
4. avaliar a resposta com uma rubrica: exatidão, completude, alucinação e menção a elementos irrelevantes;
5. aceitar a otimização se reduzir bytes/latência sem queda estatisticamente relevante na rubrica.

## Guardrails de produto

- Região mínima de 10% da largura e 10% da altura.
- Coordenadas limitadas aos limites da imagem.
- Prévia proporcional em verde; área descartada em vermelho.
- Configuração desativada por padrão para preservar compatibilidade.
- Preset “Remover barras” corta 8% do topo e 5% da base; o usuário deve ajustá-lo à própria resolução/browser.
- Botão “Usar tela inteira” restaura 100% da imagem sem apagar a preferência de ativação.

## Recomendação

Adotar a região útil como opção recomendada, não obrigatória. Para casos estáveis — navegador maximizado, IDE ou acesso remoto com layout constante — ela deve melhorar foco e custo. Para telas que mudam de layout, múltiplas janelas ou problemas cujo contexto está nas bordas, manter a captura integral.

## Seleção interativa — MVP

O modo **Captura de área** implementa seleção semelhante às ferramentas nativas de screenshot no
monitor principal. O AIGA é ocultado antes da captura; em seguida, uma janela temporária apresenta
a imagem congelada e escurecida. O arraste produz coordenadas normalizadas, que são convertidas em
pixels reais pelo mesmo recorte `NativeImage` descrito acima. `Esc` cancela a seleção.

O overlay é intencionalmente visível localmente durante a operação, inclusive quando o AIGA estava
em stealth. Ele é criado somente depois de a imagem-base ter sido capturada e é fechado antes da
restauração do agente, impedindo que apareça no PNG final. O MVP limita a seleção ao monitor
principal; seleção atravessando monitores com escalas DPI diferentes permanece fora do escopo.
