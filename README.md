# Cybersecurity

Avaliacao Intermediaria — Cyberseguranca (Insper)

## Plugin: Privacy Guard

Extensao para Firefox que detecta rastreadores e violacoes de privacidade durante a navegacao.

### Estrutura

```
plugin/
  manifest.json       configuracao da extensao
  popup.html          interface do botao da extensao
  options.html        pagina de configuracoes
  css/
    popup.css         estilo do popup
    options.css       estilo da pagina de configuracoes
  js/
    trackers-list.js  lista de rastreadores conhecidos por categoria
    background.js     script de fundo: intercepta requisicoes e cookies
    content.js        script da pagina: detecta fingerprint e hijacking
    popup.js          logica do popup
    options.js        logica da pagina de configuracoes
  icons/
    icon-48.png       icone 48x48 px
    icon-96.png       icone 96x96 px
```

### Como instalar no Firefox

1. Abrir `about:debugging` no Firefox
2. Clicar em "Este Firefox"
3. Clicar em "Carregar extensao temporaria..."
4. Selecionar o arquivo `plugin/manifest.json`

### Funcionalidades

**Deteccao**
- Conexoes a dominios de terceira parte
- Cookies de 1a e 3a parte, de sessao, persistentes e supercookies
- Armazenamento HTML5: localStorage, sessionStorage, IndexedDB, Cache API
- Canvas Fingerprinting (interceptacao de toDataURL, getImageData, toBlob)
- Sincronismo de cookies (cookies enviados a terceiros e parametros de ID em URLs)
- Ameacas de hijacking: scripts BeEF, portas suspeitas, eval ofuscado, WebSocket anomalo, iframes ocultos

**Bloqueio**
- Lista integrada com mais de 80 rastreadores conhecidos em 5 categorias
- Lista personalizada com importacao e exportacao em TXT
- Lista branca para dominios permitidos

**Interface**
- Popup com pontuacao de privacidade (0 a 100), contadores e alertas
- Pagina de configuracoes com relatorio completo por pagina

### Metodologia de Pontuacao

| Criterio                   | Deducao             |
|----------------------------|---------------------|
| Rastreador conhecido       | -5 cada (max -35)   |
| Dominio de terceiro        | -2 cada (max -15)   |
| Cookie de terceiro         | -3 cada (max -15)   |
| Supercookie                | -5 cada (max -10)   |
| Canvas Fingerprinting      | -15                 |
| HTML5 Storage usado        | -5                  |
| Armazenamento avancado     | -5                  |
| Sincronismo de cookie      | -10 por dom (max -20)|
| Hijacking alta severidade  | -20 cada (max -40)  |
| Hijacking media severidade | -10 cada (max -20)  |

| Faixa   | Classificacao |
|---------|---------------|
| 80-100  | Excelente     |
| 60-79   | Bom           |
| 40-59   | Regular       |
| 20-39   | Ruim          |
| 0-19    | Critico       |

### Categorias de Rastreadores

- advertising: redes de anuncios (DoubleClick, Criteo, AppNexus...)
- analytics: ferramentas de analise (Google Analytics, Hotjar, Mixpanel...)
- social: redes sociais (Facebook, Twitter...)
- marketing: CRM e automacao (HubSpot, Marketo, Intercom...)
- data: coleta e fingerprinting (Demdex, BlueKai, LiveRamp...)
