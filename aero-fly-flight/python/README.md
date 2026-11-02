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
python python/pipeline.py --mode adsb                     # snapshot de tráfego REAL
python python/pipeline.py --mode daemon --interval 30     # execução contínua
python python/pipeline.py --mode daemon --interval 45 --adsb  # contínua + ADS-B real
```

### Modos

| Modo     | O que faz                                                                          |
|----------|------------------------------------------------------------------------------------|
| `seed`   | Carga inicial: companhias, aeroportos, malha de ontem/hoje e eventos recentes.     |
| `tick`   | Um (ou N) ciclo: embarques, decolagens, pousos, atrasos, cancelamentos.            |
| `adsb`   | **Dados reais**: snapshot do tráfego ADS-B sobre o Brasil (OpenSky) → `live_traffic`. |
| `daemon` | Loop contínuo de ticks — `--adsb` adiciona a ingestão de dados reais a cada ciclo. |

Toda execução grava um registro em `pipeline_runs` (origem `python`), visível no
chip **pipeline** do cabeçalho do dashboard.

## Observabilidade

- Log estruturado no stdout com contagens por ciclo (atualizados, cancelados,
  inseridos, eventos).
- Métricas por execução persistidas em `pipeline_runs` (duração, efeitos).
- Idempotência: inserções usam `ON CONFLICT DO NOTHING`, o seed não duplica dias.

## Dados reais — OpenSky Network (ADS-B)

O modo `adsb` ingere **tráfego aéreo real ao vivo**: posição, altitude,
velocidade, proa e callsign de todas as aeronaves rastreadas sobre o Brasil
(via rede colaborativa de sensores ADS-B do OpenSky Network). Os callsigns são
mapeados para as companhias monitoradas (TAM/LAN→LATAM, GLO→GOL, AZU→Azul,
PTB→Voepass).

```bash
python python/pipeline.py --mode adsb                    # 1 snapshot real
python python/pipeline.py --mode daemon --interval 45 --adsb   # contínuo
```

- **Anônimo** (sem credenciais): ~400 requisições/dia.
- **Autenticado (recomendado)**: crie um API client gratuito na sua conta
  OpenSky e exporte `OPENSKY_CLIENT_ID` e `OPENSKY_CLIENT_SECRET`
  (~4.000 requisições/dia, fluxo OAuth2 client credentials — gerenciado
  automaticamente pela pipeline).

Cada snapshot é persistido na tabela `live_traffic` (histórico para análises
futuras, ex.: densidade de tráfego por horário/região).

## Próximos passos (roadmap de dados)

1. Enriquecer horários programados e cancelamentos com APIs comerciais
   (AviationStack, FlightAware AeroAPI) ou Dados Abertos da ANAC — o ADS-B
   entrega posição/estado, não a malha programada.
2. Agendamento via Airflow/Dagster mantendo as mesmas funções de transformação.
3. Camada de qualidade de dados (great-expectations) antes do `load`.
