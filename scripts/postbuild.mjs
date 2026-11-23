// GitHub Pages: deep-link fallback + disable Jekyll so _-prefixed files are served.
import { copyFileSync, writeFileSync } from 'node:fs'
copyFileSync('docs/index.html', 'docs/404.html')
writeFileSync('docs/.nojekyll', '')
console.log('postbuild: wrote docs/404.html and docs/.nojekyll')
