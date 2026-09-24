// Movido pra components/ui/AutocompleteInput.tsx (componente compartilhado,
// usado em várias telas do sistema agora, não só em Produtos). Esse
// arquivo fica só como re-export pra não quebrar import antigo perdido.
export { AutocompleteInput } from '../ui/AutocompleteInput';
export type { AutocompleteOption } from '../ui/AutocompleteInput';
