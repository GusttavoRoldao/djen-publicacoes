# DJEN Publicações — manual de uso

Aplicativo gratuito para pesquisar e organizar publicações do Diário de Justiça Eletrônico Nacional no seu
computador. Tudo fica salvo aqui, sem mensalidade e sem enviar seus dados para ninguém.

> Esta ferramenta auxilia o acompanhamento e não substitui a consulta aos canais oficiais nem a conferência
> profissional. Ela cobre apenas o DJEN.

## Instalar

1. Baixe o arquivo `DJENPublicacoes-Setup.exe`.
2. Clique duas vezes nele.
3. O Windows pode mostrar um aviso azul de "aplicativo não reconhecido". Clique em **Mais informações** e
   depois em **Executar assim mesmo**. Isso acontece porque o instalador ainda não tem assinatura digital.
4. Aceite a licença e siga o assistente. Não é preciso ser administrador.
5. Na última tela, marque **criar atalho na área de trabalho** se quiser.

Você não precisa instalar mais nada. Se o componente Microsoft Edge WebView2 estiver faltando, o próprio
instalador cuida disso.

## Primeiro uso

O aplicativo abre com algumas perguntas:

- **sua OAB**: número, estado e um nome para identificar o perfil. Pode cadastrar mais de uma depois;
- **foto**: opcional. Sem foto, aparecem as suas iniciais;
- **monitoramento automático**: leia a seção abaixo antes de decidir;
- **por quanto tempo guardar as publicações**: leia com atenção, porque essa escolha apaga dados sozinha.

## Pesquisar

Na aba **Pesquisas**:

1. escolha uma ou mais OABs;
2. informe a data inicial e a final. Pode ser um único dia ou um período longo;
3. o tribunal é opcional — deixe em branco para procurar no país inteiro;
4. clique em **Pesquisar**.

Nada é consultado antes de você clicar. Períodos longos são divididos automaticamente, e a barra mostra o
andamento. Dá para cancelar a qualquer momento: nada pela metade é salvo.

Logo abaixo fica o **histórico**. Clicar em `Ver resultados` reabre uma pesquisa antiga lendo só o que já
está no seu computador, sem consultar a internet de novo.

## Organizar as publicações

Na aba **Publicações** está tudo o que suas pesquisas encontraram.

Cada publicação tem um **status local**, que só existe aqui e serve para o seu controle:

- **Não conferida** — o estado inicial;
- **Conferida** — você já leu;
- **Descartada** — não interessa.

Independente do status, a **estrela** marca `Requer atenção`. Itens marcados assim nunca são apagados pela
limpeza automática.

**Abrir detalhes** mostra o texto completo como veio do tribunal, o processo, o órgão, os advogados, as
partes e o link oficial. Alguns tribunais enviam o texto com código de formatação; nesse caso o aplicativo
mostra a versão legível e oferece o botão `Ver a marcação recebida` para conferir o original.

Os filtros do topo combinam entre si: status, tribunal, sua OAB, período, número do processo e palavra no
texto. Nada disso consulta a internet.

## Exportar para planilha

Ainda na aba **Publicações**, o botão **Exportar para planilha** salva exatamente o que os filtros deixaram
na tela. Escolha onde salvar. O formato padrão é `.xlsx`, que abre formatado no Excel; se preferir texto
puro, troque o tipo para `.csv` na mesma janela.

## Monitoramento automático

Quando **ligado**:

- o aplicativo inicia junto com o Windows, minimizado;
- faz uma busca por dia, no horário que você escolher;
- se o computador ficou dias desligado, ele busca o período perdido;
- fechar a janela no **X** apenas esconde o aplicativo, que continua na bandeja, ao lado do relógio;
- clicando com o botão direito no ícone da bandeja você tem **Abrir**, **Pesquisar agora**, **Pausar** e
  **Sair completamente**.

Quando **desligado**, o aplicativo não inicia com o Windows e fechar no **X** encerra tudo.

Para desligar: **Configurações → Monitoramento em segundo plano**. Isso também remove a inicialização
automática com o Windows.

## Espaço e exclusão

Em **Configurações** você vê quantas pesquisas e publicações estão salvas e quanto espaço ocupam.

- **Excluir por período** — apaga o que foi disponibilizado dentro de um intervalo;
- **Limpar o acervo** — apaga pesquisas e publicações, mas mantém suas OABs e preferências;
- **Restaurar o aplicativo** — apaga tudo, inclusive OABs, e volta ao primeiro uso;
- **Compactar o banco** — recupera o espaço em disco depois de uma exclusão grande. O SQLite não devolve
  espaço sozinho, então vale rodar isso depois de apagar muita coisa.

Na lista de publicações também dá para selecionar várias e excluir de uma vez, e cada pesquisa do histórico
tem uma lixeira que remove só as publicações exclusivas dela.

Toda exclusão mostra antes exatamente quantas publicações serão removidas. Ela vale só para a sua cópia:
nada muda nos registros do CNJ, e a mesma publicação pode voltar em uma nova pesquisa.

## Retenção automática — leia antes de escolher

Em **Configurações → Retenção de dados** você escolhe por quanto tempo guardar as publicações. Se escolher
um prazo, o aplicativo apaga sozinho, uma vez por dia, tudo que for mais antigo que ele.

Isso é útil para não acumular anos de publicações, mas **apaga de verdade**. Ao escolher um prazo, o
aplicativo mostra quantas publicações serão removidas naquele momento, e avisa no topo da tela sempre que a
limpeza apagar algo. Publicações marcadas com a estrela `Requer atenção` nunca são apagadas por ela.

Se preferir não perder nada, escolha **Manter até eu excluir**.

## Fontes de dados

A aba **Fontes** existe para quem assina outra API de publicações. A fonte do CNJ vem pronta, é gratuita e
não precisa de configuração. Se você usa só ela, pode ignorar essa aba.

## Onde ficam os seus dados

Em `%APPDATA%\br.com.djenpublicacoes.desktop`, fora da pasta do programa. Reinstalar o aplicativo não apaga
esses dados. Ao desinstalar, o Windows pergunta se você quer removê-los também.

Nada é enviado para servidores da Vance. As consultas vão direto para a API pública do CNJ.

## Desinstalar

Menu Iniciar → **Configurações do Windows → Aplicativos** → procure por DJEN Publicações → **Desinstalar**.
Ao final, responda se quer apagar também as publicações salvas.
