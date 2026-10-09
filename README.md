# FZL Emacs Buku Bookmarks

> **Extensão de Navegador Portável (Chromium & Firefox) integrada com o fzl-emacs e Buku.**  
> *Cross-browser extension portable between Chromium, Google Chrome, Brave, Edge, and Mozilla Firefox to search, open, and add bookmarks to your local Buku database and interact with Emacs.*

---

## 🚀 Visão Geral / Overview

Esta extensão conecta seus navegadores favoritos diretamente à base de favoritos SQLite do **Buku** e ao seu ambiente **`fzl-emacs`**, eliminando a necessidade de sincronização em nuvem e mantendo 100% de privacidade e controle local dos seus dados.

### Principais Funcionalidades:
1. 📌 **Adicionar Página Atual com 1 Clique:**
   - Captura automaticamente URL, título e seleção de texto da aba ativa.
   - Autocompletar inteligente de tags baseado nos grupos já existentes no seu banco.
   - Chips de tags populares clicáveis para categorização rápida (`ia`, `dev`, `emacs`, `linux`, `projetos`, etc.).
   - **Regra de Unicidade Inteligente:** Se a URL já existir no Buku, a extensão não gera erro; ela anexa automaticamente as novas tags ao favorito existente (reproduzindo exatamente o comportamento do `desktoping-buku-add-bookmark` do `fzl-emacs`!).
   - Notificação visual instantânea (estrela ★ no ícone) se a página já estiver favoritada.

2. 🔍 **Pesquisa Rápida e Abertura de Favoritos:**
   - Busca fuzzy instantânea no popup por título, URL, tags ou anotações.
   - Filtro por carrossel de tags/grupos com contador.
   - **"Open All in Tabs" (🚀):** Abre todos os links de uma tag/grupo em abas simultâneas no navegador com um clique (o equivalente do `C-c d b o` / `desktoping-buku-open-all-in-tag` do Emacs no navegador!).
   - Ações rápidas em cada link: Abrir em nova aba, abrir na aba atual, copiar link, editar tags ou deletar.

3. 📑 **Salvar Abas Abertas em Lote (Batch Save / Staging):**
   - Lista todas as abas abertas da janela atual com título, favicon e checkbox.
   - Selecionar todas / desselecionar todas com 1 clique.
   - Definir uma tag/grupo (ex: `pesquisa-ia`, `projeto-x`) e salvar todas as abas selecionadas no Buku de uma só vez.

4. ⚡ **Hub de Integração com o Emacs:**
   - Status em tempo real do `emacsclient` (Online 🟢 / Offline ⚪).
   - Disparo direto de funções do seu `desktoping-apps.el` com um clique:
     - 🔍 `desktoping-buku-search-and-open` (`C-c d b s`)
     - 🗂️ `desktoping-buku-open-manager` (`C-c d b b`)
     - 🌅 `desktoping-buku-open-start-day-urls-buffer` (`C-c d b S`)
     - 🏷️ `desktoping-buku-browse-by-tag` (`C-c d b g`)
     - 📖 `desktoping-buku-open-tutorial` (`C-c d b t`)
     - ➕ `desktoping-buku-add-bookmark` (`C-c d b a`) com a URL da aba preenchida!

5. 🔎 **Pesquisa Direta na Barra de Endereços (Omnibox):**
   - Digite `bk` seguido de espaço na barra de endereços do navegador (ex: `bk emacs` ou `bk gnu`).
   - Os favoritos correspondentes aparecem diretamente no autocompletar da barra de endereços!

6. 🔌 **Arquitetura de Comunicação Dupla (Dual-Driver):**
   - **Native Messaging Host (Padrão / Recomendado):** Comunicação stdio local direta via Python, sem portas abertas ou daemons em segundo plano.
   - **Local HTTP Bridge (Fallback Opcional):** Servidor REST local em `http://127.0.0.1:8765` caso você prefira rodar um serviço em background.

---

## 📂 Estrutura do Projeto

```text
fzl-emacs-bookmarks/
├── manifest.json              # Manifesto V3 universal
├── manifest.chromium.json     # Manifesto otimizado para Chromium/Chrome/Brave com Key fixa
├── manifest.firefox.json      # Manifesto otimizado para Firefox com Gecko ID
├── background/
│   └── background.js          # Service worker / background script (Native & HTTP bridge)
├── popup/
│   ├── popup.html             # Interface principal
│   ├── popup.css              # Estilos Material Dark / Light (100% offline, zero-CDN)
│   └── popup.js               # Lógica interativa de busca, adição, abas e Emacs
├── options/
│   ├── options.html           # Tela de configurações e diagnósticos
│   ├── options.css            # Estilos da tela de configurações
│   └── options.js             # Lógica de preferências e testes
├── icons/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── icon.svg               # Ícone vetorial estilizado
├── native-host/
│   ├── fzl_buku_native_host.py # Host Python de Native Messaging (stdio)
│   ├── fzl_buku_server.py      # Servidor HTTP REST Bridge opcional (127.0.0.1:8765)
│   └── install-native-host.sh  # Script de instalação com 1 comando
├── tests/
│   └── test_extension_backend.py # Suite de testes automatizados
├── Makefile                   # Comandos make (test, package, install-host, etc.)
├── build.sh                   # Script de build, empacotamento e testes
└── README.md                  # Este guia completo
```

