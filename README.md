# vaibhavbuilds.space

Holding page for Vaibhav Singh. Static single page, no build step.

- `index.html` is the whole site, served from the repo root
- `assets/js/scene.js` drives the Three.js laptop and the light/dark cycle (flips every 7s)
- `assets/vendor/three.module.min.js` is vendored, with a CDN fallback

Deploy: connect this repo on Netlify with no build command and no publish folder,
or drag the folder straight into the Netlify dashboard.
