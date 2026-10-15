# Arquivo Digital — SIR Motors

Portal estático de consulta e gestão do **arquivo físico**. Prateleiras A1–Z6, posições inteiras ≥1, ordenação por prateleira alfanumérica e posição. Backend pretendido: **Power Automate + Excel Online no SharePoint**, pasta `arquivo`, livro `Arquivo`, tabela **`tblArquivoDigital`**. Tabelas auxiliares na folha **`Listas`**: **`tblDepartamentos`** e **`tblPrateleira`**.

## Execução

Abra `index.html` ou publique a branch `main` via **Settings → Pages → Deploy from a branch → main / (root)**.

A aplicação inicia em **modo demonstração** (apenas dados exemplificativos, guardados na memória da página, não no SharePoint) até configurar `config.js`. Não confunda demonstração com dados reais. Depois de publicar, todos os ficheiros do repositório são públicos.

## Campos exactos do Excel

`ID`, `Departamento`, `Prateleira`, `Posição`, `Nome do Ficheiro`, `Ano Início`, `Ano Fim`, `Período`, `Observações`, `Data de Cadastro`, `Data de Actualização`, `Actualização`.

**NÃO preencher a coluna `Período` na criação/edição:** é uma fórmula da tabela Excel. Deve manter-se calculada no próprio livro. Atenção às colunas acentuadas no mapeamento dos fluxos.

## Contrato JSON da API (a implementar)

A aplicação chama `POST apiUrl` com body:

- Leitura: `{ "action": "list" }` → `{ "ok": true, "departments": ["Tesouraria", "Contabilidade", "Recursos Humanos"], "shelves": ["A1", "A2", "B3", "C6"], "records": [ { "ID": 1, "Departamento": "...", "Prateleira": "A1", "Posição": 1, "Nome do Ficheiro": "...", "Ano Início": 2020, "Ano Fim": 2022, "Período": "2020–2022", "Observações": "...", "Data de Cadastro": "...", "Data de Actualização": "..." } ] }`.
- Inserção: `{ "action": "create", "record": { "Departamento": "...", "Prateleira": "A1", "Posição": 2, "Nome do Ficheiro": "...", "Ano Início": 2020, "Ano Fim": 2022, "Observações": "..." } }`.
- Edição/reposicionamento: `{ "action": "update", "id": 1, "record": { ... } }`.
- Eliminação: `{ "action": "delete", "id": 1 }`.
- Escritas com sucesso: `{ "ok": true }`; conflito de posição: HTTP 409 e `{ "ok": false, "code": "POSITION_OCCUPIED", "message": "A posição já está ocupada." }`. Uma API também pode responder HTTP 200 com `ok:false` se o conector não permitir 409.

Os registos retornados devem conter **ID único** e localização exclusiva. Os dados são recarregados após cada escrita. A validação do browser é apenas auxiliar; o backend deve impor todas as invariantes.

## Atenção — simultaneidade

**Uma tabela Excel ligada ao Power Automate não oferece transacções nem restrições exclusivas.** Um simples "List rows → Condition → Add row" NÃO garante que duas pessoas não ocupem simultaneamente a mesma posição. Antes de activar escrita real, implemente um único escritor serializado (por exemplo, fila de operações numa lista SharePoint com coluna `Localizacao` única + processador dedicado com concorrência 1), ou migre os registos para uma lista SharePoint com coluna de chave única e operações de escrita com controlo de versão. O Excel pode continuar como relatório sincronizado, mas não é uma origem de escrita segura para garantias fortes de simultaneidade.

**Não publique um endpoint de Power Automate com autorização `Anyone` para editar/eliminar documentos empresariais:** a URL funciona como segredo e fica visível no browser. Configure autenticação/um backend de proxy autorizado antes de ligar operações reais. Não é possível garantir "apenas colaboradores" num site público e sem login.

## Passos de implementação

1. Confirmar o nome e extensão exactos do livro e a localização no SharePoint; verificar que a tabela `tblArquivoDigital` é legível pelo conector Excel Online (Business).
2. Criar o backend com as operações acima, autorização adequada e garantia de exclusividade da chave `Prateleira+Posição` em concorrência.
3. Consultar no mesmo livro as tabelas `tblDepartamentos` e `tblPrateleira` da folha `Listas`, e devolver os valores em `departments` e `shelves`. O portal obriga a seleccionar valores dessas tabelas. **Colunas confirmadas:** `tblDepartamentos[Departamento]` e `tblPrateleira[Prateleira]` para criar os fluxos de mapeamento.
4. Testar individualmente consulta, nova posição, conflito simultâneo, reposicionamento, eliminação e fórmula de `Período`.
5. Configurar `config.js` (`apiUrl` e `demo:false`) apenas quando a API estiver operacional e o controlo de acesso implementado.
6. Publicar em GitHub Pages.

O botão de eliminação apaga o registo no modo demonstração. Em produção, considere uma política de arquivo/inactivação e trilho de auditoria antes de permitir apagar definitivamente.
\n## Posições disponíveis\n\nAo escolher a prateleira, o formulário mostra **apenas as posições livres**, de 1 até ao maior número de posição já ocupado nessa prateleira **mais 1**. Ex.: ocupadas 1, 2 e 4 → opções 3 e 5. Numa prateleira vazia mostra 1. Ao editar, a posição actual do próprio documento continua disponível. A validação final de exclusividade deve ocorrer no backend, incluindo chamadas simultâneas.\n