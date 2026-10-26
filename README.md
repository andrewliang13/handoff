# Handoff

A departing leader does a voice or text exit interview. Handoff turns that interview into a day-1 playbook. Each claim cites the transcript turn it came from. The successor can ask questions against the playbook. When the interview did not cover the topic, the product abstains.

Meta Global AI Developer Hackathon, Indie track, Build for Your World.

Repository: https://github.com/andrewliang13/handoff

## Northline Labs

The demo company is Northline Labs. Maya Chen manages Platform engineering and her last day is Friday. Her interview is `fixtures/northline-transcript.json`. The cited playbook is `fixtures/northline-playbook.json`.

The home page renders that playbook from the fixture files. On `/handoff`, **Play sample handoff** loads the same interview and playbook in the browser. The page marks it as a sample and does not call the Meta API for that load.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000/handoff](http://localhost:3000/handoff) and click **Play sample handoff**. Use Departing leader to see the interview, then Successor to read the playbook, open a citation, and ask a question.

`MODEL_API_KEY` is optional. Copy `.env.example` to `.env.local` and set it when you want live Meta calls. `.env.local` stays untracked. With the key unset, transcription, text, and image helpers return mock responses, and the sample handoff still loads.

## Models

Intended models:

- Muse Voice Transcribe (`muse-voice-transcribe-1.0`) for the leader's audio
- Muse Spark (`muse-spark-1.3`) and Muse Wonder for interview turns, playbook synthesis, and successor answers
- Muse Image (`muse-image-1.0`) for a handoff illustration

The client sends those requests to `https://api.meta.ai/v1` with `Authorization: Bearer <MODEL_API_KEY>`. Text completions currently send `muse-spark-1.3`.

## Routes

| Path | Role |
| --- | --- |
| `/` | Home page. Renders the Northline fixture playbook. |
| `/handoff` | Exit interview, playbook, citations, and successor questions. |
| `POST /api/sessions` | Create a session. |
| `GET /api/sessions/[id]` | Read a session. |
| `PATCH /api/sessions/[id]` | Update the transcript or status. |
| `POST /api/voice` | Save audio and transcribe it. |
| `POST /api/interview` | Next interview question. |
| `POST /api/synthesize` | Write the cited playbook. |
| `POST /api/qa` | Successor question. Cited answer, or abstain. |
| `POST /api/image` | Illustration for the handoff. |

## Limitations

- No fine-tune. The app calls the hosted Muse models as published.
- Fixture Q&A is local. Questions against the sample handoff stay on the Northline interview stored in the repo.
- Live Meta calls need `MODEL_API_KEY` and hackathon credits. A missing key returns mocks.

The recording script and submit checklist are in [docs/DEMO.md](docs/DEMO.md).
