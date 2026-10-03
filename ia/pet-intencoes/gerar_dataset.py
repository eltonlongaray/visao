"""Gera o dataset de frases de treino do classificador de intenção do Pet.

Cada intenção tem modelos de frase com lacunas ({ativ}, {dia}, {hora}...). O
script preenche as lacunas com valores sorteados e grava dados/frases.csv.

As frases de TESTE (dados/teste_real.csv) são escritas à mão e não saem destes
modelos, pra medir se o classificador generaliza ou só decorou os modelos.

Uso: python3 gerar_dataset.py
"""
import csv
import random
from pathlib import Path

random.seed(42)
POR_INTENCAO = 160  # frases por intenção

ATIV = ['academia', 'mercado', 'reunião', 'leitura', 'meditação', 'corrida',
        'dentista', 'estudo', 'treino de perna', 'aula de inglês', 'yoga',
        'faculdade', 'jiu-jitsu', 'consulta', 'trabalho', 'almoço com a mãe',
        'caminhada', 'fisioterapia', 'curso', 'oração', 'natação', 'banco',
        'massagem', 'reunião do projeto', 'devocional', 'muay thai', 'psicóloga']
DIA = ['hoje', 'amanhã', 'segunda', 'terça', 'quarta', 'quinta', 'sexta',
       'sábado', 'domingo', 'dia 12', 'dia 25/10', 'semana que vem',
       'segunda-feira', 'sexta que vem', 'depois de amanhã']
HORA = ['às 8', 'às 7h', '15h', 'às 9:30', 'às 18 horas', '20h30',
        'às 6 da manhã', 'às 3 da tarde', 'meio-dia', 'às 10', '19:00', '']
NOVO = ['musculação', 'treino A', 'leitura bíblica', 'corrida leve',
        'reunião semanal', 'estudo de python', 'mercado do mês', 'pilates']
DESC = ['levar documento', 'treino de costas', 'pauta trimestral',
        'comprar arroz e feijão', 'capítulo 5', 'levar exames']
REC = ['toda semana', 'todo dia', 'todo mês', 'de segunda a sexta',
       'toda segunda', 'a cada 15 dias', 'todo sábado', 'dias úteis']
TIPO = ['tarefa', 'compromisso', 'atividade', '']

