import '@fontsource/quicksand/500.css'
import '@fontsource/quicksand/600.css'
import '@fontsource/quicksand/700.css'
import './styles/base.css'
import './styles/shell.css'
import './styles/screens.css'
import './styles/buttons.css'
import './styles/reveal.css'
import './styles/report.css'
import './styles/detail.css'
import { LOGO_SRC } from './assets'
import { goTo, goBack, continueClick, restartFlow } from './router'
import { toggleAcc, handleNotify } from './screens'
import { LEADS_URL, postLead } from './api'
import { flushOutbox } from './outbox'

// Screens are HTML strings with inline onclick/onsubmit handlers, so these must be global.
Object.assign(window, { goTo, goBack, continueClick, restartFlow, toggleAcc, handleNotify })

document.getElementById('side-logo-wrap').innerHTML = `<img src="${LOGO_SRC}" alt="KYFR">`
;(document.getElementById('side-watermark') as HTMLImageElement).src = LOGO_SRC
goTo('welcome')
if (LEADS_URL) flushOutbox((lead) => postLead(LEADS_URL, lead)).catch(() => {})
