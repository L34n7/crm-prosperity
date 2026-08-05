# Padrão obrigatório de frontend

O CRM Prosperity utiliza Next.js com TypeScript. Todo código visual novo ou alterado deve seguir estas regras:

- Componentes, páginas, formulários, modais e elementos visuais devem ser implementados em arquivos `.tsx`.
- Estilos devem ficar em arquivos `.module.css` ou no CSS global quando forem tokens e regras realmente globais.
- Regras de negócio compartilhadas devem ficar em arquivos `.ts`.
- Rotas de API e código de servidor devem usar `.ts` ou `.tsx` conforme o tipo do módulo.
- Não implementar interfaces usando `innerHTML`, `dangerouslySetInnerHTML`, strings de HTML ou injeção de tags `<style>` em tempo de execução.
- Não criar scripts `.mjs`, regex ou etapas de build para reescrever arquivos dentro de `src/`.
- Não adicionar scripts de mutação de código aos comandos `dev`, `prebuild`, `build` ou `start`.
- Mudanças devem ser feitas diretamente no componente e no arquivo de estilo responsáveis pela funcionalidade.
- Arquivos `.mjs` são permitidos somente para tarefas operacionais independentes, migrações ou utilitários que não montem interface e não modifiquem o código-fonte durante a execução ou build.

Para a Agenda, a apresentação dos intervalos deve ser mantida em:

- `src/app/(private)/agendas/AgendaAvailabilityPresentation.tsx`
- `src/app/(private)/agendas/AgendaAvailabilityPresentation.module.css`

Ao encontrar uma funcionalidade visual antiga aplicada por script, migrar primeiro para `.tsx` e `.module.css` e depois remover o aplicador legado.
