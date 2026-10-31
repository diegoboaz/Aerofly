# AeroFly — Pipeline de Dados (Python)

Pipeline ETL que automatiza o fluxo de dados da operação aérea monitorada pelo
dashboard AeroFly. Os dados sobem diretamente no PostgreSQL que alimenta a API
Next.js — **as duas pontas falam com o mesmo banco**, então tudo que a pipeline
processa aparece no dashboard em tempo real.

## Arquitetura

```
┌──────────────┐   EXTRACT    ┌────────────────┐  TRANSFORM  ┌──────────────┐
│ malha aérea  │ ───────────> │ normalização + │ ──────────> │  PostgreSQL  │
│ (sintética/  │              │ regras de      │             │  flights     │
│  ANAC futuro)│              │ status/atraso/ │             │  flight_events│
└──────────────┘              │ cancelamento   │             │  pipeline_runs│
                              └────────────────┘             └──────┬───────┘
                                                                    │ LOAD
                                                        ┌───────────▼───────────┐
                                                        │  API Next.js          │
                                                        │  /api/dashboard etc.  │
                                                        └───────────┬───────────┘
                                                        ┌───────────▼───────────┐
                                                        │  Dashboard em tempo   │
                                                        │  real (empresas)      │
                                                        └───────────────────────┘
```

## Como executar

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r python/requirements.txt

export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/app_db"

python python/pipeline.py --mode seed                     # carga inicial (idempotente)
python python/pipeline.py --mode tick                     # 1 ciclo operacional
python python/pipeline.py --mode tick --ticks 10 --interval 5
python python/pipeline.py --mode daemon --interval 30     # execução contínua
```

### Modos

| Modo     | O que faz                                                                          |
|----------|------------------------------------------------------------------------------------|
| `seed`   | Carga inicial: companhias, aeroportos, malha de ontem/hoje e eventos recentes.     |
| `tick`   | Um (ou N) ciclo: embarques, decolagens, pousos, atrasos, cancelamentos.            |
| `daemon` | Loop contínuo de ticks — é o modo recomendado em produção (ex.: cron/systemd).     |

Toda execução grava um registro em `pipeline_runs` (origem `python`), visível no
chip **pipeline** do cabeçalho do dashboard.

## Observabilidade

- Log estruturado no stdout com contagens por ciclo (atualizados, cancelados,
  inseridos, eventos).
- Métricas por execução persistidas em `pipeline_runs` (duração, efeitos).
- Idempotência: inserções usam `ON CONFLICT DO NOTHING`, o seed não duplica dias.

## Próximos passos (roadmap de dados)

1. Substituir o `extract_*` sintético por fontes reais (ANAC — Dados Abertos,
   APIs de rastreamento de voo).
2. Agendamento via Airflow/Dagster mantendo as mesmas funções de transformação.
3. Camada de qualidade de dados (great-expectations) antes do `load`.