MODELOS = {
    'agendar': [
        'agendar {tipo} {ativ} {dia} {hora}', 'agenda {ativ} {dia} {hora}',
        'marcar {ativ} {dia} {hora}', 'marca {ativ} pra {dia} {hora}',
        'registrar {tipo} {ativ} {dia}', 'registra que eu fiz {ativ} {dia}',
        'coloca {ativ} na agenda {dia} {hora}', 'bota {ativ} {dia} {hora}',
        'quero agendar {ativ} {dia}', 'preciso marcar {ativ} {dia} {hora}',
        'cria um compromisso de {ativ} {dia} {hora}', 'me lembra de {ativ} {dia} {hora}',
        'adiciona {ativ} {dia} {hora}', 'anota {ativ} {dia} {hora}',
        'já fiz {ativ} hoje, registra aí', 'hoje eu fiz {ativ}',
        'tenho {ativ} {dia} {hora}', 'vou ter {ativ} {dia} {hora}, marca pra mim',
        'pode agendar {ativ} pra {dia}?', 'agendar compromisso {dia} {hora} título {ativ}',
        'nova tarefa {ativ} {dia}', 'inclui {ativ} {dia} {hora}',
    ],
    'editar_nome': [
        'editar nome da {tipo} {ativ} para {novo}', 'muda o nome de {ativ} pra {novo}',
        'renomear {ativ} para {novo}', 'troca o nome da {tipo} {ativ} por {novo}',
        'renomeia {ativ} pra {novo}', 'quero mudar o nome de {ativ} para {novo}',
        'o nome de {ativ} agora é {novo}', 'altera o título de {ativ} pra {novo}',
        'muda o título da {tipo} {ativ} para {novo}', 'corrige o nome {ativ} pra {novo}',
    ],
    'editar_horario': [
        'editar horário do {tipo} {ativ} para {hora}', 'muda o horário de {ativ} pra {hora}',
        'troca a hora da {ativ} pra {hora}', '{ativ} agora é {hora}',
        'passa {ativ} pra {hora}', 'altera a hora de {ativ} para {hora}',
        'adianta {ativ} pra {hora}', 'atrasa {ativ} pra {hora}',
        'quero mudar o horário da {ativ}', '{ativ} mudou de horário, coloca {hora}',
        'editar hora do compromisso {ativ} para {hora}',
    ],
    'editar_descricao': [
        'editar descrição do {tipo} {ativ} para {desc}', 'muda a descrição de {ativ} pra {desc}',
        'coloca na descrição de {ativ}: {desc}', 'adiciona a nota {desc} em {ativ}',
        'troca o detalhe da {ativ} para {desc}', 'altera a observação de {ativ} pra {desc}',
        'escreve {desc} na descrição da {ativ}', 'a nota da {ativ} é {desc}',
        'atualiza a descrição de {ativ}', 'editar nota da tarefa {ativ} para {desc}',
    ],
    'reagendar': [
        'reagendar {tipo} {ativ} para {dia}', 'reagenda {ativ} pra {dia}',
        'mover {tipo} {ativ} para {dia}', 'joga {ativ} pra {dia}',
        'passa {ativ} pra {dia}', 'adia {ativ} pra {dia}',
        'empurra {ativ} pra {dia}', 'muda {ativ} pro dia {dia}',
        'não vou conseguir {ativ} hoje, joga pra {dia}', 'transfere {ativ} pra {dia} {hora}',
        'remarca {ativ} pra {dia}', 'troca o dia da {ativ} pra {dia}',
    ],
    'lembrete_ligar': [
        'adicionar lembrete na {tipo} {ativ}', 'liga o lembrete de {ativ}',
        'ativa o sininho da {ativ}', 'coloca lembrete em {ativ}',
        'me avisa antes de {ativ}', 'quero ser lembrado da {ativ}',
        'bota o sino na {ativ}', 'ativar lembrete do compromisso {ativ}',
        'põe lembrete na {ativ}', 'liga a notificação de {ativ}',
        'marcar lembrete na tarefa {ativ}',
    ],
    'lembrete_desligar': [
        'tirar lembrete da {tipo} {ativ}', 'desliga o lembrete de {ativ}',
        'desativa o sininho da {ativ}', 'remove o lembrete de {ativ}',
        'não precisa me lembrar da {ativ}', 'para de me avisar da {ativ}',
        'tira o sino da {ativ}', 'cancela o lembrete do compromisso {ativ}',
        'apaga o lembrete de {ativ}', 'sem lembrete na {ativ}',
        'desliga a notificação de {ativ}',
    ],
    'repetir': [
        'repetir {tipo} {ativ} {rec}', 'repete {ativ} {rec}',
        'editar repetição do {tipo} {ativ} para {rec}', '{ativ} {rec}, coloca repetição',
        'faz {ativ} se repetir {rec}', 'quero que {ativ} repita {rec}',
        'deixa {ativ} fixa {rec}', 'coloca {ativ} pra repetir {rec}',
        'a {ativ} é {rec}', 'recorrência de {ativ} {rec}',
    ],
    'consultar_sono': [
        'quanto eu dormi', 'quantas horas dormi hoje', 'como foi meu sono',
        'que horas eu acordei', 'dormi bem essa noite?', 'meu sono essa semana',
        'quanto tempo de sono', 'me mostra meu sono', 'que horas fui dormir ontem',
        'tô dormindo pouco?', 'média de sono', 'horas de sono da semana',
    ],
    'consultar_sequencia': [
        'qual minha sequência', 'quantos dias seguidos eu tenho', 'minha streak',
        'tô quantos dias sem falhar?', 'minha constância', 'quantos dias em sequência',
        'como tá minha sequência', 'qual meu recorde de dias seguidos',
        'falhei quantas vezes essa semana?', 'minha consistência',
    ],
    'consultar_agua': [
        'quanta água eu bebi', 'quanto falta de água hoje', 'minha hidratação',
        'bebi água suficiente?', 'quantos ml eu tomei', 'meta de água',
        'como tá minha água', 'quantos copos de água hoje', 'tô hidratado?',
        'quanto de água devo beber',
    ],
    'consultar_tarefas': [
        'o que eu tenho hoje', 'minhas tarefas', 'lista de hoje', 'o que tem pra amanhã',
        'quais meus compromissos {dia}', 'minha agenda {dia}', 'o que falta fazer hoje',
        'mostra minhas tarefas de {dia}', 'tenho algo marcado {dia}?',
        'como tá minha semana', 'o que eu tenho {dia}', 'quais atividades faltam',
    ],
    'ajuda_notificacoes': [
        'como instalar o app', 'as notificações não chegam', 'não recebo aviso',
        'como ativar notificação', 'como coloco o app na tela inicial',
        'o lembrete não tocou', 'notificação não aparece no iphone',
        'como habilitar pop up', 'não vibra quando chega aviso', 'instalar no android',
        'como baixar o app no celular', 'o aviso não chega no meu celular',
    ],
    'ajuda': [
        'ajuda', 'o que você faz', 'o que você sabe fazer', 'quais comandos',
        'me ajuda', 'como você funciona', 'help', 'o que posso te pedir',
        'como falo com você', 'me ensina a usar', 'não sei usar isso',
        'quais são suas funções',
    ],
    'saudacao': [
        'oi', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'e aí', 'opa',
        'tudo bem?', 'obrigado', 'valeu', 'show', 'beleza', 'tchau', 'até mais',
        'oi pet', 'fala pet', 'obrigada', 'massa', 'top',
    ],
}

