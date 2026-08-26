# Agenda como fonte fiel do funil

## Objetivo
Fazer as colunas **Agendado** e **Visita realizada** refletirem exatamente os registros e indicadores do projeto Agenda, sem deduplicar agendamentos por lead.

## Implementação
- Criar um espelho de agendamentos no banco, com um registro por agendamento da Agenda, incluindo status, datas, cliente, telefone, empreendimento e corretor informado pela Agenda.
- Vincular cada agendamento a um lead do C2S por esta ordem: identificador já conhecido, telefone normalizado e nome normalizado.
- Guardar explicitamente se o contato foi encontrado no C2S e exibir essa informação nos cartões; contatos sem correspondência não serão silenciosamente tratados como leads do C2S.
- Vincular o corretor usando o nome ou apelido exato recebido da Agenda. Quando não houver correspondência exata, manter o agendamento visível e identificado como “Corretor não vinculado”, sem atribuí-lo a outra pessoa.
- Parar de agrupar vários agendamentos no mesmo lead: cada registro da Agenda contará uma vez, preservando fielmente os totais.
- Alimentar as colunas **Agendado** e **Visita realizada** com o espelho da Agenda; os demais estágios continuam usando os leads do C2S.
- Renomear “Visita agendada” para **Agendado** em todo o funil.
- Manter filtros de período e corretor funcionando também para os dados da Agenda, usando as datas fornecidas por ela.
- Ajustar o histórico da sincronização para mostrar processados, vinculados ao C2S, não vinculados e corretores não reconhecidos.

## Regras de contagem
- **Agendado:** quantidade de registros classificados como agendados no indicador/exportação da Agenda para o período selecionado.
- **Visita realizada:** quantidade de registros classificados como realizados na Agenda para o período selecionado.
- Um mesmo cliente pode contar mais de uma vez se possuir mais de um agendamento, exatamente como no projeto Agenda.
- Registros desmarcados permanecem sincronizados para auditoria, mas não entram em Agendado nem em Visita realizada.

## Validação
- Executar uma reconciliação completa da Agenda.
- Comparar os totais por status e por corretor com os dados exportados pela Agenda.
- Conferir visualmente os cartões, os avisos “C2S”/“Não encontrado no C2S” e os filtros no funil.
