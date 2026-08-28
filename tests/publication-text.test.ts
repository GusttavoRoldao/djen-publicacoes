import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { excerptOf, toReadableText } from "../src/publications/text.ts";

const TJSP_SAMPLE = `<html> <head> <meta> <style></style> </head> <body> <article> <header> <div></div> </header>
<section><b>Procedimento Comum C&iacute;vel N&ordm; 1000000-11.2020.8.26.0100/SP</b></section>
<section><b><table><tr><td>AUTOR</td><td>: JOAO PEREIRA DOS SANTOS</td></tr>
<tr><td>ADVOGADO(A)</td><td>: MARIA SILVA ARA&uacute;JO (OAB PE0123456)</td></tr></table></b></section>
<section><p align="center">DESPACHO/DECIS&Atilde;O</p></section> </article> </body> </html>`;

describe("leitura do texto recebido da fonte", () => {
  it("remove a marcação e devolve o conteúdo em leitura corrida", () => {
    const readable = toReadableText(TJSP_SAMPLE);

    assert.ok(!readable.includes("<"), "nenhuma tag pode sobrar");
    assert.ok(!readable.includes("&iacute;"), "nenhuma entidade pode sobrar");
    assert.ok(readable.startsWith("Procedimento Comum Cível Nº 1000000-11.2020.8.26.0100/SP"));
    assert.ok(readable.includes("AUTOR : JOAO PEREIRA DOS SANTOS"));
    assert.ok(readable.includes("MARIA SILVA ARAúJO (OAB PE0123456)"));
    assert.ok(readable.includes("DESPACHO/DECISÃO"));
  });

  it("descarta o conteúdo de style e script, que não é texto da publicação", () => {
    const readable = toReadableText(
      "<style>body{padding:10px;font-family:Times}</style><p>Intimação da parte.</p><script>alert(1)</script>",
    );

    assert.equal(readable, "Intimação da parte.");
  });

  it("preserva o texto quando a fonte não envia marcação", () => {
    const plain = "Intimação referente ao movimento (seq. 3) DISTRIBUÍDO POR SORTEIO (18/08/2026).";

    assert.equal(toReadableText(plain), plain);
  });

  it("decodifica entidades numéricas e nomeadas", () => {
    assert.equal(toReadableText("Se&ccedil;&atilde;o &#8212; 2&ordf; Turma &amp; Vara"), "Seção — 2ª Turma & Vara");
    assert.equal(toReadableText("Aud&iecirc;ncia"), "Aud&iecirc;ncia", "entidade desconhecida fica como veio");
  });

  it("decodifica &lt; e &gt; sem transformar o resultado em tag", () => {
    assert.equal(toReadableText("<p>valor &lt;b&gt; literal</p>"), "valor <b> literal");
  });

  it("preserva endereços escritos entre sinais de menor e maior", () => {
    const raw = "<p>EMITIDA ATRAV&Eacute;S DO SITE www.stf.jus.br &lt;https://www.stf.jus.br&gt;) E PORTE</p>";
    const literal = "<span>acesse <https://esaj.tjsp.jus.br/cpopg/open.do> hoje</span>";

    assert.equal(toReadableText(raw), "EMITIDA ATRAVÉS DO SITE www.stf.jus.br <https://www.stf.jus.br>) E PORTE");
    assert.equal(toReadableText(literal), "acesse <https://esaj.tjsp.jus.br/cpopg/open.do> hoje");
  });

  it("remove tags com atributos, fechadas em si mesmas e com prefixo de espaço de nomes", () => {
    assert.equal(toReadableText('<p align="center">Centro</p>'), "Centro");
    assert.equal(toReadableText("Antes<br />Depois"), "Antes\nDepois");
    assert.equal(toReadableText("<o:p>Word</o:p>"), "Word");
    assert.equal(toReadableText("<td\n  colspan=\"2\">Célula</td>"), "Célula");
  });

  it("decodifica diacríticos soltos, sem letra antes", () => {
    assert.equal(toReadableText("<p>&acute;Passa-se ao exame</p>"), "´Passa-se ao exame");
  });

  it("não decodifica duas vezes o que a fonte já escapou", () => {
    assert.equal(toReadableText("<p>SAFRA&amp;#8239;CR&Eacute;DITO</p>"), "SAFRA&#8239;CRÉDITO");
  });

  it("separa blocos e limita a no máximo uma linha em branco entre eles", () => {
    assert.equal(toReadableText("<p>Primeiro</p>\n\n\n<p>Segundo</p>"), "Primeiro\n\nSegundo");
    assert.equal(toReadableText("Primeiro<br>Segundo"), "Primeiro\nSegundo");
    assert.equal(toReadableText("<div>  muito   espaço  </div>"), "muito espaço");
  });

  it("corta o trecho na última palavra inteira", () => {
    const short = excerptOf("Intimação curta.", 320);
    const long = excerptOf(`Intimação ${"muito longa ".repeat(60)}`, 40);

    assert.deepEqual(short, { excerpt: "Intimação curta.", truncated: false });
    assert.equal(long.truncated, true);
    assert.ok(long.excerpt.length <= 40);
    assert.ok(!long.excerpt.endsWith(" "));
    assert.ok(long.excerpt.startsWith("Intimação muito longa"));
  });

  it("gera o trecho legível a partir de uma publicação com marcação", () => {
    const { excerpt, truncated } = excerptOf(toReadableText(TJSP_SAMPLE), 60);

    assert.equal(truncated, true);
    assert.ok(!excerpt.includes("<"));
    assert.ok(excerpt.startsWith("Procedimento Comum Cível"));
  });
});
