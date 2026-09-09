import type { MenuRole } from './menu';

export type TourStep = {
    // Seletor CSS (via atributo data-tour) do elemento a destacar nesse
    // passo. O TourGuide espera até 8s o elemento aparecer na tela antes
    // de desistir — cobre casos em que a página ainda está carregando
    // dados quando o tutorial começa.
    selector: string;
    title: string;
    text: string;
};

export type Tour = {
    id: string;
    title: string;
    description: string;
    category: string;
    // Página (com query string, se precisar de aba específica) pra onde o
    // tutorial navega antes de começar a destacar os elementos.
    href: string;
    // Mesma lista de perfis que já enxergam essa ação de verdade — não
    // adianta mostrar um tutorial de algo que o perfil não pode fazer.
    roles: MenuRole[];
    steps: TourStep[];
};

export const tours: Tour[] = [
    {
        id: 'cadastrar-colaborador',
        title: 'Como cadastrar um colaborador',
        description: 'Criar login pra alguém da equipe acessar o sistema.',
        category: 'Cadastros',
        href: '/cadastros?tab=usuarios',
        // Mesmos perfis que conseguem criar pelo menos um tipo de usuário
        // (a tela em si já filtra quais perfis-alvo cada um pode atribuir).
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'],
        steps: [
            {
                selector: '[data-tour="user-form-name"]',
                title: 'Nome do colaborador',
                text: 'Comece preenchendo o nome completo da pessoa.',
            },
            {
                selector: '[data-tour="user-form-email"]',
                title: 'E-mail (login)',
                text: 'Esse e-mail vira o login dela no sistema — precisa ser único.',
            },
            {
                selector: '[data-tour="user-form-password"]',
                title: 'Senha',
                text: 'Defina uma senha inicial. A pessoa pode trocar depois.',
            },
            {
                selector: '[data-tour="user-form-role"]',
                title: 'Perfil de acesso',
                text: 'Escolha o que essa pessoa pode fazer no sistema. A explicação logo abaixo muda conforme você troca a opção.',
            },
            {
                selector: '[data-tour="user-form-stores"]',
                title: 'Lojas',
                text: 'Marque em quais lojas essa pessoa vai atuar.',
            },
            {
                selector: '[data-tour="user-form-submit"]',
                title: 'Criar usuário',
                text: 'Pronto! Clique aqui pra criar o colaborador.',
            },
        ],
    },
    {
        id: 'cadastrar-loja',
        title: 'Como cadastrar uma loja',
        description: 'Adicionar um novo estabelecimento ao sistema.',
        category: 'Cadastros',
        href: '/cadastros?tab=lojas',
        // Só quem cadastra/edita loja de verdade (regra de negócio).
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO'],
        steps: [
            {
                selector: '[data-tour="store-form-name"]',
                title: 'Nome da loja',
                text: 'Digite o nome pelo qual a loja é conhecida internamente.',
            },
            {
                selector: '[data-tour="store-form-cnpj"]',
                title: 'CNPJ',
                text: 'Informe o CNPJ — sem ele, a loja não busca NF-e automaticamente na Sefaz.',
            },
            {
                selector: '[data-tour="store-form-uf"]',
                title: 'UF',
                text: 'O estado (UF) também é necessário pra busca automática de NF-e.',
            },
            {
                selector: '[data-tour="store-form-submit"]',
                title: 'Criar loja',
                text: 'Pronto! Clique aqui pra criar a loja. Os outros campos (endereço, certificado digital) podem ser preenchidos depois.',
            },
        ],
    },
    {
        id: 'cadastrar-perda',
        title: 'Como registrar uma perda',
        description: 'Registrar com foto um produto perdido, quebrado ou vencido.',
        category: 'Perdas',
        href: '/losses?tab=registrar',
        roles: [
            'ADMINISTRATIVO',
            'PROPRIETARIO',
            'GERENTE',
            'COMPRADOR',
            'ESTOQUISTA',
            'FUNCIONARIO',
        ],
        steps: [
            {
                selector: '[data-tour="loss-photo"]',
                title: 'Foto do que foi perdido',
                text: 'Tire ou escolha uma foto do produto — é obrigatória pra cada registro.',
            },
            {
                selector: '[data-tour="loss-item-description"]',
                title: 'Descrição do produto',
                text: 'Descreva o que foi perdido. Dá pra adicionar mais de um item na mesma foto.',
            },
            {
                selector: '[data-tour="loss-item-quantity"]',
                title: 'Quantidade',
                text: 'Informe a quantidade perdida desse item.',
            },
            {
                selector: '[data-tour="loss-item-value"]',
                title: 'Valor unitário (opcional)',
                text: 'Preenchendo o valor, esse item fica disponível depois na aba "NF de Perda" pra entrar numa nota fiscal de baixa de estoque.',
            },
            {
                selector: '[data-tour="loss-submit"]',
                title: 'Registrar perda',
                text: 'Pronto! Clique aqui pra salvar o registro.',
            },
        ],
    },
    {
        id: 'gerar-nota-perda',
        title: 'Como gerar a NF de perda',
        description: 'Transformar perdas já registradas numa nota fiscal de baixa.',
        category: 'Perdas',
        href: '/losses?tab=nfe',
        roles: [
            'ADMINISTRATIVO',
            'PROPRIETARIO',
            'GERENTE',
            'COMPRADOR',
            'ESTOQUISTA',
            'FUNCIONARIO',
        ],
        steps: [
            {
                selector: '[data-tour="lossnfe-eligible"]',
                title: 'Perdas prontas pra NF',
                text: 'Só aparecem aqui perdas com valor unitário preenchido e que ainda não entraram em nenhuma NF. Marque as que quer incluir.',
            },
            {
                selector: '[data-tour="lossnfe-justificativa"]',
                title: 'Justificativa',
                text: 'Descreva o motivo da baixa — vai pro texto oficial da nota. Se for roubo/furto, inclua o número do B.O.',
            },
            {
                selector: '[data-tour="lossnfe-submit"]',
                title: 'Gerar NF de perda',
                text: 'Pronto! Clique aqui pra gerar e assinar a nota (ainda em ambiente de teste/homologação).',
            },
        ],
    },
    {
        id: 'baixar-notas-periodo',
        title: 'Como baixar notas por período',
        description: 'Baixar um .zip com todas as NFs de entrada de um mês ou intervalo de datas.',
        category: 'Notas Fiscais',
        href: '/fiscal-notes?tab=entrada',
        roles: [
            'ADMINISTRATIVO',
            'PROPRIETARIO',
            'GERENTE',
            'COMPRADOR',
            'ESTOQUISTA',
        ],
        steps: [
            {
                selector: '[data-tour="entrada-download-mode"]',
                title: 'Por mês ou por período',
                text: 'Escolha se quer baixar as notas de um mês inteiro ou de um intervalo de datas específico.',
            },
            {
                selector: '[data-tour="entrada-download-period"]',
                title: 'Escolha a data',
                text: 'Selecione o mês (ou o período) que você quer baixar.',
            },
            {
                selector: '[data-tour="entrada-download-button"]',
                title: 'Baixar todas as NFs',
                text: 'Pronto! Clique aqui pra baixar um .zip com todas as notas desse período.',
            },
        ],
    },
    {
        id: 'criar-tarefa',
        title: 'Como criar uma tarefa',
        description: 'Cadastrar uma tarefa diária, semanal, mensal ou ocasional pra alguém da equipe.',
        category: 'Tarefas',
        href: '/tasks?tab=gerenciar',
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'],
        steps: [
            {
                selector: '[data-tour="task-new-button"]',
                title: 'Nova tarefa',
                text: 'Clique aqui pra abrir o formulário de criação.',
            },
            {
                selector: '[data-tour="task-form-title"]',
                title: 'Título',
                text: 'Dê um nome curto e direto pra tarefa.',
            },
            {
                selector: '[data-tour="task-form-assignee"]',
                title: 'Responsável',
                text: 'Escolha quem vai executar a tarefa — só aparece gente vinculada à loja marcada acima.',
            },
            {
                selector: '[data-tour="task-form-recurrence"]',
                title: 'Frequência',
                text: 'Diária, semanal, mensal ou só uma vez (ocasional). Os campos abaixo mudam de acordo com a escolha.',
            },
            {
                selector: '[data-tour="task-form-submit"]',
                title: 'Cadastrar tarefa',
                text: 'Pronto! Clique aqui pra salvar. A tarefa aparece no Quadro na hora certa.',
            },
        ],
    },
    {
        id: 'gerar-conta-a-pagar',
        title: 'Como gerar uma conta a pagar',
        description: 'Registrar um boleto, PIX, cartão ou transferência pra pagar.',
        category: 'Contas a Pagar',
        href: '/bills/new',
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'FINANCEIRO'],
        steps: [
            {
                selector: '[data-tour="bill-form-description"]',
                title: 'Descrição',
                text: 'Descreva do que se trata essa conta.',
            },
            {
                selector: '[data-tour="bill-form-value"]',
                title: 'Valor',
                text: 'Informe o valor a pagar.',
            },
            {
                selector: '[data-tour="bill-form-duedate"]',
                title: 'Vencimento',
                text: 'A data limite pra pagar sem atraso.',
            },
            {
                selector: '[data-tour="bill-form-type"]',
                title: 'Tipo da conta',
                text: 'Boleto, PIX, cartão ou sem boleto — os campos abaixo mudam de acordo com a escolha (código de barras, chave PIX, dados bancários...).',
            },
            {
                selector: '[data-tour="bill-form-submit"]',
                title: 'Salvar conta',
                text: 'Pronto! Clique aqui pra cadastrar. A conta entra na lista de Contas a Pagar.',
            },
        ],
    },
    {
        id: 'conciliar-conta-a-pagar',
        title: 'Como conciliar contas a pagar',
        description: 'Importar o extrato do banco (.ofx) e confirmar quais contas já foram pagas.',
        category: 'Contas a Pagar',
        href: '/bills/reconcile',
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'FINANCEIRO'],
        steps: [
            {
                selector: '[data-tour="reconcile-import-button"]',
                title: 'Importar extrato OFX',
                text: 'Exporte o extrato do internet banking em formato .ofx e importe aqui. Clique pra escolher o arquivo.',
            },
            {
                selector: '[data-tour="reconcile-select-bill"]',
                title: 'Conta correspondente',
                text: 'Pra cada saída do extrato, escolha a conta em aberto que bate com ela. Quando só existe uma opção com o mesmo valor, o sistema já sugere sozinho.',
            },
            {
                selector: '[data-tour="reconcile-confirm-button"]',
                title: 'Confirmar',
                text: 'Pronto! Clique aqui pra marcar a conta como paga nessa data.',
            },
        ],
    },
];

export function getVisibleTours(role: MenuRole, isDemo?: boolean): Tour[] {
    // Conta de teste (isDemo) enxerga tudo, igual ao menu — o papel dela
    // continua Gerente por baixo, mas ela pode circular pela tela toda.
    if (isDemo) return tours;

    return tours.filter((tour) => tour.roles.includes(role));
}
