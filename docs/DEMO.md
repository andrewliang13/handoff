# Demo video

Script for a 90–120 second screen recording of the Northline Labs sample. Read the lines while you click. About 100 seconds if you keep the pauses short.

Record from a local `npm run dev` session on `/handoff`, with no `MODEL_API_KEY`, so the sample path stays on the fixture.

## 1. Problem (10s)

Start on `/` or a blank beat before the app.

> When an engineering manager leaves, Monday depends on things that were never written down: who owns the Thursday deploy, which window pages someone for six hours, what the director wants instead of a slide deck.

## 2. Play sample handoff (30s)

Open [http://localhost:3000/handoff](http://localhost:3000/handoff). Click **Play sample handoff**. Leave the Departing leader tab up long enough to show the transcript, then scroll until the playbook heading **Northline Labs** is on screen.

> This is Maya Chen, Platform engineering manager at Northline Labs. Her last day is Friday. Play sample handoff loads her interview and the day-1 playbook from the fixture. The note under the tabs says it loaded on this page, with no API call. You can run this sample with no Meta key.

Point at the line: "Sample handoff. Loaded on this page, no API call."

## 3. Playbook and a citation (30s)

Scroll to **Landmines**. Click the weekend deploy freeze claim. The transcript highlight should land on turn `t06`.

> Every claim cites a turn from the interview. This landmine says deploys freeze from Friday 16:00 to Monday 10:00 Pacific. A Friday ship in February paged Chris for six hours. The citation is t06. Clicking it jumps to Maya's line in the transcript.

Read the highlighted turn if it fits: the freeze window, and that rotating the wrong 1Password webhook secret stops invoices. One claim is enough if the clock is tight. Stay on `t06`.

## 4. A covered question, then an abstain (20s)

Switch to **Successor**. In **Ask the handoff**, submit:

`Who owns the deploy pipeline?`

> Jonah Hale owns the deploy pipeline. The answer cites the interview, including t02.

Then submit a question the interview never reaches:

`What is the Platform hiring budget?`

> The page abstains: "not covered in handoff." The interview never named a hiring budget, so Handoff does not supply one.

If the first answer is slow, read Jonah's name off the role map while the answer comes back, then go straight to the budget question.

## 5. Meta models (10s)

Stay on the playbook. No extra click.

> The live path uses Muse Voice Transcribe for the audio, Muse Spark or Muse Wonder for the interview and the playbook, and Muse Image for an illustration. This recording used the local Northline fixture. A live call needs MODEL_API_KEY and hackathon credits. There is no fine-tune.

## Submit checklist

Check these when you submit. They are open until then.

- [ ] Indie track
- [ ] Build for Your World
- [ ] Repo URL: https://github.com/andrewliang13/handoff
- [ ] Demo URL, once the app is deployed
- [ ] Video file from this script

Put the demo URL on the form after deploy. Attach the video file after you record it.
