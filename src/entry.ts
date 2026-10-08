import { Runtime } from 'foldkit'

import { Message, Model, init, subscriptions, update, view } from './main'

const application = Runtime.makeApplication({
  Model,
  init: () => init(window.location.href),
  update,
  view,
  subscriptions,
  container: document.getElementById('root'),
  devTools: {
    Message,
  },
})

Runtime.run(application)
