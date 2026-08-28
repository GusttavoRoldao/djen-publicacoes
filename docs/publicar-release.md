# Como publicar uma versão no GitHub

A aba **Releases** é onde ficam os arquivos para download. O código fica no repositório; o instalador
pronto fica na release. São coisas separadas de propósito — o `.exe` não deve ser versionado no git, por
isso `release/` está no `.gitignore`.

## Uma vez só: criar o repositório

1. no GitHub, clique em **New repository**;
2. nome: `djen-publicacoes`, visibilidade **Public**;
3. **não** marque "Add a README" — o projeto já tem um;
4. crie e siga as instruções que o GitHub mostra para enviar o código.

Depois disso, ajuste em `README.md` e em `docs/desenvolvimento.md` o endereço
`https://github.com/vance/djen-publicacoes` para o endereço real, e o campo `bundle.homepage` em
`src-tauri/tauri.conf.json`.

## A cada versão

1. gere o instalador:

   ```powershell
   npm run release
   ```

   Guarde o SHA-256 que o comando imprime.

2. no GitHub, vá em **Releases** → **Draft a new release**;

3. preencha:

   | Campo | O que colocar |
   | --- | --- |
   | Choose a tag | `v0.1.0` — clique em "Create new tag on publish" |
   | Release title | `DJEN Publicações 0.1.0` |
   | Describe this release | o texto modelo abaixo |

4. arraste `release\DJENPublicacoes-Setup.exe` para a área **Attach binaries**;

5. clique em **Publish release**.

Pronto. O arquivo passa a aparecer na aba Releases e o botão de download do `README.md` funciona.

## Os dois links que importam

Depois da primeira release, estes endereços passam a existir e nunca mudam:

| Para quê | Endereço |
| --- | --- |
| Mandar a pessoa escolher | `https://github.com/USUARIO/djen-publicacoes/releases/latest` |
| Baixar direto, sem passar pela página | `https://github.com/USUARIO/djen-publicacoes/releases/latest/download/DJENPublicacoes-Setup.exe` |

O segundo é o mais útil para divulgar: ele sempre entrega a versão mais nova, então o link que você mandar
hoje continua certo depois de dez atualizações. Basta manter o nome do arquivo igual em toda release — que
é o que o `npm run release` garante.

O `README.md` já usa o caminho relativo `../../releases/latest`, que funciona sozinho depois que o
repositório existir, sem precisar escrever o nome do usuário.

## Texto modelo da release

```markdown
Aplicativo gratuito para acompanhar publicações do DJEN pela OAB. Instala no Windows, guarda tudo no seu
próprio computador, sem mensalidade e sem cadastro.

**Baixe o `DJENPublicacoes-Setup.exe` abaixo e execute.** Não precisa ser administrador.

⚠️ O Windows vai mostrar uma tela azul de "aplicativo não reconhecido". Não é vírus — o instalador ainda
não tem certificado digital pago. Clique em **Mais informações** e depois em **Executar assim mesmo**.

### O que tem nesta versão

- pesquisa por uma ou mais OABs, em qualquer período, com ou sem filtro de tribunal
- caixa de publicações com status, marcação de atenção e filtros
- exportação para Excel do que estiver filtrado
- monitoramento automático opcional, com bandeja do Windows
- exclusão por seleção, por pesquisa ou por período, e controle de espaço

### Verificação do arquivo

SHA-256: `COLE_AQUI_O_HASH`

Confira com:

    Get-FileHash "DJENPublicacoes-Setup.exe" -Algorithm SHA256

---

Esta ferramenta auxilia o acompanhamento e não substitui a consulta aos canais oficiais nem a conferência
profissional. Cobre apenas o DJEN.
```

## Antes de publicar, confira

- `validation-output/` e `.qa/` estão no `.gitignore`: as publicações reais usadas nos testes **não** vão
  para o GitHub;
- o banco fica em `%APPDATA%`, fora do projeto, então nunca entra no repositório;
- os documentos de validação das Fases 0 e 3 citam a OAB real usada nos testes (`123456/PE`). Número de OAB
  é informação pública, mas se preferir, troque por um exemplo antes de publicar.
