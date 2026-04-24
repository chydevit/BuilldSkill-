# Design

## Approach

- Build a static web app that runs by opening `index.html`.
- Keep all state in browser localStorage.
- Keep implementation in `index.html`, `styles.css`, and `script.js`.
- Make the generated files readable so they can become a real project starting point.

## Data Model

```json
{
  "items": [
    { "id": "string", "text": "string", "done": false }
  ],
  "theme": "light"
}
```

## Notes

- Theme preference is stored separately from item data.
- Item data stays text-first for broad app compatibility.
