# AeroFly — Radar Operacional de Voos no Brasil

Sistema de acompanhamento em tempo real do fluxo de voos concluídos e das
situações de cancelamento no Brasil, para que companhias aéreas e operadores
entendam como a operação tem desempenhado em prol dos consumidores.

![Stack](https://img.shields.io/badge/Next.js-16-black) ![db](https://img.shields.io/badge/PostgreSQL-Drizzle-blue) ![py](https://img.shields.io/badge/Pipeline-Python-yellow)

## O que o sistema faz

- **Mapa vivo da malha aérea nacional** — voos em andamento sobre o território,
  rotas coloridas por companhia e aeroportos pulsando conforme a atividade.
- **KPIs operacionais** — voos do dia, concluídos, em voo, atrasados,
  cancelados e taxa de cancelamento (com meta operacional).
- **Situação dos voos** — distribuição por status e fluxo horário (BRT) com
  destaque para cancelamentos.
- **Desempenho por companhia** — volume, pontualidade, taxa de cancelamento e
  sinalização de atenção.
- **Rotas mais movimentadas** e **feed de eventos** (partidas, chegadas,
  atrasos e cancelamentos com motivo).
- **Tabela de voos** com busca, filtros por status/companhia e paginação.
- **Exportação CSV** da programação do dia.
- **Pipeline Python integrada** (ETL) que automatiza o processo de dados —
  ver [`python/README.md`](python/README.md).

## Stack

| Camada    | Tecnologia                                                        |
|-----------|-------------------------------------------------------------------|
| Front/API | Next.js 16 (App Router), React 19, Tailwind CSS 4, Recharts       |
| Banco     | PostgreSQL + Drizzle ORM                                          |
| Dados     | Pipeline ETL em Python (`python/pipeline.py`) + motor web espelho |

## Executando

```bash
# 1. aplicação web
npm install
npm run dev                      # http://localhost:3000

# 2. banco (schema)
npx drizzle-kit push

# 3. pipeline de dados (opcional — a aplicação tem motor de fallback)
pip install -r python/requirements.txt
python python/pipeline.py --mode seed
python python/pipeline.py --mode daemon --interval 30
```

## API

| Rota                | Descrição                                              |
|---------------------|--------------------------------------------------------|
| `GET /api/dashboard` | Agregações do dashboard (KPIs, gráficos, feed, mapa). |
| `GET /api/flights`   | Voos com filtros `status`, `airline`, `q`, `page`.    |
| `POST /api/simulate` | Executa ticks do motor operacional (fallback web).    |
| `GET /api/export`    | CSV dos voos do dia.                                   |
| `GET /api/health`    | Healthcheck.                                           |

## Roadmap

Este é um MVP propositalmente enxuto. Próximas evoluções:

1. Integração com dados reais (ANAC / APIs de rastreamento).
2. Alertas de SLA e notificações de cancelamento ao consumidor.
3. Previsão de atrasos/cancelamentos com ML sobre o histórico.
4. Perfis de acesso por companhia aérea.
