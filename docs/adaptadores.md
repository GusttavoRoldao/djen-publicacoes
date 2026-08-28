# Como adicionar uma nova fonte de dados

Há dois caminhos. O primeiro não exige programar; o segundo é para fontes que o primeiro não alcança.

## 1. API REST pela interface

Em `Fontes`, use `Adicionar API REST`. Serve para APIs que aceitam os dados da pesquisa como parâmetros na
URL e devolvem JSON. Você configura:

- URL-base e método;
- autenticação: sem chave, chave em cabeçalho, chave na URL ou token Bearer;
- o nome que a fonte dá a cada parâmetro da pesquisa;
- o caminho de cada campo dentro da resposta, em notação de ponto;
- cabeçalhos e parâmetros fixos.

O botão `Testar conexão` faz uma consulta real e mostra a primeira publicação já normalizada, para você
conferir o mapeamento antes de salvar.

A chave vai para o Gerenciador de Credenciais do Windows. Ela não é gravada no SQLite e não sai quando
você copia a configuração para outro computador.

## 2. Adaptador no código

Uma fonte com autenticação própria, assinatura de requisição, paginação por cursor ou resposta que não é
JSON precisa de um adaptador. O contrato é pequeno, em `src/providers/publication-provider.ts`:

```ts
export interface PublicationProvider {
  readonly id: string;
  readonly name: string;
  search(query: DjenSearch, options?: ProviderSearchOptions): Promise<SearchResult>;
}
```

`DjenSearch` traz `oab`, `uf`, `startDate`, `endDate` e `tribunal` opcional. `SearchResult` devolve `total`,
`publications` e `rateLimit`. Nada além disso é exigido.

### Passo a passo

1. **Crie a pasta do adaptador** em `src/providers/<sua-fonte>/`, com um cliente que fale com a API e um
   normalizador que devolva `Publication`.

2. **Preencha `Publication` por inteiro.** O campo `source` precisa ser o identificador da sua fonte, e não
   `DJEN/CNJ`. Ele entra na chave de deduplicação, em `src/search/repository.ts`:

   ```ts
   publication.sourceId
     ? `${publication.source}:${publication.sourceId}`
     : [publication.source, publication.tribunal, publication.communicationNumber, publication.processNumber, publication.availableOn].join("|")
   ```

   Duas fontes podem usar o mesmo identificador para publicações diferentes. Como `source` abre a chave,
   elas não colidem. Se o seu adaptador reaproveitar `source` de outra fonte, elas passam a colidir.

3. **Guarde o texto como veio.** Não resuma, não reordene e não remova a marcação: a leitura legível é
   feita na exibição, por `src/publications/text.ts`. O texto original precisa ficar intacto no banco.

4. **Trate o limite de requisições.** Respeite HTTP 429 com recuo, aceite o `AbortSignal` de
   `ProviderSearchOptions` e informe o andamento por `onProgress`.

5. **Faça a requisição no processo nativo** se a fonte usar credencial. Os comandos em
   `src-tauri/src/lib.rs` mostram o caminho: `save_provider_secret`, `has_provider_secret` e
   `delete_provider_secret` falam com o cofre do sistema, e `rest_request` monta a requisição já com a
   chave. Assim ela nunca entra no WebView. Se preferir um comando próprio, copie a função `redact`, que
   remove o segredo de qualquer mensagem de erro.

6. **Registre o adaptador** em `src/providers/registry.ts`, dentro de `resolveActiveProvider` e
   `listProviders`. Use um `id` estável: ele é gravado em `app_settings.active_provider` e nas publicações.

7. **Escreva os testes.** O cliente deve receber o transporte por parâmetro, como `RestClient` faz, para
   que os testes rodem sem rede. Veja `tests/rest-provider.test.ts`.

### O que não precisa mudar

As telas de pesquisa, de resultados e o banco não conhecem fonte nenhuma. O motor em
`src/search/engine.ts` recebe um `PublicationProvider` e trabalha igual para todos: divide o intervalo,
pagina, deduplica e grava. Um adaptador novo não deve exigir alteração em nenhum desses arquivos.

## Compilar depois de mudar

```powershell
npm install
npm run check
npm test
npm run check:native
npm run test:native
npm run build:desktop -- --no-bundle
```
