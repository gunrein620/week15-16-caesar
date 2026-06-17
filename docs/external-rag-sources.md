# External Snack RAG Sources

The AI judgement flow uses internal site precedents first. These external sources are only fallback learning material when there are fewer than three similar internal precedents.

The seed command stores source URL metadata and project-authored summaries in `RagDocument`. It does not copy full article bodies into the database.

## Seed Command

```bash
npm run rag:seed
```

## Source Set

| Source | URL | Category | RAG Use |
| --- | --- | --- | --- |
| Harvard Nutrition Source: The Science of Snacking | https://nutritionsource.hsph.harvard.edu/snacking/ | snacking behavior | Distinguish planned snacks from distracted grazing and use hunger, energy dips, portion, and meal gaps as judgement context. |
| Cleveland Clinic: Should You Eat Before or After a Workout? | https://health.clevelandclinic.org/what-to-eat-before-and-after-a-workout | workout fuel | Treat pre/post workout snacks as potentially justified when tied to energy, recovery, and timing. |
| AP News: When should you eat before, after, or during exercise? | https://apnews.com/article/14e2af96a01c594fa8ab37ebd97c5b5b | workout fuel | Avoid rigid fasted-workout myths and keep judgement light, contextual, and non-medical. |
| Health.com: Healthy Snack Ideas | https://www.health.com/healthy-snacks-7111830 | diet snacking | Use snack-as-bridge, portion awareness, fiber, protein, and food-group balance as fallback context. |
| Real Simple: Low-Sugar Snacks That Keep You Satisfied | https://www.realsimple.com/low-sugar-snacks-11976244 | craving response | Handle sweet-craving cases without guilt language, focusing on stable energy and satisfying alternatives. |
| Good Housekeeping: Healthy Snacks for Weight Loss | https://www.goodhousekeeping.com/health/diet-nutrition/g576/healthy-snacks/ | diet snacking | Keep diet-related reasoning gentle and avoid body-shaming or calorie punishment. |
| Verywell Health: Eat Before or After a Workout | https://www.verywellhealth.com/eat-before-or-after-workout-11729140 | workout fuel | Add general pre/post workout snack timing and recovery context when internal precedents are sparse. |

## Policy

- Internal `판례` posts outrank all external material.
- Community vote conclusions outrank old AI judgement conclusions.
- External documents are not displayed as site precedents.
- External documents must not produce medical advice. They are only lightweight context for the playful court tone.
- Future upgrade path: embed `RagDocument` content into `RagEmbedding.embeddingJson`, then migrate to PostgreSQL pgvector for proper semantic retrieval.
