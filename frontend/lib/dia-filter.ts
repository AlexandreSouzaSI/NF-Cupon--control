// Helpers do modo "Dia" do filtro de período (Venda/Lista). Datas viajam
// como string "AAAA-MM-DD" (mesmo formato do <input type="date">) e a conta
// de "dia anterior/próximo" é feita ao meio-dia UTC pra o fuso do
// navegador nunca fazer a data recuar/avançar um dia sozinha (mesmo truque
// do parseDateInput do backend).

// "Hoje" no calendário LOCAL do usuário (não UTC — toISOString viraria
// "amanhã" depois das 21h em Brasília).
export function hojeLocalISO(agora: Date = new Date()): string {
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

// Soma (ou subtrai) dias numa data AAAA-MM-DD.
export function somarDias(data: string, dias: number): string {
    const base = new Date(`${data}T12:00:00.000Z`);
    if (Number.isNaN(base.getTime())) return data;
    base.setUTCDate(base.getUTCDate() + dias);
    return base.toISOString().slice(0, 10);
}
