# Client logos

The trusted-by strip below the hero loads logos from this folder. The page
expects a file per slug listed in `TRUSTED_LOGOS` in `assets/app.js`:

| Slug              | Company                  |
| ----------------- | ------------------------ |
| kfh.svg           | Kuwait Finance House     |
| nbk.svg           | National Bank of Kuwait  |
| zain.svg          | Zain                     |
| boursa-kuwait.svg | Boursa Kuwait            |
| kipco.svg         | KIPCO                    |
| kfas.svg          | KFAS                     |
| agility.svg       | Agility                  |
| stc.svg           | stc                      |
| burgan-bank.svg   | Burgan Bank              |
| gulf-bank.svg     | Gulf Bank                |
| boubyan-bank.svg  | Boubyan Bank             |
| pwc.svg           | PwC                      |

## Format

- Prefer SVG. PNG also works — just change the extension in `app.js`.
- Single-color (black or white) logos work best; the strip is dark-navy and the
  CSS forces all logos to white with `filter: brightness(0) invert(1)`.
- Use a transparent background.
- Sized roughly 160 × 48 px target; the CSS caps each to those bounds.

## Behavior

When a slug's file is missing, the strip renders a styled wordmark fallback
(company name in `CODED_TYPE`) so the section never appears broken. Add the
file, no code change needed — refresh and the logo replaces the wordmark.
