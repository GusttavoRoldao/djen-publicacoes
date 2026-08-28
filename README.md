# DJEN Publicações

Aplicativo gratuito para Windows que busca e organiza suas publicações do Diário de Justiça Eletrônico
Nacional pela OAB. Tudo fica salvo no seu computador. Sem mensalidade, sem cadastro, sem nuvem.

## Baixar

**[Baixar a última versão](../../releases/latest)** — clique em `DJENPublicacoes-Setup.exe` e execute.

Não precisa ser administrador nem instalar mais nada.

> **O Windows vai mostrar uma tela azul** dizendo "aplicativo não reconhecido".
> Não é vírus. Acontece porque o instalador ainda não tem certificado digital pago.
> Clique em **Mais informações** e depois em **Executar assim mesmo**.

## O que ele faz

- busca publicações por uma ou mais OABs, em qualquer período, com ou sem filtro de tribunal;
- guarda tudo em um banco local, sem repetir a mesma publicação;
- marca cada publicação como conferida, descartada ou "requer atenção";
- filtra por tribunal, período, número do processo ou palavra no texto;
- exporta para Excel o que estiver filtrado na tela;
- opcionalmente, busca sozinho todo dia e fica na bandeja do Windows;
- apaga o que você mandar apagar, e mostra antes o que vai sumir.

Mostra o texto da publicação exatamente como o tribunal enviou. Nada é resumido nem interpretado por IA.

## Como usar

1. abra e cadastre sua OAB;
2. vá em **Pesquisas**, escolha as datas e clique em Pesquisar;
3. os resultados ficam na aba **Publicações**.

O [manual completo](./docs/manual-do-usuario.md) explica o resto: monitoramento automático, exportação,
exclusão e controle de espaço.

## Seus dados

Ficam em `%APPDATA%\br.com.djenpublicacoes.desktop`, só no seu computador. As buscas vão direto para a API
pública do CNJ. Nada é enviado para mim nem para ninguém.

## Aviso

Esta ferramenta auxilia o acompanhamento e **não substitui** a consulta aos canais oficiais nem a
conferência profissional. Ela cobre apenas o DJEN — não o Domicílio Judicial Eletrônico, nem diários
estaduais ou municipais.

## Para desenvolvedores

Tauri 2, React, TypeScript e SQLite.

```powershell
npm install
npm run dev:desktop
```

- [Como compilar e gerar o instalador](./docs/desenvolvimento.md)
- [Como publicar uma versão nas Releases](./docs/publicar-release.md)
- [Como adicionar outra fonte de dados](./docs/adaptadores.md)
- [Cores, fontes e a marca](./docs/design.md)

## Licença

[MIT](./LICENSE) — pode usar, modificar e redistribuir, inclusive comercialmente.
