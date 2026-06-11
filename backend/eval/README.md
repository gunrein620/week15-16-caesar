# Search Evaluation

`golden.jsonl` is a small seed set for archive search quality checks.
Each row has a user question and a broad expectation:

```json
{"question": "...", "expect": {"source_type": "youtube", "title_contains_any": ["러브어택"]}}
```

Run it from `backend/`:

```bash
.venv/bin/python -m app.cli eval-search --golden eval/golden.jsonl
```

To expand the set, collect real submitted queries from `analytics_events` where
`event_name = 'archive_search_submit'` and read `metadata.query`. Add rows for
queries that represent common member, song, video, briefing, and help-post
lookups. Keep `title_contains_any` broad enough to survive small title changes,
and set `source_type` to `null` when either a post or YouTube source is valid.