# Variações de escrita de chat: sem acento, abreviado, minúsculo, com "pet" na frente
PREFIXOS = ['', '', '', 'pet, ', 'ei, ', 'por favor ', 'pode ', 'rapidinho, ']
SUFIXOS = ['', '', '', ' por favor', ' pfv', '?', '!', ' aí']
SEM_ACENTO = str.maketrans('áàâãéêíóôõúç', 'aaaaeeiooouc')


def preencher(modelo: str) -> str:
    frase = modelo.format(
        ativ=random.choice(ATIV), dia=random.choice(DIA), hora=random.choice(HORA),
        novo=random.choice(NOVO), desc=random.choice(DESC), rec=random.choice(REC),
        tipo=random.choice(TIPO),
    )
    frase = random.choice(PREFIXOS) + frase + random.choice(SUFIXOS)
    if random.random() < 0.35:
        frase = frase.translate(SEM_ACENTO)
    if random.random() < 0.15:
        frase = frase.replace('você', 'vc').replace('pra ', 'p ').replace('hoje', 'hj')
    if random.random() < 0.2:
        frase = frase.capitalize()
    return ' '.join(frase.split())


def main():
    linhas = []
    for intencao, modelos in MODELOS.items():
        vistas = set()
        tentativas = 0
        while len(vistas) < POR_INTENCAO and tentativas < POR_INTENCAO * 20:
            tentativas += 1
            vistas.add(preencher(random.choice(modelos)))
        linhas += [(f, intencao) for f in sorted(vistas)]
    random.shuffle(linhas)
    saida = Path(__file__).parent / 'dados' / 'frases.csv'
    with saida.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['frase', 'intencao'])
        w.writerows(linhas)
    print(f'{len(linhas)} frases, {len(MODELOS)} intenções → {saida}')


if __name__ == '__main__':
    main()