---

## 🛠️ Instalação Passo a Passo

### Passo 1: Instalar o Native Messaging Host no Linux
Para que os navegadores possam conversar com o banco SQLite e com o `buku` localmente, execute o instalador:

```bash
cd /home/wgn/mnt/ext4/Projects-Srcs/Projects-Srcs-Desktop/fzl-emacs/gitsubmodules/fzl-emacs-extension
make install-host
# ou diretamente:
./native-host/install-native-host.sh
```

Esse script registra o manifesto do host automaticamente em:
- Chromium: `~/.config/chromium/NativeMessagingHosts/`
- Google Chrome: `~/.config/google-chrome/NativeMessagingHosts/`
- Brave: `~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/`
- Mozilla Firefox: `~/.mozilla/native-messaging-hosts/`

---

### Passo 2: Instalar no Navegador

#### A. No Chromium / Google Chrome / Brave Browser:
1. Abra o navegador e acerte a URL: `chrome://extensions`
2. No canto superior direito, ative o botão **Modo do desenvolvedor** (*Developer mode*).
3. Clique em **Carregar sem compactação** (*Load unpacked*).
4. Selecione a pasta do projeto:
   `/home/wgn/mnt/ext4/Projects-Srcs/Projects-Srcs-Desktop/fzl-emacs/gitsubmodules/fzl-emacs-extension`
5. Pronto! A extensão aparecerá na sua barra de ferramentas com o ícone do FZL Buku.
   *(Dica: clique no ícone de "quebra-cabeça" na barra do navegador e fixe o FZL Buku para acesso rápido).*

#### B. No Mozilla Firefox:
1. Abra o Firefox e acerte a URL: `about:debugging#/runtime/this-firefox`
2. Clique no botão **Carregar extensão temporária...** (*Load Temporary Add-on...*).
3. Selecione o arquivo `manifest.json` dentro da pasta:
   `/home/wgn/mnt/ext4/Projects-Srcs/Projects-Srcs-Desktop/fzl-emacs/gitsubmodules/fzl-emacs-extension/manifest.json`
4. A extensão será carregada imediatamente no Firefox com o ID `fzl-emacs-buku@fzl.desktop`.

---

## 🧠 Conexão com o Emacs (`fzl-emacs`)

A extensão utiliza por padrão o banco versionado dentro do seu repositório:
```text
/home/wgn/mnt/ext4/Projects-Srcs/Projects-Srcs-Desktop/fzl-emacs/bookmarks/bookmarks.db
```

### Ativação do Emacs Server para Comandos Remotos
Para que os botões do **Emacs Hub** possam focar no Emacs e abrir o buffer do `ebuku` ou a busca interativa, o servidor do Emacs precisa estar ativo.

Você pode ativá-lo de duas formas:
1. **Manualmente na sessão do Emacs:**
   Pressione `M-x server-start RET`.
2. **Automaticamente no seu `init.el`:**
   Adicione este trecho ao seu `init.el` do `fzl-emacs`:
   ```elisp
   ;; Iniciar servidor do Emacs para integração com browser extension e emacsclient
   (require 'server)
   (unless (server-running-p)
     (server-start))
   ```

---

## ⌨️ Atalhos de Teclado

| Atalho | Ação | Descrição |
| :--- | :--- | :--- |
| `Ctrl + Shift + Y` | **Abrir Popup** | Abre a interface de busca e favoritos |
| `Alt + Shift + B` | **Quick Add** | Salva a aba atual instantaneamente com tag `staging` |
| `bk <termo>` | **Omnibox** | Na barra de URL do navegador, busca no Buku em tempo real |

---

## 🧪 Diagnósticos e Testes Automatizados

Para rodar os testes da suíte automatizada:

```bash
make test
# ou:
./build.sh test
```

### Gerar Pacotes `.zip` para Distribuição:

```bash
make package
# ou:
./build.sh package
```
Os arquivos gerados ficam em `dist/`:
- `dist/fzl-emacs-buku-chromium.zip`
- `dist/fzl-emacs-buku-firefox.zip`

---

## 🌐 Opção Alternativa: Servidor HTTP Bridge
Se por qualquer motivo você preferir não usar o Native Messaging ou quiser rodar a extensão em um container/ambiente isolado, pode rodar o servidor HTTP local:

```bash
make run-server
# ou:
python3 native-host/fzl_buku_server.py
```
O servidor escuta em `http://127.0.0.1:8765`. Nas **Configurações da extensão** (ícone ⚙️), altere o Driver para *Local HTTP Bridge*.
