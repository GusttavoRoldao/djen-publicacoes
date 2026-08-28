# Desenvolvimento

Instruções para clonar, modificar, compilar e gerar um novo instalador do zero.

## Pré-requisitos no Windows

| Ferramenta | Versão | Onde obter |
| --- | --- | --- |
| Node.js | 24 ou superior | <https://nodejs.org> |
| Rust | toolchain `stable-msvc` | <https://rustup.rs> |
| Microsoft C++ Build Tools | workload "Desenvolvimento para desktop com C++" | <https://visualstudio.microsoft.com/visual-cpp-build-tools/> |
| Microsoft Edge WebView2 | Runtime | já vem no Windows 11; no Windows 10, <https://developer.microsoft.com/microsoft-edge/webview2/> |

O `rustup` precisa apontar para MSVC:

```powershell
rustup default stable-msvc
```

## Clonar e rodar

```powershell
git clone https://github.com/vance/djen-publicacoes.git
cd djen-publicacoes
npm install
npm run dev:desktop
```

`npm run dev:desktop` sobe o Vite e abre a janela do Tauri com recarregamento automático.

## Verificações

```powershell
npm run check          # TypeScript estrito
npm test               # testes do frontend, sem rede
npm run check:native   # cargo check
npm run test:native    # testes Rust
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

Nenhum teste depende da internet nem do banco real. O harness em `tests/sqlite-database.ts` roda as mesmas
migrações do aplicativo em um SQLite em memória e reproduz a numeração de parâmetros do plugin SQL.

## Gerar o instalador

```powershell
npm run release
```

Esse comando roda `tauri build` e copia o resultado para `release\DJENPublicacoes-Setup.exe`, imprimindo o
tamanho e o SHA-256 do arquivo. Para compilar sem empacotar:

```powershell
npm run build:desktop -- --no-bundle
```

O instalador é NSIS, instala para o usuário atual sem exigir administrador, mostra a licença, cria atalho
no menu Iniciar e oferece o atalho na área de trabalho como opção. Não há atualização automática: é uma
decisão de projeto.

## Assinatura digital

O instalador sai sem assinatura, então o Windows mostra o aviso do SmartScreen. Para assinar antes de
divulgar, defina as variáveis abaixo e rode o build novamente:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "caminho\para\certificado.pfx"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "senha"
npm run release
```

Como alternativa, configure `bundle.windows.certificateThumbprint` em `src-tauri/tauri.conf.json` com a
impressão digital de um certificado instalado no Windows, ou assine o arquivo pronto:

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a release\DJENPublicacoes-Setup.exe
signtool verify /pa /v release\DJENPublicacoes-Setup.exe
```

Um certificado EV reduz o aviso do SmartScreen desde o primeiro download; um OV comum só depois de alguma
reputação acumulada.

## Estrutura

```
src/
  attorneys/     cadastro de OAB, validação e avatar
  djen/          cliente da API do CNJ e normalização
  monitor/       agendamento da busca diária
  providers/     contrato de fonte, adaptador CNJ e modo REST configurável
  publications/  acervo local, leitura do texto, exportação CSV e XLSX
  search/        motor de pesquisa manual e gravação transacional
  settings/      preferências
  storage/       exclusão, retenção e espaço em disco
  components/    peças de interface reutilizadas
  pages/         uma tela por aba
src-tauri/
  migrations/    esquema do SQLite, aplicado em ordem
  src/lib.rs     comandos nativos, bandeja, ciclo de vida e cofre de credenciais
tests/           testes do frontend
docs/            validação de cada fase e manuais
```

Cores, tipografia e a marca estão em [design.md](./design.md).

A regra que sustenta o desenho: as telas e o banco não conhecem nenhuma fonte de dados. O motor recebe um
`PublicationProvider` e trabalha igual para todos. Veja [adaptadores.md](./adaptadores.md) para adicionar
uma fonte nova.

## Banco de dados

O SQLite fica em `%APPDATA%\br.com.djenpublicacoes.desktop\djen-publicacoes.db`, fora da pasta do
executável. As migrações em `src-tauri/migrations/` são aplicadas em ordem pelo plugin SQL e nunca alteram
tabelas existentes — só criam com `IF NOT EXISTS`. Para inspecionar o banco durante o desenvolvimento:

```powershell
node .qa\inspect-monitor.mjs "$env:APPDATA\br.com.djenpublicacoes.desktop\djen-publicacoes.db"
```

Operações que precisam ser atômicas passam pelo comando nativo `execute_transaction`, que abre uma conexão
própria com chaves estrangeiras ligadas. O plugin SQL sozinho executa comandos avulsos por um pool e não
garantiria a transação.

## Segredos

Chaves de fontes pagas ficam no Gerenciador de Credenciais do Windows, pelo crate `keyring`, sob o serviço
`br.com.djenpublicacoes.desktop`. Elas nunca entram no SQLite nem no WebView: a requisição HTTP dessas
fontes é feita no Rust, em `rest_request`, que lê a chave do cofre e a remove de qualquer mensagem de erro
antes de devolver à interface.

## Medir desempenho

```powershell
node .qa\bench-50k.ts 50000
```

Cria um banco temporário com 50 mil publicações sintéticas, mede abertura, filtros, exclusão e compactação,
e apaga tudo ao final. Não toca no banco real.

## Publicar uma versão

1. atualize `version` em `package.json` e em `src-tauri/tauri.conf.json`;
2. rode todas as verificações acima;
3. `npm run release`;
4. assine o instalador;
5. publique na aba Releases do GitHub, seguindo [publicar-release.md](./publicar-release.md);
6. instale o arquivo publicado em uma máquina limpa e repita o fluxo completo antes de divulgar.
